import {
  applyLayoutSetLogicEdgeState,
  getPhotoCollectionIdFromActionParams,
  reportScreenProfileRequestSchema,
  reportScreenProfileResponseSchema,
  reportScreenTargetSelectionSchema,
  resolveDisplaySequenceFromLogicGraph,
  screenFamilyLayoutTargetSchema,
  type AutoLayoutTarget,
  type PhotosOrientation,
  type ReportScreenProfileLayoutOption,
  type ReportScreenProfileRequest,
  type ReportScreenProfileResponse,
  type ReportScreenTargetSelection,
  type ScreenFamilyLayoutTarget,
  type ScreenProfileLayouts,
} from "@hearth/shared";
import {
  resolveLayoutLogicAction,
  resolveLayoutLogicCondition,
} from "../layout-logic/registry.js";
import type { LayoutRepository } from "../repositories/layout-repository.js";
import type { SettingsRepository } from "../repositories/settings-repository.js";

const DEFAULT_TARGET_CYCLE_SECONDS = 20;
const SESSION_STATE_TTL_MS = 12 * 60 * 60 * 1000;
const DEFAULT_SET_ID = "set-1";

const clampCycleSeconds = (value: number): number =>
  Math.max(3, Math.min(3600, Math.round(value)));

const toAutoOrientation = (
  orientation: PhotosOrientation | null,
): "portrait" | "landscape" | null => {
  if (orientation === "portrait" || orientation === "landscape") {
    return orientation;
  }

  return null;
};

const toAvailableSets = (mapping: ScreenProfileLayouts) =>
  Object.entries(mapping.families).map(([id, targets]) => ({
    id,
    name: targets.name,
  }));

const toAvailableLayouts = (
  names: string[],
): ReportScreenProfileLayoutOption[] =>
  names.map((name) => ({ name }));

const toRequestedTargetSelection = (
  payload: ReportScreenProfileRequest,
): ReportScreenTargetSelection =>
  payload.targetSelection
    ? reportScreenTargetSelectionSchema.parse(payload.targetSelection)
    : reportScreenTargetSelectionSchema.parse({
        kind: "set",
        setId: payload.selectedFamily ?? null,
      });

interface SessionCycleState {
  sequenceKey: string;
  index: number;
  nextCycleAtMs: number | null;
  lastSeenAtMs: number;
}

const toSequenceKey = (
  family: string,
  targets: AutoLayoutTarget[],
): string =>
  `${family}::${targets
    .map(
      (target) =>
        `${target.layoutName}:${clampCycleSeconds(target.cycleSeconds ?? DEFAULT_TARGET_CYCLE_SECONDS)}`,
    )
    .join("|")}`;

export class ScreenProfileService {
  private readonly sessionCycles = new Map<string, SessionCycleState>();

  constructor(
    private readonly layoutRepository: LayoutRepository,
    private readonly settingsRepository: SettingsRepository,
  ) {}

  reportScreenProfile(input: ReportScreenProfileRequest): ReportScreenProfileResponse {
    const payload = reportScreenProfileRequestSchema.parse(input);
    const nowMs = Date.now();
    this.pruneStaleSessions(nowMs);
    const mapping = this.settingsRepository.getScreenProfileLayouts();
    const availableSets = toAvailableSets(mapping);
    const availableLayouts = toAvailableLayouts(
      this.layoutRepository.listLayouts(false).map((layout) => layout.name),
    );
    const requestedTargetSelection = toRequestedTargetSelection(payload);
    const requestedSetId =
      requestedTargetSelection.kind === "set"
        ? requestedTargetSelection.setId
        : null;
    const selectedSet =
      (requestedSetId
        ? availableSets.find((set) => set.id === requestedSetId)
        : null) ?? availableSets[0] ?? null;
    const family = selectedSet?.id ?? DEFAULT_SET_ID;
    const familyTargets: ScreenFamilyLayoutTarget = selectedSet
      ? mapping.families[selectedSet.id]
      : screenFamilyLayoutTargetSchema.parse({});
    const requestedPhotoOrientation = payload.photoOrientation ?? null;
    const appliedPhotoOrientation =
      requestedTargetSelection.kind === "set"
        ? toAutoOrientation(requestedPhotoOrientation)
        : null;
    const resolution =
      requestedTargetSelection.kind === "layout"
        ? {
            layoutName: requestedTargetSelection.layoutName,
            nextCycleAtMs: null,
            selectedCycleSeconds: null,
            selectedPhotoCollectionId: null,
          }
        : this.resolveTargetLayout({
            familyId: family,
            familyTargets,
            appliedPhotoOrientation,
            nowMs,
            screenSessionId: payload.screenSessionId,
          });
    const targetLayout = resolution.layoutName
      ? this.layoutRepository.getByName(resolution.layoutName)
      : null;
    const autoCycleSeconds =
      resolution.selectedCycleSeconds ?? Math.max(3, mapping.autoCycleSeconds);
    const nextCycleAtMs = resolution.nextCycleAtMs;

    if (targetLayout) {
      return reportScreenProfileResponseSchema.parse({
        family,
        availableSets,
        availableLayouts,
        mode: mapping.switchMode,
        autoCycleSeconds,
        nextCycleAtMs,
        selectedPhotoCollectionId: resolution.selectedPhotoCollectionId,
        requestedPhotoOrientation,
        appliedPhotoOrientation,
        layout: targetLayout,
        reason: "resolved",
      });
    }

    const activeLayout = this.layoutRepository.getActiveLayout();
    if (activeLayout) {
      return reportScreenProfileResponseSchema.parse({
        family,
        availableSets,
        availableLayouts,
        mode: mapping.switchMode,
        autoCycleSeconds,
        nextCycleAtMs,
        selectedPhotoCollectionId: resolution.selectedPhotoCollectionId,
        requestedPhotoOrientation,
        appliedPhotoOrientation,
        layout: activeLayout,
        reason: "fallback-active",
      });
    }

    const firstLayout = this.layoutRepository.listLayouts(false)[0] ?? null;
    if (firstLayout) {
      return reportScreenProfileResponseSchema.parse({
        family,
        availableSets,
        availableLayouts,
        mode: mapping.switchMode,
        autoCycleSeconds,
        nextCycleAtMs,
        selectedPhotoCollectionId: resolution.selectedPhotoCollectionId,
        requestedPhotoOrientation,
        appliedPhotoOrientation,
        layout: firstLayout,
        reason: "fallback-first",
      });
    }

    return reportScreenProfileResponseSchema.parse({
      family,
      availableSets,
      availableLayouts,
      mode: mapping.switchMode,
      autoCycleSeconds,
      nextCycleAtMs,
      selectedPhotoCollectionId: resolution.selectedPhotoCollectionId,
      requestedPhotoOrientation,
      appliedPhotoOrientation,
      layout: null,
      reason: "no-layout",
    });
  }

  private pruneStaleSessions(nowMs: number): void {
    for (const [sessionKey, state] of this.sessionCycles.entries()) {
      if (nowMs - state.lastSeenAtMs > SESSION_STATE_TTL_MS) {
        this.sessionCycles.delete(sessionKey);
      }
    }
  }

  private resolveSessionTimedTarget(input: {
    targets: AutoLayoutTarget[];
    familyId: string;
    screenSessionId: string;
    nowMs: number;
  }): {
    target: AutoLayoutTarget | null;
    nextCycleAtMs: number | null;
  } {
    if (input.targets.length === 0) {
      return { target: null, nextCycleAtMs: null };
    }

    if (input.targets.length === 1) {
      return {
        target: input.targets[0],
        nextCycleAtMs: null,
      };
    }

    const sessionKey = `${input.screenSessionId}:${input.familyId}`;
    const sequenceKey = toSequenceKey(input.familyId, input.targets);
    const existing = this.sessionCycles.get(sessionKey);

    let state: SessionCycleState;
    if (!existing || existing.sequenceKey !== sequenceKey) {
      const initialDurationMs =
        clampCycleSeconds(
          input.targets[0]?.cycleSeconds ?? DEFAULT_TARGET_CYCLE_SECONDS,
        ) * 1000;
      state = {
        sequenceKey,
        index: 0,
        nextCycleAtMs: input.nowMs + initialDurationMs,
        lastSeenAtMs: input.nowMs,
      };
      this.sessionCycles.set(sessionKey, state);
    } else {
      state = existing;
      state.lastSeenAtMs = input.nowMs;
    }

    while (state.nextCycleAtMs !== null && input.nowMs >= state.nextCycleAtMs) {
      state.index = (state.index + 1) % input.targets.length;
      const durationMs =
        clampCycleSeconds(
          input.targets[state.index]?.cycleSeconds ?? DEFAULT_TARGET_CYCLE_SECONDS,
        ) * 1000;
      state.nextCycleAtMs += durationMs;
    }

    const target = input.targets[state.index] ?? null;
    return {
      target,
      nextCycleAtMs: state.nextCycleAtMs,
    };
  }

  private resolveTargetLayout(input: {
    familyId: string;
    familyTargets: ScreenFamilyLayoutTarget;
    appliedPhotoOrientation: "portrait" | "landscape" | null;
    nowMs: number;
    screenSessionId: string;
  }): {
    layoutName: string | null;
    nextCycleAtMs: number | null;
    selectedCycleSeconds: number | null;
    selectedPhotoCollectionId: string | null;
  } {
    const effectiveLogicGraph = applyLayoutSetLogicEdgeState({
      graph: input.familyTargets.logicGraph,
      edgeOverrides: input.familyTargets.logicEdgeOverrides,
      disconnectedEdgeIds: input.familyTargets.logicDisconnectedEdgeIds,
    });

    const sequence = resolveDisplaySequenceFromLogicGraph({
      graph: effectiveLogicGraph,
      orientation: input.appliedPhotoOrientation,
      evaluateCondition: resolveLayoutLogicCondition,
      resolveAction: resolveLayoutLogicAction,
    });

    if (sequence.length === 0) {
      return {
        layoutName: input.familyTargets.staticLayoutName,
        nextCycleAtMs: null,
        selectedCycleSeconds: null,
        selectedPhotoCollectionId: input.familyTargets.photoActionCollectionId ?? null,
      };
    }

    const timedResolution = this.resolveSessionTimedTarget({
      targets: sequence,
      familyId: input.familyId,
      screenSessionId: input.screenSessionId,
      nowMs: input.nowMs,
    });
    const selected = timedResolution.target;
    return {
      layoutName: selected?.layoutName ?? input.familyTargets.staticLayoutName,
      nextCycleAtMs: timedResolution.nextCycleAtMs,
      selectedCycleSeconds: selected
        ? clampCycleSeconds(selected.cycleSeconds ?? DEFAULT_TARGET_CYCLE_SECONDS)
        : null,
      selectedPhotoCollectionId:
        input.familyTargets.photoActionCollectionId ??
        getPhotoCollectionIdFromActionParams(selected?.actionParams) ??
        null,
    };
  }
}
