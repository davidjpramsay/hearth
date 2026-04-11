import { useEffect, useMemo, useState } from "react";
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
}

type Interaction =
  | {
      type: "create";
      userId: number;
      startSlot: number;
      currentSlot: number;
    }
  | {
      type: "move";
      blockId: string;
      startClientY: number;
      originalStartSlot: number;
      originalEndSlot: number;
    }
  | {
      type: "resize-start";
      blockId: string;
      startClientY: number;
      originalStartSlot: number;
      originalEndSlot: number;
    }
  | {
      type: "resize-end";
      blockId: string;
      startClientY: number;
      originalStartSlot: number;
      originalEndSlot: number;
    };

const SLOT_HEIGHT_PX = 32;

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
  return {
    startTime: plannerMinutesToTime(dayStartMinutes + startSlot * 15),
    endTime: plannerMinutesToTime(dayStartMinutes + endSlotExclusive * 15),
  };
};

const blockToSlots = (
  block: PlannerEditorBlock,
  dayWindow: PlannerDayWindowConfig,
): { startSlot: number; endSlotExclusive: number } => {
  const dayStartMinutes = plannerTimeToMinutes(dayWindow.startTime);
  return {
    startSlot: Math.round((plannerTimeToMinutes(block.startTime) - dayStartMinutes) / 15),
    endSlotExclusive: Math.round((plannerTimeToMinutes(block.endTime) - dayStartMinutes) / 15),
  };
};

export const PlannerTimetableEditor = ({
  dayWindow,
  users,
  blocks,
  selectedBlockId,
  disabled = false,
  onChange,
  onSelectBlock,
}: PlannerTimetableEditorProps) => {
  const [interaction, setInteraction] = useState<Interaction | null>(null);

  const slots = useMemo(
    () => buildPlannerTimeSlots(dayWindow.startTime, dayWindow.endTime),
    [dayWindow.endTime, dayWindow.startTime],
  );
  const slotCount = slots.length;
  const totalHeight = slotCount * SLOT_HEIGHT_PX;

  useEffect(() => {
    if (!interaction) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (interaction.type === "create") {
        const element = document.elementFromPoint(event.clientX, event.clientY);
        const slotAttribute = element
          ?.closest?.("[data-planner-slot-index]")
          ?.getAttribute("data-planner-slot-index");
        const nextSlot =
          slotAttribute === null || slotAttribute === undefined
            ? interaction.currentSlot
            : clamp(Number(slotAttribute), 0, Math.max(slotCount - 1, 0));
        setInteraction({
          ...interaction,
          currentSlot: nextSlot,
        });
        return;
      }

      const deltaSlots = Math.round((event.clientY - interaction.startClientY) / SLOT_HEIGHT_PX);
      const activeBlock = blocks.find((block) => block.clientId === interaction.blockId);
      if (!activeBlock) {
        return;
      }

      const durationSlots = interaction.originalEndSlot - interaction.originalStartSlot;

      if (interaction.type === "move") {
        const nextStartSlot = clamp(
          interaction.originalStartSlot + deltaSlots,
          0,
          Math.max(slotCount - durationSlots, 0),
        );
        const nextTimes = slotRangeToTimes(nextStartSlot, nextStartSlot + durationSlots, dayWindow);
        onChange(
          sortBlocks(
            blocks.map((block) =>
              block.clientId === activeBlock.clientId ? { ...block, ...nextTimes } : block,
            ),
          ),
          activeBlock.clientId,
        );
        return;
      }

      if (interaction.type === "resize-start") {
        const nextStartSlot = clamp(
          interaction.originalStartSlot + deltaSlots,
          0,
          interaction.originalEndSlot - 1,
        );
        const nextTimes = slotRangeToTimes(nextStartSlot, interaction.originalEndSlot, dayWindow);
        onChange(
          sortBlocks(
            blocks.map((block) =>
              block.clientId === activeBlock.clientId ? { ...block, ...nextTimes } : block,
            ),
          ),
          activeBlock.clientId,
        );
        return;
      }

      const nextEndSlot = clamp(
        interaction.originalEndSlot + deltaSlots,
        interaction.originalStartSlot + 1,
        slotCount,
      );
      const nextTimes = slotRangeToTimes(interaction.originalStartSlot, nextEndSlot, dayWindow);
      onChange(
        sortBlocks(
          blocks.map((block) =>
            block.clientId === activeBlock.clientId ? { ...block, ...nextTimes } : block,
          ),
        ),
        activeBlock.clientId,
      );
    };

    const handlePointerUp = () => {
      if (interaction.type === "create") {
        const startSlot = Math.min(interaction.startSlot, interaction.currentSlot);
        const endSlotExclusive = Math.max(interaction.startSlot, interaction.currentSlot) + 1;
        const times = slotRangeToTimes(startSlot, endSlotExclusive, dayWindow);
        const nextBlock: PlannerEditorBlock = {
          clientId: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          userId: interaction.userId,
          name: "New activity",
          colour: DEFAULT_THEME_COLOR_SLOT,
          notes: null,
          ...times,
        };

        onChange(sortBlocks([...blocks, nextBlock]), nextBlock.clientId);
      }

      setInteraction(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [blocks, dayWindow, interaction, onChange, slotCount]);

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-950/70">
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
              style={{ height: `${SLOT_HEIGHT_PX}px` }}
            >
              {formatTimeLabel(slot)}
            </div>
          ))}
        </div>

        {users.map((user) => {
          const userBlocks = blocks.filter((block) => block.userId === user.id);

          return (
            <div
              key={user.id}
              className="relative border-r border-slate-700 bg-slate-950/40 last:border-r-0"
              style={{ height: `${totalHeight}px` }}
              onPointerDown={(event) => {
                if (disabled) {
                  return;
                }
                if (event.button !== 0) {
                  return;
                }
                const target = event.target as HTMLElement | null;
                if (target?.closest("[data-planner-block]")) {
                  return;
                }
                const slotAttribute = target
                  ?.closest?.("[data-planner-slot-index]")
                  ?.getAttribute("data-planner-slot-index");
                const startSlot =
                  slotAttribute === null || slotAttribute === undefined
                    ? 0
                    : clamp(Number(slotAttribute), 0, Math.max(slotCount - 1, 0));
                onSelectBlock(null);
                setInteraction({
                  type: "create",
                  userId: user.id,
                  startSlot,
                  currentSlot: startSlot,
                });
              }}
            >
              {slots.map((slot, index) => (
                <div
                  key={`${user.id}-${slot}`}
                  data-planner-slot-index={index}
                  className={`pointer-events-auto border-b border-slate-800 ${
                    index % 4 === 0 ? "bg-slate-900/20" : ""
                  }`}
                  style={{ height: `${SLOT_HEIGHT_PX}px` }}
                />
              ))}

              {userBlocks.map((block) => {
                const { startSlot, endSlotExclusive } = blockToSlots(block, dayWindow);
                const top = startSlot * SLOT_HEIGHT_PX;
                const height = Math.max(
                  (endSlotExclusive - startSlot) * SLOT_HEIGHT_PX,
                  SLOT_HEIGHT_PX,
                );
                const isSelected = block.clientId === selectedBlockId;

                return (
                  <button
                    key={block.clientId}
                    type="button"
                    data-planner-block="true"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectBlock(block.clientId);
                    }}
                    onPointerDown={(event) => {
                      if (disabled) {
                        return;
                      }
                      event.stopPropagation();
                      onSelectBlock(block.clientId);
                      setInteraction({
                        type: "move",
                        blockId: block.clientId,
                        startClientY: event.clientY,
                        originalStartSlot: startSlot,
                        originalEndSlot: endSlotExclusive,
                      });
                    }}
                    className={`absolute left-1 right-1 overflow-hidden rounded-lg border px-2 text-left shadow ${
                      isSelected ? "border-cyan-300 ring-2 ring-cyan-400/70" : "border-slate-950/60"
                    }`}
                    style={{
                      top: `${top + 1}px`,
                      height: `${height - 2}px`,
                      backgroundColor: getThemePaletteColorVar(block.colour),
                      borderColor: `rgb(${getThemePaletteRgbVar(block.colour)} / 0.42)`,
                      color: getThemePaletteForegroundVar(block.colour),
                    }}
                  >
                    <span
                      className="absolute inset-x-0 top-0 h-2 cursor-ns-resize rounded-t-lg bg-black/10"
                      onPointerDown={(event) => {
                        if (disabled) {
                          return;
                        }
                        event.stopPropagation();
                        onSelectBlock(block.clientId);
                        setInteraction({
                          type: "resize-start",
                          blockId: block.clientId,
                          startClientY: event.clientY,
                          originalStartSlot: startSlot,
                          originalEndSlot: endSlotExclusive,
                        });
                      }}
                    />
                    <div className="pointer-events-none flex h-full flex-col justify-center">
                      <span className="truncate text-sm font-semibold">{block.name}</span>
                      {height >= SLOT_HEIGHT_PX * 2.75 && block.notes ? (
                        <span className="mt-0.5 line-clamp-2 text-[11px] opacity-80">
                          {block.notes}
                        </span>
                      ) : null}
                    </div>
                    <span
                      className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize rounded-b-lg bg-black/10"
                      onPointerDown={(event) => {
                        if (disabled) {
                          return;
                        }
                        event.stopPropagation();
                        onSelectBlock(block.clientId);
                        setInteraction({
                          type: "resize-end",
                          blockId: block.clientId,
                          startClientY: event.clientY,
                          originalStartSlot: startSlot,
                          originalEndSlot: endSlotExclusive,
                        });
                      }}
                    />
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};
