import {
  displayThemeIdSchema,
  applyLayoutSetLogicEdgeState,
  getPhotoCollectionIdFromActionParams,
  layoutRecordSchema,
  LOCAL_WARNING_AUTO_LAYOUT_LABEL,
  LOCAL_WARNING_AUTO_LAYOUT_NAME,
  LOCAL_WARNING_CONDITION_TYPE,
  LOCAL_WARNING_MODULE_ID,
  localWarningsModuleConfigSchema,
  reportScreenProfileRequestSchema,
  reportScreenProfileResponseSchema,
  reportScreenTargetSelectionSchema,
  resolveDisplaySequenceFromLogicGraph,
  screenFamilyLayoutTargetSchema,
  type AutoLayoutTarget,
  type LayoutRecord,
  type PhotosOrientation,
  type ReportScreenProfileLayoutOption,
  type ReportScreenProfileRequest,
  type ReportScreenProfileResponse,
  type ReportScreenTargetSelection,
  type ScreenFamilyLayoutTarget,
  type ScreenProfileLayouts,
} from "@hearth/shared";
import { resolveLayoutLogicAction, resolveLayoutLogicCondition } from "../layout-logic/registry.js";
import { isEscalatingLocalWarning, type LocalWarningService } from "./local-warning-service.js";
import type { DeviceRepository } from "../repositories/device-repository.js";
import type { LayoutRepository } from "../repositories/layout-repository.js";
import type { SettingsRepository } from "../repositories/settings-repository.js";

const DEFAULT_TARGET_CYCLE_SECONDS = 20;
const SESSION_STATE_TTL_MS = 12 * 60 * 60 * 1000;
const DEFAULT_SET_ID = "set-1";
const LOCAL_WARNING_LAYOUT_ID = 2_147_483_000;
const LOCAL_WARNING_MODULE_INSTANCE_ID = "local-warnings-auto";

const clampCycleSeconds = (value: number): number => Math.max(3, Math.min(3600, Math.round(value)));

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

const toAvailableLayouts = (names: string[]): ReportScreenProfileLayoutOption[] =>
  names.map((name) => ({ name }));

const createAutomaticWarningLayout = (
  actionParams: Record<string, unknown> | null | undefined,
): LayoutRecord =>
  layoutRecordSchema.parse({
    id: LOCAL_WARNING_LAYOUT_ID,
    name: LOCAL_WARNING_AUTO_LAYOUT_LABEL,
    active: false,
    version: 1,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date().toISOString(),
    config: {
      cols: 12,
      rows: 12,
      rowHeight: 54,
      typography: {},
      items: [
        {
          i: LOCAL_WARNING_MODULE_INSTANCE_ID,
          x: 0,
          y: 0,
          w: 12,
          h: 12,
        },
      ],
      modules: [
        {
          id: LOCAL_WARNING_MODULE_INSTANCE_ID,
          moduleId: LOCAL_WARNING_MODULE_ID,
          config: localWarningsModuleConfigSchema.parse({
            ...actionParams,
            refreshIntervalSeconds: 300,
          }),
        },
      ],
    },
  });

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

interface DeviceTargetCatalog {
  availableSets: { id: string; name: string }[];
  availableLayouts: ReportScreenProfileLayoutOption[];
  availableSetIds: Set<string>;
  availableLayoutNames: Set<string>;
}

type ValidateManagedDeviceTargetSelectionResult =
  | {
      ok: true;
      targetSelection: ReportScreenTargetSelection | null;
    }
  | {
      ok: false;
      message: string;
    };

const toSequenceKey = (family: string, targets: AutoLayoutTarget[]): string =>
  `${family}::${targets
    .map(
      (target) =>
        `${target.layoutName}:${clampCycleSeconds(target.cycleSeconds ?? DEFAULT_TARGET_CYCLE_SECONDS)}`,
    )
    .join("|")}`;

const createDeviceTargetCatalog = (input: {
  mapping: ScreenProfileLayouts;
  layoutNames: string[];
}): DeviceTargetCatalog => {
  const availableSets = toAvailableSets(input.mapping);
  const availableLayouts = toAvailableLayouts(input.layoutNames);

  return {
    availableSets,
    availableLayouts,
    availableSetIds: new Set(availableSets.map((set) => set.id)),
    availableLayoutNames: new Set(availableLayouts.map((layout) => layout.name)),
  };
};

const normalizeConfiguredTargetSelection = (input: {
  targetSelection: ReportScreenTargetSelection | null;
  targetCatalog: DeviceTargetCatalog;
}): ReportScreenTargetSelection | null => {
  const { targetSelection, targetCatalog } = input;

  if (!targetSelection) {
    return null;
  }

  if (targetSelection.kind === "set") {
    return targetSelection.setId !== null &&
      targetCatalog.availableSetIds.has(targetSelection.setId)
      ? targetSelection
      : null;
  }

  return targetSelection.layoutName !== null &&
    targetCatalog.availableLayoutNames.has(targetSelection.layoutName)
    ? targetSelection
    : null;
};

const validateManagedDeviceTargetSelection = (input: {
  targetSelection: ReportScreenTargetSelection | null;
  targetCatalog: DeviceTargetCatalog;
}): ValidateManagedDeviceTargetSelectionResult => {
  const { targetSelection, targetCatalog } = input;

  if (targetSelection === null) {
    return {
      ok: true,
      targetSelection: null,
    };
  }

  if (targetSelection.kind === "set") {
    if (targetSelection.setId === null) {
      return {
        ok: false,
        message: "Choose a set.",
      };
    }

    if (!targetCatalog.availableSetIds.has(targetSelection.setId)) {
      return {
        ok: false,
        message: `Set not found: ${targetSelection.setId}`,
      };
    }

    return {
      ok: true,
      targetSelection,
    };
  }

  if (targetSelection.layoutName === null) {
    return {
      ok: false,
      message: "Choose a layout.",
    };
  }

  if (!targetCatalog.availableLayoutNames.has(targetSelection.layoutName)) {
    return {
      ok: false,
      message: `Layout not found: ${targetSelection.layoutName}`,
    };
  }

  return {
    ok: true,
    targetSelection,
  };
};

export class ScreenProfileService {
  private readonly sessionCycles = new Map<string, SessionCycleState>();

  constructor(
    private readonly layoutRepository: LayoutRepository,
    private readonly settingsRepository: SettingsRepository,
    private readonly deviceRepository: DeviceRepository,
    private readonly localWarningService: LocalWarningService | null = null,
  ) {}

  validateManagedDeviceTargetSelection(
    targetSelection: ReportScreenTargetSelection | null,
  ): ValidateManagedDeviceTargetSelectionResult {
    return validateManagedDeviceTargetSelection({
      targetSelection,
      targetCatalog: this.getDeviceTargetCatalog(),
    });
  }

  reportScreenProfile(
    input: ReportScreenProfileRequest,
    options?: { lastSeenIp?: string | null },
  ): ReportScreenProfileResponse {
    const payload = reportScreenProfileRequestSchema.parse(input);
    const nowMs = Date.now();
    this.pruneStaleSessions(nowMs);
    const mapping = this.settingsRepository.getScreenProfileLayouts();
    const layoutNames = this.layoutRepository.listLayouts(false).map((layout) => layout.name);
    const targetCatalog = createDeviceTargetCatalog({
      mapping,
      layoutNames,
    });
    const { availableSets, availableLayouts } = targetCatalog;
    const requestedTargetSelection = normalizeConfiguredTargetSelection({
      targetSelection: toRequestedTargetSelection(payload),
      targetCatalog,
    });
    const reportedThemeResult = displayThemeIdSchema.safeParse(payload.reportedThemeId);
    const trackedDevice =
      payload.screenSessionId !== "default"
        ? this.deviceRepository.recordSeen({
            deviceId: payload.screenSessionId,
            reportedTargetSelection: requestedTargetSelection,
            reportedThemeId: payload.reportedThemeId,
            lastSeenIp: options?.lastSeenIp ?? null,
          })
        : {
            id: payload.screenSessionId,
            name: "Current display",
            themeId: reportedThemeResult.success ? reportedThemeResult.data : "default",
            targetSelection: requestedTargetSelection,
            createdAt: "",
            updatedAt: "",
            lastSeenAt: "",
          };
    const deviceTargetSelection = normalizeConfiguredTargetSelection({
      targetSelection: trackedDevice.targetSelection,
      targetCatalog,
    });
    const effectiveTargetSelection =
      deviceTargetSelection ??
      reportScreenTargetSelectionSchema.parse({
        kind: "set",
        setId: null,
      });
    const requestedSetId =
      effectiveTargetSelection.kind === "set" ? effectiveTargetSelection.setId : null;
    const selectedSet =
      (requestedSetId ? availableSets.find((set) => set.id === requestedSetId) : null) ??
      availableSets[0] ??
      null;
    const family = selectedSet?.id ?? DEFAULT_SET_ID;
    const familyTargets: ScreenFamilyLayoutTarget = selectedSet
      ? mapping.families[selectedSet.id]
      : screenFamilyLayoutTargetSchema.parse({});
    const requestedPhotoOrientation = payload.photoOrientation ?? null;
    const appliedPhotoOrientation =
      effectiveTargetSelection.kind === "set" ? toAutoOrientation(requestedPhotoOrientation) : null;
    const resolution =
      effectiveTargetSelection.kind === "layout"
        ? {
            layoutName: effectiveTargetSelection.layoutName,
            nextCycleAtMs: null,
            selectedCycleSeconds: null,
            selectedPhotoCollectionId: null,
            selectedActionParams: {},
            effectiveLogicGraph: null,
          }
        : this.resolveTargetLayout({
            familyId: family,
            familyTargets,
            appliedPhotoOrientation,
            nowMs,
            screenSessionId: payload.screenSessionId,
          });
    const warningTicker =
      effectiveTargetSelection.kind === "set"
        ? this.resolveWarningTicker({
            effectiveLogicGraph: resolution.effectiveLogicGraph,
          })
        : null;
    const targetLayout = resolution.layoutName
      ? resolution.layoutName === LOCAL_WARNING_AUTO_LAYOUT_NAME
        ? createAutomaticWarningLayout(resolution.selectedActionParams)
        : this.layoutRepository.getByName(resolution.layoutName)
      : null;
    const autoCycleSeconds =
      resolution.selectedCycleSeconds ?? Math.max(3, mapping.autoCycleSeconds);
    const nextCycleAtMs = resolution.nextCycleAtMs;
    const resolvedTargetSelection =
      effectiveTargetSelection.kind === "layout"
        ? reportScreenTargetSelectionSchema.parse({
            kind: "layout",
            layoutName: effectiveTargetSelection.layoutName,
          })
        : reportScreenTargetSelectionSchema.parse({
            kind: "set",
            setId: selectedSet?.id ?? null,
          });

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
        device: {
          id: trackedDevice.id,
          name: trackedDevice.name,
          themeId: trackedDevice.themeId,
          targetSelection: deviceTargetSelection,
        },
        resolvedTargetSelection,
        layout: targetLayout,
        warningTicker:
          resolution.layoutName === LOCAL_WARNING_AUTO_LAYOUT_NAME ? null : warningTicker,
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
        device: {
          id: trackedDevice.id,
          name: trackedDevice.name,
          themeId: trackedDevice.themeId,
          targetSelection: deviceTargetSelection,
        },
        resolvedTargetSelection,
        layout: activeLayout,
        warningTicker,
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
        device: {
          id: trackedDevice.id,
          name: trackedDevice.name,
          themeId: trackedDevice.themeId,
          targetSelection: deviceTargetSelection,
        },
        resolvedTargetSelection,
        layout: firstLayout,
        warningTicker,
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
      device: {
        id: trackedDevice.id,
        name: trackedDevice.name,
        themeId: trackedDevice.themeId,
        targetSelection: deviceTargetSelection,
      },
      resolvedTargetSelection,
      layout: null,
      warningTicker,
      reason: "no-layout",
    });
  }

  private getDeviceTargetCatalog(): DeviceTargetCatalog {
    const mapping = this.settingsRepository.getScreenProfileLayouts();
    const layoutNames = this.layoutRepository.listLayouts(false).map((layout) => layout.name);

    return createDeviceTargetCatalog({
      mapping,
      layoutNames,
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
        clampCycleSeconds(input.targets[0]?.cycleSeconds ?? DEFAULT_TARGET_CYCLE_SECONDS) * 1000;
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
    selectedActionParams: Record<string, unknown>;
    effectiveLogicGraph: ReturnType<typeof applyLayoutSetLogicEdgeState>;
  } {
    const effectiveLogicGraph = applyLayoutSetLogicEdgeState({
      graph: input.familyTargets.logicGraph,
      edgeOverrides: input.familyTargets.logicEdgeOverrides,
      disconnectedEdgeIds: input.familyTargets.logicDisconnectedEdgeIds,
    });

    const sequence = resolveDisplaySequenceFromLogicGraph({
      graph: effectiveLogicGraph,
      orientation: input.appliedPhotoOrientation,
      includeActivePhotoCollectionInActionParams: true,
      evaluateCondition: resolveLayoutLogicCondition,
      resolveAction: resolveLayoutLogicAction,
    });

    if (sequence.length === 0) {
      return {
        layoutName: input.familyTargets.staticLayoutName,
        nextCycleAtMs: null,
        selectedCycleSeconds: null,
        selectedPhotoCollectionId: input.familyTargets.photoActionCollectionId ?? null,
        selectedActionParams: {},
        effectiveLogicGraph,
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
        getPhotoCollectionIdFromActionParams(selected?.actionParams) ??
        input.familyTargets.photoActionCollectionId ??
        null,
      selectedActionParams:
        selected && selected.actionParams && typeof selected.actionParams === "object"
          ? selected.actionParams
          : {},
      effectiveLogicGraph,
    };
  }

  private resolveWarningTicker(input: {
    effectiveLogicGraph: ReturnType<typeof applyLayoutSetLogicEdgeState> | null;
  }) {
    if (!this.localWarningService || !input.effectiveLogicGraph) {
      return null;
    }

    const warningNodes = input.effectiveLogicGraph.nodes.filter(
      (node) =>
        node.type === "display" &&
        node.layoutName === LOCAL_WARNING_AUTO_LAYOUT_NAME &&
        node.conditionType === LOCAL_WARNING_CONDITION_TYPE,
    );

    if (warningNodes.length === 0) {
      return null;
    }

    const warningById = new Map<
      string,
      Awaited<ReturnType<LocalWarningService["listActiveWarnings"]>>[number]
    >();
    let locationLabel: string | null = null;

    for (const node of warningNodes) {
      const conditionParams =
        node.conditionParams && typeof node.conditionParams === "object"
          ? node.conditionParams
          : {};
      const warnings = this.localWarningService.listCachedActiveWarnings(conditionParams);
      const nextLocationLabel =
        typeof conditionParams.locationQuery === "string" && conditionParams.locationQuery.trim()
          ? conditionParams.locationQuery.trim()
          : null;
      if (!locationLabel && nextLocationLabel) {
        locationLabel = nextLocationLabel;
      }
      for (const warning of warnings) {
        if (
          isEscalatingLocalWarning({
            alertLevel: warning.alertLevel,
            severity: warning.severity,
            eventLabel: warning.eventLabel,
            categoryLabel: warning.categoryLabel,
            headline: warning.headline,
          })
        ) {
          continue;
        }
        warningById.set(warning.id, warning);
      }
    }

    if (warningById.size === 0) {
      return null;
    }

    return {
      locationLabel: locationLabel ?? "Local area",
      warnings: Array.from(warningById.values()),
    };
  }
}
