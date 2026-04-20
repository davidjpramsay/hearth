import interact from "interactjs";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildPlannerTimeSlots,
  comparePlannerTimes,
  DEFAULT_THEME_COLOR_SLOT,
  plannerMinutesToTime,
  plannerTimeToMinutes,
  type PlannerActivityBlockDraft,
  type PlannerDayWindowConfig,
  type PlannerUser,
} from "@hearth/shared";
import {
  getThemePaletteColorVar,
  getThemePaletteForegroundVar,
  getThemePaletteRgbVar,
} from "../../theme/theme";
import { getPlannerTimetableSlotHeight } from "./planner-timetable";

export interface PlannerEditorBlock extends PlannerActivityBlockDraft {
  clientId: string;
}

interface PlannerTimetableEditorProps {
  dayWindow: PlannerDayWindowConfig;
  users: PlannerUser[];
  blocks: PlannerEditorBlock[];
  selectedBlockId: string | null;
  disabled?: boolean;
  onChange: (blocks: PlannerEditorBlock[], nextSelectedBlockId?: string | null) => void;
  onSelectBlock: (blockId: string | null) => void;
  onInteractionStateChange?: (isInteracting: boolean) => void;
}

interface PlannerBlockGeometry {
  top: number;
  height: number;
}

interface PlannerCreateDraft {
  userId: number;
  startSlot: number;
  currentSlot: number;
  pointerId: number;
}

interface PlannerInteractState {
  clientId: string;
  mode: "move" | "resize-start" | "resize-end";
  startGeometry: PlannerBlockGeometry;
  currentGeometry: PlannerBlockGeometry;
  columnTop: number;
  pointerOffsetY: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const formatTimeLabel = (value: string): string => {
  const [hoursString, minutesString] = value.split(":");
  const hours = Number(hoursString);
  const minutes = Number(minutesString);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const sortBlocks = (blocks: PlannerEditorBlock[]): PlannerEditorBlock[] =>
  [...blocks].sort((left, right) => {
    if (left.userId !== right.userId) {
      return left.userId - right.userId;
    }

    const startComparison = comparePlannerTimes(left.startTime, right.startTime);
    if (startComparison !== 0) {
      return startComparison;
    }

    return comparePlannerTimes(left.endTime, right.endTime);
  });

const slotRangeToTimes = (
  startSlot: number,
  endSlotExclusive: number,
  dayWindow: PlannerDayWindowConfig,
): { startTime: string; endTime: string } => {
  const dayStartMinutes = plannerTimeToMinutes(dayWindow.startTime);
  const slotMinutes = dayWindow.slotMinutes;
  return {
    startTime: plannerMinutesToTime(dayStartMinutes + startSlot * slotMinutes),
    endTime: plannerMinutesToTime(dayStartMinutes + endSlotExclusive * slotMinutes),
  };
};

const blockToSlots = (
  block: PlannerEditorBlock,
  dayWindow: PlannerDayWindowConfig,
): { startSlot: number; endSlotExclusive: number } => {
  const dayStartMinutes = plannerTimeToMinutes(dayWindow.startTime);
  const slotMinutes = dayWindow.slotMinutes;
  const startDelta = plannerTimeToMinutes(block.startTime) - dayStartMinutes;
  const endDelta = plannerTimeToMinutes(block.endTime) - dayStartMinutes;
  return {
    startSlot: Math.floor(startDelta / slotMinutes),
    endSlotExclusive: Math.max(Math.ceil(endDelta / slotMinutes), 1),
  };
};

const blockToGeometry = (
  block: PlannerEditorBlock,
  dayWindow: PlannerDayWindowConfig,
  slotHeightPx: number,
): PlannerBlockGeometry => {
  const { startSlot, endSlotExclusive } = blockToSlots(block, dayWindow);
  return {
    top: startSlot * slotHeightPx,
    height: Math.max((endSlotExclusive - startSlot) * slotHeightPx, slotHeightPx),
  };
};

const geometryToSlotRange = (
  geometry: PlannerBlockGeometry,
  slotHeightPx: number,
  slotCount: number,
): { startSlot: number; endSlotExclusive: number } => {
  const startSlot = clamp(Math.round(geometry.top / slotHeightPx), 0, Math.max(slotCount - 1, 0));
  const durationSlots = clamp(
    Math.round(geometry.height / slotHeightPx),
    1,
    Math.max(slotCount - startSlot, 1),
  );
  return {
    startSlot,
    endSlotExclusive: startSlot + durationSlots,
  };
};

const snapPixelValue = (value: number, slotHeightPx: number): number =>
  Math.round(value / slotHeightPx) * slotHeightPx;

const getInteractClientY = (event: unknown): number | null => {
  const candidate = event as { clientY?: unknown; client?: { y?: unknown } };
  if (typeof candidate.clientY === "number") {
    return candidate.clientY;
  }

  if (typeof candidate.client?.y === "number") {
    return candidate.client.y;
  }

  return null;
};

const getMoveGeometryFromPointer = (
  state: PlannerInteractState,
  pointerY: number,
  slotHeightPx: number,
  totalHeight: number,
): PlannerBlockGeometry => {
  const maxTop = Math.max(totalHeight - state.startGeometry.height, 0);
  const nextTop = clamp(
    snapPixelValue(pointerY - state.columnTop - state.pointerOffsetY, slotHeightPx),
    0,
    maxTop,
  );
  return {
    top: nextTop,
    height: state.currentGeometry.height,
  };
};

const getResizeStartGeometryFromPointer = (
  state: PlannerInteractState,
  pointerY: number,
  slotHeightPx: number,
  totalHeight: number,
): PlannerBlockGeometry => {
  const fixedBottom = state.startGeometry.top + state.startGeometry.height;
  const nextTop = clamp(
    snapPixelValue(pointerY - state.columnTop, slotHeightPx),
    0,
    fixedBottom - slotHeightPx,
  );
  const nextHeight = clamp(fixedBottom - nextTop, slotHeightPx, totalHeight - nextTop);
  return {
    top: nextTop,
    height: nextHeight,
  };
};

const getResizeEndGeometryFromPointer = (
  state: PlannerInteractState,
  pointerY: number,
  slotHeightPx: number,
  totalHeight: number,
): PlannerBlockGeometry => {
  const nextBottom = clamp(
    snapPixelValue(pointerY - state.columnTop, slotHeightPx),
    state.startGeometry.top + slotHeightPx,
    totalHeight,
  );
  const nextHeight = clamp(
    nextBottom - state.startGeometry.top,
    slotHeightPx,
    totalHeight - state.startGeometry.top,
  );
  return {
    top: state.startGeometry.top,
    height: nextHeight,
  };
};

const buildCreatePreviewGeometry = (
  draft: PlannerCreateDraft,
  slotHeightPx: number,
): PlannerBlockGeometry => {
  const startSlot = Math.min(draft.startSlot, draft.currentSlot);
  const endSlotExclusive = Math.max(draft.startSlot, draft.currentSlot) + 1;
  return {
    top: startSlot * slotHeightPx,
    height: Math.max((endSlotExclusive - startSlot) * slotHeightPx, slotHeightPx),
  };
};

const updateBlocksWithGeometry = (
  blocks: PlannerEditorBlock[],
  clientId: string,
  geometry: PlannerBlockGeometry,
  dayWindow: PlannerDayWindowConfig,
  slotHeightPx: number,
  slotCount: number,
): PlannerEditorBlock[] => {
  const nextSlotRange = geometryToSlotRange(geometry, slotHeightPx, slotCount);
  const nextTimes = slotRangeToTimes(
    nextSlotRange.startSlot,
    nextSlotRange.endSlotExclusive,
    dayWindow,
  );
  return sortBlocks(
    blocks.map((block) => (block.clientId === clientId ? { ...block, ...nextTimes } : block)),
  );
};

export const PlannerTimetableEditor = ({
  dayWindow,
  users,
  blocks,
  selectedBlockId,
  disabled = false,
  onChange,
  onSelectBlock,
  onInteractionStateChange,
}: PlannerTimetableEditorProps) => {
  const [createDraft, setCreateDraft] = useState<PlannerCreateDraft | null>(null);
  const [previewGeometries, setPreviewGeometries] = useState<Record<string, PlannerBlockGeometry>>(
    {},
  );
  const containerRef = useRef<HTMLDivElement | null>(null);
  const slotHeightPx = getPlannerTimetableSlotHeight(dayWindow.slotMinutes);

  const slots = useMemo(
    () => buildPlannerTimeSlots(dayWindow.startTime, dayWindow.endTime, dayWindow.slotMinutes),
    [dayWindow.endTime, dayWindow.slotMinutes, dayWindow.startTime],
  );
  const slotCount = slots.length;
  const totalHeight = slotCount * slotHeightPx;
  const blocksRef = useRef(blocks);
  const onChangeRef = useRef(onChange);
  const onSelectBlockRef = useRef(onSelectBlock);
  const onInteractionStateChangeRef = useRef(onInteractionStateChange);
  const interactStateRef = useRef<PlannerInteractState | null>(null);

  useEffect(() => {
    blocksRef.current = blocks;
  }, [blocks]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onSelectBlockRef.current = onSelectBlock;
  }, [onSelectBlock]);

  useEffect(() => {
    onInteractionStateChangeRef.current = onInteractionStateChange;
  }, [onInteractionStateChange]);

  useEffect(() => {
    if (disabled) {
      return;
    }

    const root = containerRef.current;
    if (!root) {
      return;
    }

    const elements = Array.from(root.querySelectorAll<HTMLElement>("[data-planner-block]"));
    const interactables = elements.map((element) =>
      interact(element)
        .draggable({
          lockAxis: "y",
          listeners: {
            start: (event) => {
              const clientId = element.dataset.clientId;
              if (!clientId) {
                return;
              }
              const block = blocksRef.current.find((entry) => entry.clientId === clientId);
              if (!block) {
                return;
              }

              const startGeometry = blockToGeometry(block, dayWindow, slotHeightPx);
              const columnTop = element.parentElement?.getBoundingClientRect().top ?? 0;
              const pointerY = getInteractClientY(event) ?? 0;
              const blockTop = element.getBoundingClientRect().top;
              interactStateRef.current = {
                clientId,
                mode: "move",
                startGeometry,
                currentGeometry: startGeometry,
                columnTop,
                pointerOffsetY: pointerY - blockTop,
              };
              onInteractionStateChangeRef.current?.(true);
              onSelectBlockRef.current(clientId);
            },
            move: (event) => {
              const state = interactStateRef.current;
              if (!state || state.mode !== "move") {
                return;
              }

              const pointerY = getInteractClientY(event);
              if (pointerY === null) {
                return;
              }

              state.currentGeometry = getMoveGeometryFromPointer(
                state,
                pointerY,
                slotHeightPx,
                totalHeight,
              );
              setPreviewGeometries((current) => ({
                ...current,
                [state.clientId]: state.currentGeometry,
              }));
            },
            end: (event) => {
              const state = interactStateRef.current;
              if (!state || state.mode !== "move") {
                return;
              }

              const pointerY = getInteractClientY(event);
              const geometry =
                pointerY === null
                  ? state.currentGeometry
                  : getMoveGeometryFromPointer(state, pointerY, slotHeightPx, totalHeight);
              state.currentGeometry = geometry;
              onChangeRef.current(
                updateBlocksWithGeometry(
                  blocksRef.current,
                  state.clientId,
                  geometry,
                  dayWindow,
                  slotHeightPx,
                  slotCount,
                ),
                state.clientId,
              );
              setPreviewGeometries((current) => {
                const next = { ...current };
                delete next[state.clientId];
                return next;
              });
              interactStateRef.current = null;
              onInteractionStateChangeRef.current?.(false);
            },
          },
        })
        .resizable({
          edges: {
            top: ".planner-resize-start",
            bottom: ".planner-resize-end",
            left: false,
            right: false,
          },
          listeners: {
            start: (event) => {
              const clientId = element.dataset.clientId;
              if (!clientId) {
                return;
              }
              const block = blocksRef.current.find((entry) => entry.clientId === clientId);
              if (!block) {
                return;
              }

              const edgeName = event.edges?.top ? "resize-start" : "resize-end";
              const startGeometry = blockToGeometry(block, dayWindow, slotHeightPx);
              const columnTop = element.parentElement?.getBoundingClientRect().top ?? 0;
              const pointerY = getInteractClientY(event) ?? 0;
              const blockTop = element.getBoundingClientRect().top;
              interactStateRef.current = {
                clientId,
                mode: edgeName,
                startGeometry,
                currentGeometry: startGeometry,
                columnTop,
                pointerOffsetY: pointerY - blockTop,
              };
              onInteractionStateChangeRef.current?.(true);
              onSelectBlockRef.current(clientId);
            },
            move: (event) => {
              const state = interactStateRef.current;
              if (!state || (state.mode !== "resize-start" && state.mode !== "resize-end")) {
                return;
              }

              const pointerY = getInteractClientY(event);
              if (pointerY === null) {
                return;
              }

              if (state.mode === "resize-start") {
                state.currentGeometry = getResizeStartGeometryFromPointer(
                  state,
                  pointerY,
                  slotHeightPx,
                  totalHeight,
                );
                setPreviewGeometries((current) => ({
                  ...current,
                  [state.clientId]: state.currentGeometry,
                }));
                return;
              }

              state.currentGeometry = getResizeEndGeometryFromPointer(
                state,
                pointerY,
                slotHeightPx,
                totalHeight,
              );
              setPreviewGeometries((current) => ({
                ...current,
                [state.clientId]: state.currentGeometry,
              }));
            },
            end: (event) => {
              const state = interactStateRef.current;
              if (!state || (state.mode !== "resize-start" && state.mode !== "resize-end")) {
                return;
              }

              const pointerY = getInteractClientY(event);
              const geometry =
                pointerY === null
                  ? state.currentGeometry
                  : state.mode === "resize-start"
                    ? getResizeStartGeometryFromPointer(state, pointerY, slotHeightPx, totalHeight)
                    : getResizeEndGeometryFromPointer(state, pointerY, slotHeightPx, totalHeight);
              state.currentGeometry = geometry;
              onChangeRef.current(
                updateBlocksWithGeometry(
                  blocksRef.current,
                  state.clientId,
                  geometry,
                  dayWindow,
                  slotHeightPx,
                  slotCount,
                ),
                state.clientId,
              );
              setPreviewGeometries((current) => {
                const next = { ...current };
                delete next[state.clientId];
                return next;
              });
              interactStateRef.current = null;
              onInteractionStateChangeRef.current?.(false);
            },
          },
        }),
    );

    return () => {
      for (const instance of interactables) {
        instance.unset();
      }
      interactStateRef.current = null;
      setPreviewGeometries({});
      onInteractionStateChangeRef.current?.(false);
    };
  }, [dayWindow, disabled, slotCount, slotHeightPx, totalHeight]);

  const getSlotIndexFromPointer = (clientY: number, columnElement: HTMLDivElement): number => {
    const rect = columnElement.getBoundingClientRect();
    const relativeY = clamp(clientY - rect.top, 0, Math.max(totalHeight - 1, 0));
    return clamp(Math.floor(relativeY / slotHeightPx), 0, Math.max(slotCount - 1, 0));
  };

  return (
    <div
      ref={containerRef}
      className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-950/70"
    >
      <div
        className="grid min-w-[620px]"
        style={{
          gridTemplateColumns: `5rem repeat(${Math.max(users.length, 1)}, minmax(9.5rem, 1fr))`,
        }}
      >
        <div className="border-b border-r border-slate-700 bg-slate-950/90 px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
          Time
        </div>
        {users.map((user) => (
          <div
            key={user.id}
            className="border-b border-r border-slate-700 bg-slate-950/90 px-3 py-2 text-sm font-semibold text-slate-100 last:border-r-0"
          >
            {user.name}
          </div>
        ))}

        <div className="relative border-r border-slate-700 bg-slate-950/70">
          {slots.map((slot, index) => (
            <div
              key={slot}
              className={`flex items-start border-b border-slate-800 px-2 py-1 text-[11px] text-slate-400 ${
                index % 4 === 0 ? "bg-slate-950/80" : ""
              }`}
              style={{ height: `${slotHeightPx}px` }}
            >
              {formatTimeLabel(slot)}
            </div>
          ))}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-slate-600/80">
            <span className="absolute bottom-0 left-2 translate-y-1/2 bg-slate-950 px-1 text-[11px] text-slate-400">
              {formatTimeLabel(dayWindow.endTime)}
            </span>
          </div>
        </div>

        {users.map((user) => {
          const userBlocks = blocks.filter((block) => block.userId === user.id);
          const createPreview =
            createDraft && createDraft.userId === user.id
              ? buildCreatePreviewGeometry(createDraft, slotHeightPx)
              : null;

          return (
            <div
              key={user.id}
              className="relative border-r border-slate-700 bg-slate-950/40 last:border-r-0"
              style={{ height: `${totalHeight}px` }}
              onPointerDown={(event) => {
                if (disabled || event.button !== 0) {
                  return;
                }
                const target = event.target as HTMLElement | null;
                if (target?.closest("[data-planner-block]")) {
                  return;
                }
                const startSlot = getSlotIndexFromPointer(event.clientY, event.currentTarget);
                event.currentTarget.setPointerCapture(event.pointerId);
                onInteractionStateChangeRef.current?.(true);
                onSelectBlock(null);
                setCreateDraft({
                  userId: user.id,
                  startSlot,
                  currentSlot: startSlot,
                  pointerId: event.pointerId,
                });
              }}
              onPointerMove={(event) => {
                if (
                  !createDraft ||
                  createDraft.userId !== user.id ||
                  createDraft.pointerId !== event.pointerId
                ) {
                  return;
                }
                const nextSlot = getSlotIndexFromPointer(event.clientY, event.currentTarget);
                setCreateDraft((current) =>
                  current && current.userId === user.id
                    ? {
                        ...current,
                        currentSlot: nextSlot,
                      }
                    : current,
                );
              }}
              onPointerUp={() => {
                if (!createDraft || createDraft.userId !== user.id) {
                  return;
                }
                const startSlot = Math.min(createDraft.startSlot, createDraft.currentSlot);
                const endSlotExclusive =
                  Math.max(createDraft.startSlot, createDraft.currentSlot) + 1;
                const times = slotRangeToTimes(startSlot, endSlotExclusive, dayWindow);
                const nextBlock: PlannerEditorBlock = {
                  clientId: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                  userId: user.id,
                  name: "New activity",
                  colour: DEFAULT_THEME_COLOR_SLOT,
                  notes: null,
                  ...times,
                };
                onChange(sortBlocks([...blocksRef.current, nextBlock]), nextBlock.clientId);
                setCreateDraft(null);
                onInteractionStateChangeRef.current?.(false);
              }}
              onLostPointerCapture={() => {
                if (createDraft?.userId === user.id) {
                  setCreateDraft(null);
                  onInteractionStateChangeRef.current?.(false);
                }
              }}
            >
              {slots.map((slot, index) => (
                <div
                  key={`${user.id}-${slot}`}
                  data-planner-slot-index={index}
                  className={`pointer-events-auto border-b border-slate-800 ${
                    index % 4 === 0 ? "bg-slate-900/20" : ""
                  }`}
                  style={{ height: `${slotHeightPx}px` }}
                />
              ))}

              {userBlocks.map((block) => {
                const baseGeometry = blockToGeometry(block, dayWindow, slotHeightPx);
                const geometry = previewGeometries[block.clientId] ?? baseGeometry;
                const isSelected = block.clientId === selectedBlockId;

                return (
                  <button
                    key={block.clientId}
                    type="button"
                    data-planner-block="true"
                    data-client-id={block.clientId}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectBlock(block.clientId);
                    }}
                    className={`absolute left-1 right-1 touch-none select-none overflow-hidden rounded-lg border px-2 text-left shadow ${
                      isSelected ? "border-cyan-300 ring-2 ring-cyan-400/70" : "border-slate-950/60"
                    }`}
                    style={{
                      top: `${geometry.top}px`,
                      height: `${geometry.height}px`,
                      backgroundColor: getThemePaletteColorVar(block.colour),
                      borderColor: `rgb(${getThemePaletteRgbVar(block.colour)} / 0.42)`,
                      color: getThemePaletteForegroundVar(block.colour),
                    }}
                  >
                    <span className="planner-resize-start absolute inset-x-0 top-0 h-2 cursor-ns-resize rounded-t-lg bg-black/10" />
                    <div className="pointer-events-none flex h-full flex-col justify-center">
                      <span className="truncate text-sm font-semibold">{block.name}</span>
                      {geometry.height >= slotHeightPx * 2.75 && block.notes ? (
                        <span className="mt-0.5 line-clamp-2 text-[11px] opacity-80">
                          {block.notes}
                        </span>
                      ) : null}
                    </div>
                    <span className="planner-resize-end absolute inset-x-0 bottom-0 h-2 cursor-ns-resize rounded-b-lg bg-black/10" />
                  </button>
                );
              })}

              {createPreview ? (
                <div
                  className="pointer-events-none absolute left-1 right-1 rounded-lg border border-cyan-300/80 bg-cyan-400/20 shadow"
                  style={{
                    top: `${createPreview.top}px`,
                    height: `${createPreview.height}px`,
                  }}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};
