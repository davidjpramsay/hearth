import { useEffect, useMemo, useRef, useState } from "react";
import { defineModule } from "@hearth/module-sdk";
import {
  buildPlannerTimeSlots,
  getMillisecondsUntilNextCalendarDateInTimeZone,
  plannerModuleConfigSchema,
  plannerTimeToMinutes,
  plannerTodayResponseSchema,
  toCalendarDateInTimeZone,
  type PlannerModuleConfig,
  type PlannerTodayResponse,
} from "@hearth/shared";
import {
  addDisplayTimeContextListener,
  getDisplayNow,
  getDisplaySiteTimeZone,
} from "../../runtime/display-time";
import {
  readPersistedModuleSnapshot,
  writePersistedModuleSnapshot,
} from "../data/persisted-module-snapshot";
import { resolveModuleConnectivityState, useBrowserOnlineStatus } from "../data/connection-state";
import { ModuleConnectionBadge } from "../ui/ModuleConnectionBadge";
import { ModulePresentationControls } from "../ui/ModulePresentationControls";
import { ModuleSkeleton } from "../ui/ModuleSkeleton";
import {
  getThemePaletteColorVar,
  getThemePaletteForegroundVar,
  getThemePaletteRgbVar,
} from "../../theme/theme";

const PLANNER_SNAPSHOT_MAX_AGE_MS = 36 * 60 * 60 * 1000;
const FALLBACK_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const MIN_SLOT_HEIGHT_PX = 20;

const localIsoDate = (timeZone: string, date: Date = getDisplayNow()): string =>
  toCalendarDateInTimeZone(date, timeZone);

const localTimeParts = (timeZone: string, date: Date): { hour: number; minute: number } => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
    timeZone,
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return {
    hour: Number.parseInt(hour, 10) % 24,
    minute: Number.parseInt(minute, 10) || 0,
  };
};

const buildSnapshotKey = (instanceId: string): string => `homeschool-planner:${instanceId}`;

const emptyTodayResponse = (siteDate: string): PlannerTodayResponse =>
  plannerTodayResponseSchema.parse({
    generatedAt: new Date().toISOString(),
    siteDate,
    dayWindow: {
      startTime: "08:00",
      endTime: "15:00",
    },
    users: [],
    template: null,
    blocks: [],
  });

const fetchTodayPlan = async (instanceId: string): Promise<PlannerTodayResponse> => {
  const response = await fetch(
    `/api/modules/homeschool-planner/${encodeURIComponent(instanceId)}/today`,
    {
      method: "GET",
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message =
      payload && typeof payload.message === "string"
        ? payload.message
        : `Request failed (${response.status})`;
    throw new Error(message);
  }

  return plannerTodayResponseSchema.parse(await response.json());
};

export const moduleDefinition = defineModule({
  manifest: {
    id: "homeschool-planner",
    name: "School Planner",
    version: "1.0.0",
    description: "Site-local homeschooling day timetable",
    icon: "calendar-days",
    defaultSize: { w: 10, h: 6 },
    timeMode: "site-local",
    categories: ["family", "education"],
    permissions: ["network"],
    dataSources: [{ id: "planner-today", kind: "rest" }],
  },
  settingsSchema: plannerModuleConfigSchema,
  dataSchema: plannerTodayResponseSchema,
  runtime: {
    Component: ({ instanceId, settings, isEditing }) => {
      const runtimeSiteTimeZone = getDisplaySiteTimeZone();
      const snapshotKey = useMemo(() => buildSnapshotKey(instanceId), [instanceId]);
      const initialSnapshot = useMemo(
        () =>
          readPersistedModuleSnapshot({
            key: snapshotKey,
            parse: (storedPayload) => plannerTodayResponseSchema.parse(storedPayload),
            maxAgeMs: PLANNER_SNAPSHOT_MAX_AGE_MS,
            validate: (storedPayload) =>
              storedPayload.siteDate === localIsoDate(runtimeSiteTimeZone),
          }),
        [runtimeSiteTimeZone, snapshotKey],
      );
      const [response, setResponse] = useState<PlannerTodayResponse>(
        () => initialSnapshot?.data ?? emptyTodayResponse(localIsoDate(runtimeSiteTimeZone)),
      );
      const [loading, setLoading] = useState(() => initialSnapshot === null);
      const [error, setError] = useState<string | null>(null);
      const [lastUpdatedMs, setLastUpdatedMs] = useState<number | null>(
        () => initialSnapshot?.updatedAtMs ?? null,
      );
      const responseRef = useRef(response);
      const loadRef = useRef<() => Promise<void>>(async () => undefined);
      const plannerViewportRef = useRef<HTMLDivElement | null>(null);
      const [plannerViewportHeight, setPlannerViewportHeight] = useState<number>(0);
      const [displayNow, setDisplayNow] = useState(() => getDisplayNow());
      const browserOnline = useBrowserOnlineStatus();
      const connectivityState = resolveModuleConnectivityState({
        error,
        hasSnapshot: lastUpdatedMs !== null,
        isOnline: browserOnline,
      });

      useEffect(() => {
        responseRef.current = response;
      }, [response]);

      useEffect(() => {
        if (!initialSnapshot) {
          return;
        }

        setResponse(initialSnapshot.data);
        setLastUpdatedMs(initialSnapshot.updatedAtMs);
        setLoading(false);
      }, [initialSnapshot]);

      useEffect(() => {
        if (isEditing) {
          setLoading(false);
          setError(null);
          return;
        }

        let active = true;

        const load = async () => {
          try {
            const nextResponse = await fetchTodayPlan(instanceId);
            if (!active) {
              return;
            }

            const updatedAtMs = Date.now();
            setResponse(nextResponse);
            setLastUpdatedMs(updatedAtMs);
            setError(null);
            writePersistedModuleSnapshot(snapshotKey, nextResponse, updatedAtMs);
          } catch (loadError) {
            if (!active) {
              return;
            }

            setError(
              loadError instanceof Error ? loadError.message : "Failed to load school planner",
            );
          } finally {
            if (active) {
              setLoading(false);
            }
          }
        };

        loadRef.current = load;

        const onVisibilityChange = () => {
          if (document.visibilityState === "visible") {
            void load();
          }
        };
        const onPageShow = () => {
          void load();
        };
        const onWindowFocus = () => {
          void load();
        };
        const onPlannerUpdated = () => {
          void load();
        };
        const onDisplayTimeUpdated = () => {
          const expectedDate = localIsoDate(getDisplaySiteTimeZone());
          if (responseRef.current.siteDate !== expectedDate) {
            void load();
          }
        };

        void load();
        const removeDisplayTimeListener = addDisplayTimeContextListener(onDisplayTimeUpdated);
        window.addEventListener("hearth:planner-updated", onPlannerUpdated);
        document.addEventListener("visibilitychange", onVisibilityChange);
        window.addEventListener("pageshow", onPageShow);
        window.addEventListener("focus", onWindowFocus);
        const timer = window.setInterval(() => {
          void load();
        }, FALLBACK_REFRESH_INTERVAL_MS);

        return () => {
          active = false;
          removeDisplayTimeListener();
          window.removeEventListener("hearth:planner-updated", onPlannerUpdated);
          document.removeEventListener("visibilitychange", onVisibilityChange);
          window.removeEventListener("pageshow", onPageShow);
          window.removeEventListener("focus", onWindowFocus);
          window.clearInterval(timer);
        };
      }, [instanceId, isEditing, snapshotKey]);

      useEffect(() => {
        if (isEditing) {
          return;
        }

        const delayMs =
          getMillisecondsUntilNextCalendarDateInTimeZone(
            getDisplayNow(),
            getDisplaySiteTimeZone(),
          ) + 250;
        const timer = window.setTimeout(() => {
          void loadRef.current();
        }, delayMs);

        return () => {
          window.clearTimeout(timer);
        };
      }, [isEditing, response.siteDate]);

      useEffect(() => {
        if (isEditing) {
          return;
        }

        let minuteTimer: number | null = null;

        const scheduleMinuteTick = () => {
          const now = getDisplayNow();
          setDisplayNow(now);
          const delayMs = Math.max(
            250,
            60_000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 50,
          );
          minuteTimer = window.setTimeout(scheduleMinuteTick, delayMs);
        };

        scheduleMinuteTick();
        const removeDisplayTimeListener = addDisplayTimeContextListener(() => {
          setDisplayNow(getDisplayNow());
        });

        return () => {
          removeDisplayTimeListener();
          if (minuteTimer !== null) {
            window.clearTimeout(minuteTimer);
          }
        };
      }, [isEditing]);

      const slots = buildPlannerTimeSlots(response.dayWindow.startTime, response.dayWindow.endTime);

      useEffect(() => {
        const element = plannerViewportRef.current;
        if (!element || typeof ResizeObserver === "undefined") {
          return;
        }

        const updateHeight = () => {
          setPlannerViewportHeight(element.clientHeight);
        };

        updateHeight();
        const observer = new ResizeObserver(() => {
          updateHeight();
        });
        observer.observe(element);

        return () => {
          observer.disconnect();
        };
      }, [response.template?.id, response.users.length, slots.length]);

      if (isEditing) {
        return (
          <div className="flex h-full flex-col justify-center rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-3 text-slate-200">
            <p className="module-copy-title text-slate-100">School planner preview</p>
            <p className="module-copy-meta mt-2 text-slate-300">Today-only site-local schedule</p>
          </div>
        );
      }

      const slotHeightPx =
        slots.length > 0
          ? Math.max(
              MIN_SLOT_HEIGHT_PX,
              plannerViewportHeight > 0 ? plannerViewportHeight / slots.length : MIN_SLOT_HEIGHT_PX,
            )
          : MIN_SLOT_HEIGHT_PX;
      const totalHeight = slots.length * slotHeightPx;
      const formatter = new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
        timeZone: getDisplaySiteTimeZone(),
      });
      const siteDateLabel = formatter.format(new Date(`${response.siteDate}T12:00:00.000Z`));
      const currentTime = localTimeParts(getDisplaySiteTimeZone(), displayNow);
      const currentTimeMinutes = currentTime.hour * 60 + currentTime.minute;
      const dayStartMinutes = plannerTimeToMinutes(response.dayWindow.startTime);
      const dayEndMinutes = plannerTimeToMinutes(response.dayWindow.endTime);
      const currentTimeWithinWindow =
        currentTimeMinutes >= dayStartMinutes && currentTimeMinutes < dayEndMinutes;
      const currentTimeOffsetPx = currentTimeWithinWindow
        ? ((currentTimeMinutes - dayStartMinutes) / 15) * slotHeightPx
        : null;

      return (
        <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-950 p-2 text-slate-100">
          <ModuleConnectionBadge
            visible={connectivityState.showDisconnected}
            title={connectivityState.disconnectedTitle ?? undefined}
            label={connectivityState.disconnectedLabel}
          />
          <header className="mb-2 rounded border border-slate-700 bg-slate-900/80 px-3 py-2">
            <p className="module-copy-title text-slate-100">
              {response.template?.name ?? "School Planner"}
            </p>
            <p className="module-copy-meta mt-1 text-slate-300">{siteDateLabel}</p>
          </header>

          {loading ? <ModuleSkeleton variant="board" /> : null}

          {!loading && connectivityState.blockingError ? (
            <p className="module-copy-meta rounded border border-rose-500/60 bg-rose-500/10 px-2 py-1 text-rose-200">
              {connectivityState.blockingError}
            </p>
          ) : null}

          {!loading && !connectivityState.blockingError ? (
            response.template ? (
              <div
                ref={plannerViewportRef}
                className="min-h-0 flex-1 overflow-auto rounded border border-slate-700 bg-slate-950/60"
              >
                <div
                  className="grid min-w-[44rem]"
                  style={{
                    gridTemplateColumns: `5rem repeat(${Math.max(response.users.length, 1)}, minmax(9rem, 1fr))`,
                  }}
                >
                  <div className="border-b border-r border-slate-700 bg-slate-950/90 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Time
                  </div>
                  {response.users.map((user) => (
                    <div
                      key={user.id}
                      className="border-b border-r border-slate-700 bg-slate-950/90 px-2 py-1.5 text-sm font-semibold text-slate-100 last:border-r-0"
                    >
                      {user.name}
                    </div>
                  ))}

                  <div className="border-r border-slate-700 bg-slate-950/60">
                    {slots.map((slot, index) => (
                      <div
                        key={slot}
                        className={`border-b border-slate-800 px-2 py-0.5 text-[10px] text-slate-400 ${
                          index % 4 === 0 ? "bg-slate-950/80" : ""
                        }`}
                        style={{ height: `${slotHeightPx}px` }}
                      >
                        {slot}
                      </div>
                    ))}
                  </div>

                  {response.users.map((user) => {
                    const userBlocks = response.blocks.filter((block) => block.userId === user.id);
                    const activeBlockId =
                      userBlocks.find((block) => {
                        const startMinutes = plannerTimeToMinutes(block.startTime);
                        const endMinutes = plannerTimeToMinutes(block.endTime);
                        return (
                          currentTimeMinutes >= startMinutes && currentTimeMinutes < endMinutes
                        );
                      })?.id ?? null;
                    const nextBlockId =
                      userBlocks.find(
                        (block) => plannerTimeToMinutes(block.startTime) > currentTimeMinutes,
                      )?.id ?? null;

                    return (
                      <div
                        key={user.id}
                        className="relative border-r border-slate-700 bg-slate-950/30 last:border-r-0"
                        style={{ height: `${totalHeight}px` }}
                      >
                        {slots.map((slot, index) => (
                          <div
                            key={`${user.id}-${slot}`}
                            className={`border-b border-slate-800 ${
                              index % 4 === 0 ? "bg-slate-900/20" : ""
                            }`}
                            style={{ height: `${slotHeightPx}px` }}
                          />
                        ))}
                        {currentTimeOffsetPx !== null ? (
                          <div
                            className="pointer-events-none absolute inset-x-0 z-[1] border-t-2 border-rose-300/90"
                            style={{ top: `${currentTimeOffsetPx}px` }}
                          >
                            <div className="absolute -left-1.5 -top-[5px] h-2.5 w-2.5 rounded-full bg-rose-300 shadow-[0_0_0_3px_rgba(253,164,175,0.18)]" />
                          </div>
                        ) : null}

                        {userBlocks.map((block) => {
                          const startMinutes =
                            plannerTimeToMinutes(block.startTime) - dayStartMinutes;
                          const endMinutes = plannerTimeToMinutes(block.endTime) - dayStartMinutes;
                          const top = (startMinutes / 15) * slotHeightPx;
                          const height = Math.max(
                            ((endMinutes - startMinutes) / 15) * slotHeightPx,
                            slotHeightPx,
                          );
                          const isActive = block.id === activeBlockId;
                          const isNext = !isActive && block.id === nextBlockId;

                          return (
                            <div
                              key={block.id}
                              className={`absolute left-1 right-1 overflow-hidden rounded border px-2 py-1 shadow transition ${
                                isActive
                                  ? "z-[2] ring-2 ring-white/55 shadow-[0_12px_28px_rgba(15,23,42,0.36)]"
                                  : isNext
                                    ? "z-[2] ring-1 ring-white/30"
                                    : "border-slate-950/50"
                              }`}
                              style={{
                                top: `${top + 1}px`,
                                height: `${height - 2}px`,
                                backgroundColor: getThemePaletteColorVar(block.colour),
                                borderColor: `rgb(${getThemePaletteRgbVar(block.colour)} / 0.42)`,
                                color: getThemePaletteForegroundVar(block.colour),
                              }}
                            >
                              <p className="truncate text-sm font-semibold leading-tight">
                                {block.name}
                              </p>
                              {isActive ? (
                                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] opacity-80">
                                  Now
                                </p>
                              ) : isNext ? (
                                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] opacity-75">
                                  Next
                                </p>
                              ) : null}
                              {height >= slotHeightPx * 2.5 && block.notes ? (
                                <p className="mt-1 line-clamp-3 text-[11px] leading-snug opacity-85 normal-case tracking-normal">
                                  {block.notes}
                                </p>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 items-center justify-center rounded border border-slate-700 bg-slate-900/50 px-4 text-center text-slate-300">
                No plan assigned for today.
              </div>
            )
          ) : null}
        </div>
      );
    },
  },
  admin: {
    SettingsPanel: ({ settings, onChange }) => {
      const applyPatch = (patch: Partial<PlannerModuleConfig>) => {
        onChange({
          ...settings,
          ...patch,
        });
      };

      return (
        <div className="space-y-4 rounded-lg border border-slate-700 bg-slate-900 p-4 text-sm text-slate-200">
          <h3 className="text-base font-semibold">School planner settings</h3>
          <p className="text-slate-300">School content is configured in Admin &gt; School.</p>
          <ModulePresentationControls
            value={settings.presentation}
            onChange={(presentation) => applyPatch({ presentation })}
          />
        </div>
      );
    },
  },
});

export default moduleDefinition;
