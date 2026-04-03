import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";
import {
  type CalendarFeed,
  calendarModuleConfigSchema,
  calendarModuleEventsResponseSchema,
  getMillisecondsUntilNextCalendarDateInTimeZone,
  parseCalendarEventBoundary,
  toCalendarDateInTimeZone,
  type CalendarModuleConfig,
  type CalendarModuleEvent,
  type CalendarModuleSource,
} from "@hearth/shared";
import { defineModule } from "@hearth/module-sdk";
import { getCalendarFeeds } from "../../api/client";
import { getAuthToken } from "../../auth/storage";
import {
  addDisplayTimeContextListener,
  getDisplayNow,
  getDisplaySiteTimeZone,
} from "../../runtime/display-time";
import {
  readPersistedModuleSnapshot,
  writePersistedModuleSnapshot,
} from "../data/persisted-module-snapshot";
import { ModulePresentationControls } from "../ui/ModulePresentationControls";
import { resolveModuleConnectivityState, useBrowserOnlineStatus } from "../data/connection-state";
import { ModuleConnectionBadge } from "../ui/ModuleConnectionBadge";

const DAY_MS = 24 * 60 * 60 * 1000;
const CALENDAR_SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CALENDAR_CLOCK_TICK_MS = 60 * 1000;
const CALENDAR_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
const CALENDAR_FALLBACK_COLORS = [
  "#22D3EE",
  "#60A5FA",
  "#A78BFA",
  "#34D399",
  "#F59E0B",
  "#FB7185",
  "#F97316",
  "#38BDF8",
];
type CalendarDateKey = `${number}-${number}-${number}`;

type CalendarTileEvent = CalendarModuleEvent & {
  startDate: Date;
  endDate: Date | null;
  allDayStartCalendarDate: CalendarDateKey | null;
  allDayEndCalendarDateExclusive: CalendarDateKey | null;
};

const parseCalendarDateKey = (value: string): Date => {
  const [yearPart, monthPart, dayPart] = value.split("-");
  const year = Number.parseInt(yearPart ?? "", 10);
  const month = Number.parseInt(monthPart ?? "", 10);
  const day = Number.parseInt(dayPart ?? "", 10);

  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
};

const parseSerializedAllDayCalendarDate = (
  value: string | null | undefined,
): CalendarDateKey | null => {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10) as CalendarDateKey;
};

const addDaysToCalendarDate = (value: string, days: number): CalendarDateKey => {
  const next = parseCalendarDateKey(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10) as CalendarDateKey;
};

const startOfWeek = (value: string): CalendarDateKey =>
  addDaysToCalendarDate(value, -parseCalendarDateKey(value).getUTCDay());

export const buildRollingMonthGrid = (
  referenceDate: CalendarDateKey,
): {
  weekCount: number;
  cells: CalendarDateKey[];
} => {
  const weekCount = 4;
  const gridStart = startOfWeek(referenceDate);

  return {
    weekCount,
    cells: Array.from({ length: weekCount * 7 }, (_value, index) =>
      addDaysToCalendarDate(gridStart, index),
    ),
  };
};

const readThemeCalendarColor = (variableName: string, fallback: string): string => {
  if (typeof window === "undefined") {
    return fallback;
  }

  const resolved = getComputedStyle(document.documentElement)
    .getPropertyValue(variableName)
    .trim()
    .toUpperCase();

  return CALENDAR_COLOR_REGEX.test(resolved) ? resolved : fallback;
};

const defaultCalendarColor = (index: number): string => {
  const palette = [
    readThemeCalendarColor("--color-text-accent", CALENDAR_FALLBACK_COLORS[0] ?? "#22D3EE"),
    readThemeCalendarColor("--color-status-ok", CALENDAR_FALLBACK_COLORS[3] ?? "#34D399"),
    readThemeCalendarColor("--color-status-loading", CALENDAR_FALLBACK_COLORS[4] ?? "#F59E0B"),
    readThemeCalendarColor("--color-status-error", CALENDAR_FALLBACK_COLORS[5] ?? "#FB7185"),
    readThemeCalendarColor("--color-text-secondary", CALENDAR_FALLBACK_COLORS[1] ?? "#60A5FA"),
    readThemeCalendarColor("--color-text-muted", CALENDAR_FALLBACK_COLORS[6] ?? "#F97316"),
    readThemeCalendarColor("--color-text-accent", CALENDAR_FALLBACK_COLORS[7] ?? "#38BDF8"),
    readThemeCalendarColor("--color-status-ok", CALENDAR_FALLBACK_COLORS[2] ?? "#A78BFA"),
  ];

  return palette[index % palette.length] ?? palette[0] ?? "#22D3EE";
};

const normalizeCalendarColor = (value: string | undefined): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!CALENDAR_COLOR_REGEX.test(trimmed)) {
    return null;
  }

  return trimmed.toUpperCase();
};

const buildCalendarFeedOptionMap = (feeds: CalendarFeed[]): Map<string, CalendarFeed> =>
  new Map(feeds.map((feed) => [feed.id, feed]));

const loadCalendarFeedOptions = async (): Promise<CalendarFeed[]> => {
  const token = getAuthToken();
  if (!token) {
    return [];
  }

  try {
    const response = await getCalendarFeeds(token);
    return response.feeds;
  } catch {
    return [];
  }
};

const alphaHex = (color: string, alpha: number): string => {
  const clamped = Math.max(0, Math.min(1, alpha));
  const alphaChannel = Math.round(clamped * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
  return `${color}${alphaChannel}`;
};

const eventAccentStyle = (color: string | null): CSSProperties | undefined => {
  if (!color) {
    return undefined;
  }

  return {
    borderColor: alphaHex(color, 0.9),
    background: `linear-gradient(135deg, ${alphaHex(color, 0.35)} 0%, ${alphaHex(
      color,
      0.22,
    )} 100%)`,
    boxShadow: `inset 0 0 0 1px ${alphaHex(color, 0.38)}`,
  };
};

const getEventEndExclusive = (event: CalendarTileEvent): Date => {
  const eventStart = event.startDate;
  if (event.endDate && event.endDate.getTime() > eventStart.getTime()) {
    return event.endDate;
  }
  return new Date(eventStart.getTime() + 1);
};

const getEventLastOccupiedCalendarDate = (
  event: CalendarTileEvent,
  timeZone: string,
): CalendarDateKey => {
  if (event.allDay) {
    const allDayStart = event.allDayStartCalendarDate;
    const allDayEndExclusive = event.allDayEndCalendarDateExclusive;

    if (allDayStart && allDayEndExclusive && allDayEndExclusive > allDayStart) {
      return addDaysToCalendarDate(allDayEndExclusive, -1);
    }

    if (allDayStart) {
      return allDayStart;
    }
  }

  return toCalendarDateInTimeZone(
    new Date(getEventEndExclusive(event).getTime() - 1),
    timeZone,
  ) as CalendarDateKey;
};

const eventOccursOnDay = (
  event: CalendarTileEvent,
  calendarDate: CalendarDateKey,
  timeZone: string,
): boolean => {
  const startDate = event.allDay
    ? event.allDayStartCalendarDate
    : (toCalendarDateInTimeZone(event.startDate, timeZone) as CalendarDateKey);
  const lastOccupiedDate = getEventLastOccupiedCalendarDate(event, timeZone);

  return startDate !== null && startDate <= calendarDate && lastOccupiedDate >= calendarDate;
};

const isPastEvent = (
  event: CalendarTileEvent,
  referenceCalendarDate: CalendarDateKey,
  timeZone: string,
): boolean =>
  // Keep all events on the current site-local day at full emphasis.
  getEventLastOccupiedCalendarDate(event, timeZone) < referenceCalendarDate;

const eventStyleForView = (
  event: CalendarTileEvent,
  referenceCalendarDate: CalendarDateKey,
  timeZone: string,
): CSSProperties | undefined => {
  const baseStyle = eventAccentStyle(event.sourceColor);
  if (!isPastEvent(event, referenceCalendarDate, timeZone)) {
    return baseStyle;
  }
  return baseStyle ? { ...baseStyle, opacity: 0.52 } : { opacity: 0.52 };
};

const formatEventTime = (event: CalendarTileEvent, timeFormatter: Intl.DateTimeFormat): string => {
  if (event.allDay) {
    return "All day";
  }

  const start = timeFormatter.format(event.startDate);

  if (!event.endDate) {
    return start;
  }

  const end = timeFormatter.format(event.endDate);
  return `${start} - ${end}`;
};

const buildCalendarSnapshotKey = (
  instanceId: string,
  settings: Pick<CalendarModuleConfig, "feedSelections" | "legacyCalendars">,
): string =>
  `calendar:${instanceId}:${JSON.stringify({
    feedSelections: settings.feedSelections,
    legacyCalendars: settings.legacyCalendars,
  })}`;

const loadCalendarEvents = async (instanceId: string, signal: AbortSignal) => {
  const response = await fetch(`/api/modules/calendar/${encodeURIComponent(instanceId)}/events`, {
    method: "GET",
    signal,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message =
      payload && typeof payload.message === "string"
        ? payload.message
        : `Request failed (${response.status})`;
    throw new Error(message);
  }

  const payload = await response.json();
  return calendarModuleEventsResponseSchema.parse(payload);
};

export const moduleDefinition = defineModule({
  manifest: {
    id: "calendar",
    name: "Calendar",
    version: "2.0.0",
    description: "Calendar module migrated to Hearth Module SDK",
    icon: "calendar",
    defaultSize: { w: 6, h: 4 },
    timeMode: "site-local",
    categories: ["calendar"],
    permissions: ["network", "calendar"],
    dataSources: [{ id: "calendar-events", kind: "rest" }],
  },
  settingsSchema: calendarModuleConfigSchema,
  dataSchema: calendarModuleEventsResponseSchema,
  runtime: {
    Component: ({ instanceId, settings, isEditing }) => {
      const [siteTimeZone, setSiteTimeZone] = useState(() => getDisplaySiteTimeZone());
      const [displayNow, setDisplayNow] = useState(() => getDisplayNow());
      const snapshotKey = useMemo(
        () => buildCalendarSnapshotKey(instanceId, settings),
        [instanceId, settings.feedSelections, settings.legacyCalendars],
      );
      const initialSnapshot = useMemo(
        () =>
          readPersistedModuleSnapshot({
            key: snapshotKey,
            parse: (storedPayload) => calendarModuleEventsResponseSchema.parse(storedPayload),
            maxAgeMs: CALENDAR_SNAPSHOT_MAX_AGE_MS,
          }),
        [snapshotKey],
      );
      const [payload, setPayload] = useState(
        () =>
          initialSnapshot?.data ??
          calendarModuleEventsResponseSchema.parse({
            generatedAt: new Date().toISOString(),
            sources: [],
            events: [],
            warnings: [],
          }),
      );
      const [error, setError] = useState<string | null>(null);
      const [loading, setLoading] = useState(() => initialSnapshot === null);
      const [lastUpdatedMs, setLastUpdatedMs] = useState<number | null>(
        () => initialSnapshot?.updatedAtMs ?? null,
      );
      const loadRef = useRef<() => Promise<void>>(async () => undefined);
      const siteTimeZoneRef = useRef(siteTimeZone);
      const currentDateRef = useRef(
        toCalendarDateInTimeZone(displayNow, siteTimeZone) as CalendarDateKey,
      );
      const browserOnline = useBrowserOnlineStatus();
      const connectivityState = resolveModuleConnectivityState({
        error,
        hasSnapshot: lastUpdatedMs !== null,
        isOnline: browserOnline,
      });

      useEffect(() => {
        if (!initialSnapshot) {
          return;
        }

        setPayload(initialSnapshot.data);
        setLastUpdatedMs(initialSnapshot.updatedAtMs);
        setLoading(false);
      }, [initialSnapshot]);

      useEffect(() => {
        siteTimeZoneRef.current = siteTimeZone;
        currentDateRef.current = toCalendarDateInTimeZone(
          displayNow,
          siteTimeZone,
        ) as CalendarDateKey;
      }, [displayNow, siteTimeZone]);

      useEffect(() => {
        if (isEditing) {
          setLoading(false);
          setError(null);
          return;
        }

        let active = true;
        let abortController: AbortController | null = null;

        const refresh = async () => {
          abortController?.abort();
          abortController = new AbortController();

          try {
            const nextPayload = await loadCalendarEvents(instanceId, abortController.signal);

            if (!active) {
              return;
            }

            const updatedAtMs = Date.now();
            setPayload(nextPayload);
            setLastUpdatedMs(updatedAtMs);
            setError(null);
            writePersistedModuleSnapshot(snapshotKey, nextPayload, updatedAtMs);
          } catch (loadError) {
            if (!active || (loadError instanceof Error && loadError.name === "AbortError")) {
              return;
            }

            setError(loadError instanceof Error ? loadError.message : "Failed to load events");
          } finally {
            if (active) {
              setLoading(false);
            }
          }
        };
        loadRef.current = refresh;

        const syncDisplayClock = () => {
          const nextSiteTimeZone = getDisplaySiteTimeZone();
          const nextNow = getDisplayNow();
          const previousCalendarDate = currentDateRef.current;
          const nextCalendarDate = toCalendarDateInTimeZone(
            nextNow,
            nextSiteTimeZone,
          ) as CalendarDateKey;
          const siteTimeZoneChanged = siteTimeZoneRef.current !== nextSiteTimeZone;

          setSiteTimeZone(nextSiteTimeZone);
          setDisplayNow(nextNow);

          if (siteTimeZoneChanged || nextCalendarDate !== previousCalendarDate) {
            void refresh();
          }
        };
        const onVisibilityChange = () => {
          if (document.visibilityState === "visible") {
            setDisplayNow(getDisplayNow());
            void refresh();
          }
        };
        const onPageShow = () => {
          setDisplayNow(getDisplayNow());
          void refresh();
        };
        const onWindowFocus = () => {
          setDisplayNow(getDisplayNow());
          void refresh();
        };

        void refresh();
        const displayClockInterval = window.setInterval(() => {
          setDisplayNow(getDisplayNow());
        }, CALENDAR_CLOCK_TICK_MS);
        const removeDisplayTimeListener = addDisplayTimeContextListener(() => {
          syncDisplayClock();
        });
        document.addEventListener("visibilitychange", onVisibilityChange);
        window.addEventListener("pageshow", onPageShow);
        window.addEventListener("focus", onWindowFocus);
        const refreshMs = Math.max(settings.refreshIntervalSeconds, 30) * 1000;
        const timer = window.setInterval(() => {
          void refresh();
        }, refreshMs);

        return () => {
          active = false;
          removeDisplayTimeListener();
          document.removeEventListener("visibilitychange", onVisibilityChange);
          window.removeEventListener("pageshow", onPageShow);
          window.removeEventListener("focus", onWindowFocus);
          window.clearInterval(displayClockInterval);
          window.clearInterval(timer);
          abortController?.abort();
        };
      }, [instanceId, isEditing, settings.refreshIntervalSeconds, snapshotKey]);

      const todayCalendarDate = useMemo(
        () => toCalendarDateInTimeZone(displayNow, siteTimeZone) as CalendarDateKey,
        [displayNow, siteTimeZone],
      );

      useEffect(() => {
        if (isEditing) {
          return;
        }

        const delayMs =
          getMillisecondsUntilNextCalendarDateInTimeZone(getDisplayNow(), siteTimeZone) + 250;
        const timer = window.setTimeout(() => {
          setDisplayNow(getDisplayNow());
          void loadRef.current();
        }, delayMs);

        return () => {
          window.clearTimeout(timer);
        };
      }, [isEditing, siteTimeZone, todayCalendarDate]);

      const parsedEvents = useMemo<CalendarTileEvent[]>(
        () =>
          payload.events
            .map((event) => {
              const startDate = parseCalendarEventBoundary(event.start, event.allDay);
              const endDate = event.end
                ? parseCalendarEventBoundary(event.end, event.allDay)
                : null;

              if (!startDate) {
                return null;
              }

              if (event.end && !endDate) {
                return null;
              }

              return {
                ...event,
                startDate,
                endDate,
                allDayStartCalendarDate: event.allDay
                  ? parseSerializedAllDayCalendarDate(event.start)
                  : null,
                allDayEndCalendarDateExclusive: event.allDay
                  ? parseSerializedAllDayCalendarDate(event.end)
                  : null,
              };
            })
            .filter((event): event is CalendarTileEvent => event !== null),
        [payload.events],
      );

      const timeFormatter = useMemo(
        () =>
          new Intl.DateTimeFormat(undefined, {
            hour: "2-digit",
            minute: "2-digit",
            hour12: !settings.use24Hour,
            timeZone: siteTimeZone,
          }),
        [settings.use24Hour, siteTimeZone],
      );

      const dayFormatter = useMemo(
        () =>
          new Intl.DateTimeFormat(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          }),
        [],
      );

      const monthDayFormatter = useMemo(
        () => new Intl.DateTimeFormat(undefined, { day: "numeric", timeZone: "UTC" }),
        [],
      );
      const monthNameFormatter = useMemo(
        () => new Intl.DateTimeFormat(undefined, { month: "long", timeZone: "UTC" }),
        [],
      );

      const headerTitle =
        settings.viewMode === "month"
          ? monthNameFormatter.format(parseCalendarDateKey(todayCalendarDate))
          : "Upcoming";
      const headerViewLabel =
        settings.viewMode === "month" ? "Month" : settings.viewMode.toUpperCase();

      const listDays = useMemo(() => {
        return Array.from({ length: settings.daysToShow }, (_value, index) =>
          addDaysToCalendarDate(todayCalendarDate, index),
        );
      }, [settings.daysToShow, todayCalendarDate]);

      const weekDays = useMemo(() => {
        return Array.from({ length: 7 }, (_value, index) =>
          addDaysToCalendarDate(todayCalendarDate, index),
        );
      }, [todayCalendarDate]);

      const monthGrid = useMemo(() => {
        return buildRollingMonthGrid(todayCalendarDate);
      }, [todayCalendarDate]);

      const calendarLegendEntries = useMemo(() => {
        const seenSources = new Set<string>();
        const entries: CalendarModuleSource[] = [];

        for (const source of payload.sources) {
          if (seenSources.has(source.id)) {
            continue;
          }

          seenSources.add(source.id);
          entries.push(source);
        }

        return entries;
      }, [payload.sources]);

      const hasListEvents = useMemo(
        () =>
          listDays.some((day) =>
            parsedEvents.some((event) => eventOccursOnDay(event, day, siteTimeZone)),
          ),
        [listDays, parsedEvents, siteTimeZone],
      );

      if (isEditing) {
        return (
          <div className="flex h-full flex-col justify-center rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-3 text-slate-200">
            <p className="module-copy-title text-slate-100">Calendar preview</p>
            <p className="module-copy-meta mt-2 text-slate-300">
              Events load from the active layout on the dashboard.
            </p>
            <p className="module-copy-meta mt-3 text-slate-400">
              View: {settings.viewMode} | Sources:{" "}
              {settings.feedSelections.length + settings.legacyCalendars.length}
            </p>
          </div>
        );
      }

      return (
        <div className="module-panel-shell relative flex h-full min-h-0 flex-col overflow-hidden p-2 text-slate-100">
          <ModuleConnectionBadge visible={connectivityState.showDisconnected} />
          <header className="mb-2 flex items-center justify-between rounded border border-slate-700/80 bg-slate-900/80 px-3 py-2">
            <p className="module-copy-title text-slate-100">{headerTitle}</p>
            <p className="module-copy-label text-slate-400">{headerViewLabel}</p>
          </header>

          {loading ? (
            <div className="module-copy-body flex min-h-0 flex-1 items-center justify-center text-slate-300">
              Loading calendar...
            </div>
          ) : null}

          {!loading && connectivityState.blockingError ? (
            <div className="module-copy-meta flex min-h-0 flex-1 items-center justify-center rounded border border-rose-500/60 bg-rose-500/10 px-3 text-center text-rose-200">
              {connectivityState.blockingError}
            </div>
          ) : null}

          {!loading && !connectivityState.blockingError && settings.viewMode === "list" ? (
            <div className="min-h-0 flex flex-1 flex-col overflow-hidden">
              {calendarLegendEntries.length > 0 ? (
                <div className="mb-2 flex flex-wrap gap-1.5 pr-1">
                  {calendarLegendEntries.map((entry) => (
                    <span
                      key={entry.id}
                      title={entry.label}
                      className="module-copy-label inline-flex items-center gap-1 rounded border border-slate-700/70 bg-slate-900/80 px-1.5 py-0.5 text-slate-200"
                    >
                      <span
                        className="rounded-full"
                        style={{
                          backgroundColor: entry.color,
                          width: "0.5rem",
                          height: "0.5rem",
                        }}
                      />
                      <span className="max-w-[120px] truncate">{entry.label}</span>
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                <div className="space-y-3">
                  {listDays.map((day) => {
                    const dayEvents = parsedEvents
                      .filter((event) => eventOccursOnDay(event, day, siteTimeZone))
                      .slice(0, 8);

                    if (dayEvents.length === 0) {
                      return null;
                    }

                    return (
                      <section
                        key={day}
                        className="rounded border border-slate-700/80 bg-slate-900/70 p-2"
                      >
                        <h4 className="module-copy-label mb-2 text-cyan-200">
                          {dayFormatter.format(parseCalendarDateKey(day))}
                        </h4>
                        <div className="space-y-2">
                          {dayEvents.map((event) => (
                            <article
                              key={event.id}
                              className="rounded border border-slate-700/70 bg-slate-950/70 px-2.5 py-1.5 text-left"
                              style={eventStyleForView(event, todayCalendarDate, siteTimeZone)}
                            >
                              <p className="module-copy-body line-clamp-2 text-left text-slate-100">
                                {event.title}
                              </p>
                              <p className="module-copy-meta mt-0.5 text-cyan-200">
                                {formatEventTime(event, timeFormatter)}
                              </p>
                              {event.location ? (
                                <p className="module-copy-meta mt-0.5 line-clamp-1 text-slate-300">
                                  {event.location}
                                </p>
                              ) : null}
                            </article>
                          ))}
                        </div>
                      </section>
                    );
                  })}
                  {!hasListEvents ? (
                    <p className="module-copy-meta rounded border border-slate-700 bg-slate-900/60 px-3 py-2 text-slate-300">
                      No upcoming events for the configured calendars.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {!loading && !connectivityState.blockingError && settings.viewMode === "week" ? (
            <div className="min-h-0 flex-1 overflow-x-auto">
              {calendarLegendEntries.length > 0 ? (
                <div className="mb-2 flex min-w-[680px] flex-wrap gap-1.5">
                  {calendarLegendEntries.map((entry) => (
                    <span
                      key={entry.id}
                      title={entry.label}
                      className="module-copy-label inline-flex items-center gap-1 rounded border border-slate-700/70 bg-slate-900/80 px-1.5 py-0.5 text-slate-200"
                    >
                      <span
                        className="rounded-full"
                        style={{
                          backgroundColor: entry.color,
                          width: "0.5rem",
                          height: "0.5rem",
                        }}
                      />
                      <span className="max-w-[120px] truncate">{entry.label}</span>
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="grid min-h-full min-w-[680px] grid-cols-7 gap-2">
                {weekDays.map((day) => {
                  const dayEvents = parsedEvents
                    .filter((event) => eventOccursOnDay(event, day, siteTimeZone))
                    .slice(0, 4);

                  return (
                    <section
                      key={day}
                      className="rounded border border-slate-700/80 bg-slate-900/70 p-2"
                    >
                      <h4 className="module-copy-label mb-2 text-center text-cyan-200">
                        {dayFormatter.format(parseCalendarDateKey(day))}
                      </h4>
                      <div className="space-y-1.5">
                        {dayEvents.map((event) => (
                          <article
                            key={event.id}
                            className="rounded border border-slate-700/70 bg-slate-950/80 px-2.5 py-1 text-left"
                            style={eventStyleForView(event, todayCalendarDate, siteTimeZone)}
                          >
                            <p className="module-copy-body line-clamp-2 text-left text-slate-100">
                              {event.title}
                            </p>
                            <p className="module-copy-meta mt-0.5 text-cyan-200">
                              {formatEventTime(event, timeFormatter)}
                            </p>
                          </article>
                        ))}
                        {dayEvents.length === 0 ? (
                          <p className="module-copy-meta text-center text-slate-400">No events</p>
                        ) : null}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          ) : null}

          {!loading && !connectivityState.blockingError && settings.viewMode === "month" ? (
            <div className="min-h-0 flex flex-1 flex-col overflow-hidden">
              {calendarLegendEntries.length > 0 ? (
                <div className="mb-2 flex min-w-[680px] flex-wrap gap-1.5 pr-1">
                  {calendarLegendEntries.map((entry) => (
                    <span
                      key={entry.id}
                      title={entry.label}
                      className="module-copy-label inline-flex items-center gap-1 rounded border border-slate-700/70 bg-slate-900/80 px-1.5 py-0.5 text-slate-200"
                    >
                      <span
                        className="rounded-full"
                        style={{
                          backgroundColor: entry.color,
                          width: "0.5rem",
                          height: "0.5rem",
                        }}
                      />
                      <span className="max-w-[120px] truncate">{entry.label}</span>
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="min-h-0 flex-1 overflow-auto pr-1">
                <div
                  className="grid min-h-full min-w-[720px] grid-cols-7 gap-1.5"
                  style={{
                    gridTemplateRows: `auto repeat(${monthGrid.weekCount}, minmax(0, 1fr))`,
                  }}
                >
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((dayLabel) => (
                    <p key={dayLabel} className="module-copy-label pb-1 text-center text-slate-400">
                      {dayLabel}
                    </p>
                  ))}

                  {monthGrid.cells.map((day) => {
                    const inMonth = day.slice(0, 7) === todayCalendarDate.slice(0, 7);
                    const isToday = day === todayCalendarDate;
                    const dayEvents = parsedEvents
                      .filter((event) => eventOccursOnDay(event, day, siteTimeZone))
                      .slice(0, 2);

                    return (
                      <section
                        key={day}
                        className={`flex h-full min-h-0 flex-col rounded border p-2 ${
                          inMonth
                            ? "border-slate-700/80 bg-slate-900/70"
                            : "border-slate-800/80 bg-slate-900/30"
                        }`}
                        style={
                          isToday
                            ? {
                                borderColor: "rgb(var(--color-text-accent-rgb) / 0.9)",
                                boxShadow:
                                  "inset 0 0 0 2px rgb(var(--color-text-accent-rgb) / 0.72)",
                              }
                            : undefined
                        }
                      >
                        <p
                          className={`shrink-0 text-right ${
                            inMonth ? "text-slate-200" : "text-slate-500"
                          } module-copy-meta`}
                        >
                          {monthDayFormatter.format(parseCalendarDateKey(day))}
                        </p>
                        <div className="mt-1.5 min-h-0 space-y-1.5 overflow-hidden">
                          {dayEvents.map((event) => (
                            <p
                              key={event.id}
                              className="module-copy-body line-clamp-2 rounded border border-slate-700/60 bg-slate-950/80 px-2 py-1 text-left leading-snug text-slate-100"
                              style={{
                                ...eventStyleForView(event, todayCalendarDate, siteTimeZone),
                              }}
                            >
                              {event.title}
                            </p>
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {!loading && !connectivityState.blockingError && payload.warnings.length > 0 ? (
            <div className="module-copy-label mt-2 rounded border border-amber-500/50 bg-amber-500/10 px-2 py-1 text-amber-100">
              {payload.warnings[0]}
            </div>
          ) : null}
        </div>
      );
    },
  },
  admin: {
    SettingsPanel: ({ settings, onChange }) => {
      const [availableFeeds, setAvailableFeeds] = useState<CalendarFeed[]>([]);
      const [draggedSelectionIndex, setDraggedSelectionIndex] = useState<number | null>(null);

      useEffect(() => {
        let active = true;
        void loadCalendarFeedOptions().then((feeds) => {
          if (!active) {
            return;
          }

          setAvailableFeeds(feeds);
        });
        return () => {
          active = false;
        };
      }, []);

      const applyPatch = (patch: Partial<CalendarModuleConfig>) => {
        onChange({
          ...settings,
          ...patch,
        });
      };

      const availableFeedMap = useMemo(
        () => buildCalendarFeedOptionMap(availableFeeds),
        [availableFeeds],
      );
      const selectedFeedIds = useMemo(
        () => new Set(settings.feedSelections.map((selection) => selection.feedId)),
        [settings.feedSelections],
      );
      const selectedFeedEntries = useMemo(
        () =>
          settings.feedSelections.map((selection, index) => {
            const feed = availableFeedMap.get(selection.feedId) ?? null;
            const effectiveLabel =
              selection.labelOverride?.trim() || feed?.name || `Missing feed: ${selection.feedId}`;
            const effectiveColor =
              normalizeCalendarColor(selection.colorOverride ?? undefined) ??
              normalizeCalendarColor(feed?.color) ??
              defaultCalendarColor(index);

            return {
              selection,
              index,
              feed,
              effectiveLabel,
              effectiveColor,
            };
          }),
        [availableFeedMap, settings.feedSelections],
      );

      const moveFeedSelection = (fromIndex: number, toIndex: number) => {
        if (
          fromIndex === toIndex ||
          fromIndex < 0 ||
          toIndex < 0 ||
          fromIndex >= settings.feedSelections.length ||
          toIndex >= settings.feedSelections.length
        ) {
          return;
        }

        const nextSelections = [...settings.feedSelections];
        const [movedSelection] = nextSelections.splice(fromIndex, 1);
        if (!movedSelection) {
          return;
        }

        nextSelections.splice(toIndex, 0, movedSelection);
        applyPatch({
          feedSelections: nextSelections,
        });
      };

      const updateFeedSelection = (
        index: number,
        patch: Partial<CalendarModuleConfig["feedSelections"][number]>,
      ) => {
        applyPatch({
          feedSelections: settings.feedSelections.map((selection, selectionIndex) =>
            selectionIndex === index ? { ...selection, ...patch } : selection,
          ),
        });
      };

      const toggleFeedSelection = (feedId: string, selected: boolean) => {
        if (selected) {
          if (selectedFeedIds.has(feedId)) {
            return;
          }

          applyPatch({
            feedSelections: [
              ...settings.feedSelections,
              {
                feedId,
                labelOverride: null,
                colorOverride: null,
              },
            ],
          });
          return;
        }

        applyPatch({
          feedSelections: settings.feedSelections.filter(
            (selection) => selection.feedId !== feedId,
          ),
        });
      };

      const updateLegacyCalendar = (
        index: number,
        patch: Partial<CalendarModuleConfig["legacyCalendars"][number]>,
      ) => {
        applyPatch({
          legacyCalendars: settings.legacyCalendars.map((entry, entryIndex) =>
            entryIndex === index ? { ...entry, ...patch } : entry,
          ),
        });
      };

      const removeLegacyCalendar = (index: number) => {
        applyPatch({
          legacyCalendars: settings.legacyCalendars.filter(
            (_entry, entryIndex) => entryIndex !== index,
          ),
        });
      };

      const onDragStart = (index: number) => (event: DragEvent<HTMLDivElement>) => {
        setDraggedSelectionIndex(index);
        event.dataTransfer.effectAllowed = "move";
      };

      const onDrop = (index: number) => (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        if (draggedSelectionIndex === null) {
          return;
        }

        moveFeedSelection(draggedSelectionIndex, index);
        setDraggedSelectionIndex(null);
      };

      return (
        <div className="space-y-4 rounded-lg border border-slate-700 bg-slate-900 p-4 text-sm text-slate-200">
          <h3 className="text-base font-semibold">Calendar settings</h3>

          <label className="block space-y-2">
            <span>View mode</span>
            <select
              className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
              value={settings.viewMode}
              onChange={(event) =>
                applyPatch({
                  viewMode: event.target.value as CalendarModuleConfig["viewMode"],
                })
              }
            >
              <option value="list">List</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
            </select>
          </label>

          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-slate-100">Saved calendar feeds</p>
                <p className="mt-1 text-xs text-slate-400">
                  Feed URLs live in Admin &gt; Settings. This module stores feed IDs and optional
                  per-layout label and color overrides.
                </p>
              </div>
            </div>
            <div className="space-y-2 rounded border border-slate-700/80 bg-slate-900/60 p-3">
              {availableFeeds.length === 0 ? (
                <p className="text-xs text-slate-400">
                  No saved feeds yet. Add them from Admin &gt; Settings &gt; Calendar feeds.
                </p>
              ) : (
                availableFeeds.map((feed) => {
                  const selected = selectedFeedIds.has(feed.id);
                  return (
                    <label
                      key={feed.id}
                      className="flex items-center justify-between gap-3 rounded border border-slate-800 bg-slate-950/60 px-3 py-2"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={!feed.enabled && !selected}
                          onChange={(event) => toggleFeedSelection(feed.id, event.target.checked)}
                        />
                        <span
                          className="inline-block h-3 w-3 shrink-0 rounded-full"
                          style={{
                            backgroundColor: normalizeCalendarColor(feed.color) ?? "#22D3EE",
                          }}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm text-slate-100">{feed.name}</p>
                          <p className="truncate font-mono text-[11px] text-slate-400">{feed.id}</p>
                        </div>
                      </div>
                      {!feed.enabled ? (
                        <span className="rounded border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-200">
                          Disabled
                        </span>
                      ) : null}
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <div className="space-y-2">
            <p className="font-medium text-slate-100">Selected feeds</p>
            {selectedFeedEntries.length === 0 ? (
              <p className="rounded border border-slate-700/80 bg-slate-900/60 px-3 py-2 text-xs text-slate-400">
                Select one or more saved feeds above.
              </p>
            ) : (
              <div className="space-y-2">
                {selectedFeedEntries.map((entry) => (
                  <div
                    key={`${entry.selection.feedId}-${entry.index}`}
                    draggable={selectedFeedEntries.length > 1}
                    onDragStart={onDragStart(entry.index)}
                    onDragOver={(event) => event.preventDefault()}
                    onDragEnd={() => setDraggedSelectionIndex(null)}
                    onDrop={onDrop(entry.index)}
                    className={`space-y-3 rounded border p-3 ${
                      draggedSelectionIndex === entry.index
                        ? "border-cyan-400 bg-cyan-500/10"
                        : "border-slate-700/80 bg-slate-900/60"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-3 w-3 rounded-full"
                            style={{ backgroundColor: entry.effectiveColor }}
                          />
                          <p className="truncate font-medium text-slate-100">
                            {entry.effectiveLabel}
                          </p>
                        </div>
                        <p className="mt-1 font-mono text-[11px] text-slate-400">
                          {entry.selection.feedId}
                        </p>
                        {!entry.feed ? (
                          <p className="mt-1 text-xs text-rose-200">
                            This saved feed no longer exists. Remove it or relink the layout.
                          </p>
                        ) : null}
                        {entry.feed && !entry.feed.enabled ? (
                          <p className="mt-1 text-xs text-amber-200">
                            This saved feed is disabled globally.
                          </p>
                        ) : null}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={entry.index === 0}
                          onClick={() => moveFeedSelection(entry.index, entry.index - 1)}
                          className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-100 hover:border-slate-400 disabled:opacity-50"
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          disabled={entry.index === selectedFeedEntries.length - 1}
                          onClick={() => moveFeedSelection(entry.index, entry.index + 1)}
                          className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-100 hover:border-slate-400 disabled:opacity-50"
                        >
                          Down
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleFeedSelection(entry.selection.feedId, false)}
                          className="rounded border border-rose-400/70 px-2 py-1 text-xs text-rose-100 hover:bg-rose-500/20"
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    <label className="flex items-center justify-between">
                      <span>Use default label</span>
                      <input
                        type="checkbox"
                        checked={entry.selection.labelOverride === null}
                        onChange={(event) =>
                          updateFeedSelection(entry.index, {
                            labelOverride: event.target.checked ? null : (entry.feed?.name ?? ""),
                          })
                        }
                      />
                    </label>
                    {entry.selection.labelOverride !== null ? (
                      <label className="block space-y-1">
                        <span className="text-[11px] font-medium text-slate-300">
                          Label override
                        </span>
                        <input
                          className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-100"
                          type="text"
                          value={entry.selection.labelOverride}
                          onChange={(event) =>
                            updateFeedSelection(entry.index, {
                              labelOverride: event.target.value,
                            })
                          }
                        />
                      </label>
                    ) : null}

                    <label className="flex items-center justify-between">
                      <span>Use default color</span>
                      <input
                        type="checkbox"
                        checked={entry.selection.colorOverride === null}
                        onChange={(event) =>
                          updateFeedSelection(entry.index, {
                            colorOverride: event.target.checked ? null : entry.effectiveColor,
                          })
                        }
                      />
                    </label>
                    {entry.selection.colorOverride !== null ? (
                      <div className="flex items-center gap-2">
                        <input
                          className="h-9 w-12 cursor-pointer rounded border border-slate-600 bg-slate-800 p-1"
                          type="color"
                          value={entry.effectiveColor}
                          onChange={(event) =>
                            updateFeedSelection(entry.index, {
                              colorOverride:
                                normalizeCalendarColor(event.target.value) ?? entry.effectiveColor,
                            })
                          }
                        />
                        <p className="text-xs text-slate-400">
                          Default: {entry.feed?.color ?? "not available"}
                        </p>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          {settings.legacyCalendars.length > 0 ? (
            <div className="space-y-2">
              <p className="font-medium text-slate-100">Legacy per-layout sources</p>
              <p className="text-xs text-amber-200">
                These old per-layout calendar URLs still work, but saved feeds are preferred so one
                admin change updates every layout.
              </p>
              <div className="space-y-2">
                {settings.legacyCalendars.map((entry, index) => {
                  const effectiveColor =
                    normalizeCalendarColor(entry.color ?? undefined) ?? defaultCalendarColor(index);

                  return (
                    <div
                      key={`${entry.source}-${index}`}
                      className="space-y-2 rounded border border-slate-700/80 bg-slate-900/60 p-3"
                    >
                      <label className="block space-y-1">
                        <span className="text-[11px] font-medium text-slate-300">Legacy name</span>
                        <input
                          className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-100"
                          type="text"
                          value={entry.label ?? ""}
                          onChange={(event) =>
                            updateLegacyCalendar(index, {
                              label: event.target.value,
                            })
                          }
                        />
                      </label>
                      <div className="flex gap-2">
                        <input
                          className="h-9 w-12 cursor-pointer rounded border border-slate-600 bg-slate-800 p-1"
                          type="color"
                          value={effectiveColor}
                          onChange={(event) =>
                            updateLegacyCalendar(index, {
                              color: normalizeCalendarColor(event.target.value) ?? effectiveColor,
                            })
                          }
                        />
                        <input
                          className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-100"
                          type="text"
                          value={entry.source}
                          placeholder="https://calendar.example.com/family.ics or /data/family.ics"
                          onChange={(event) =>
                            updateLegacyCalendar(index, {
                              source: event.target.value,
                            })
                          }
                        />
                        <button
                          type="button"
                          onClick={() => removeLegacyCalendar(index)}
                          className="rounded border border-rose-400/70 px-2 py-1 text-xs text-rose-100 hover:bg-rose-500/20"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <label className="block space-y-2">
            <span>Days to show (list view)</span>
            <input
              className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
              type="number"
              min={1}
              max={90}
              value={settings.daysToShow}
              onChange={(event) =>
                applyPatch({
                  daysToShow: Math.max(1, Math.min(90, Number(event.target.value) || 1)),
                })
              }
            />
          </label>

          <label className="flex items-center justify-between">
            <span>Use 24-hour time</span>
            <input
              type="checkbox"
              checked={settings.use24Hour}
              onChange={(event) => applyPatch({ use24Hour: event.target.checked })}
            />
          </label>

          <label className="block space-y-2">
            <span>Refresh interval (seconds)</span>
            <input
              className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
              type="number"
              min={30}
              max={86_400}
              value={settings.refreshIntervalSeconds}
              onChange={(event) =>
                applyPatch({
                  refreshIntervalSeconds: Math.max(
                    30,
                    Math.min(86_400, Number(event.target.value) || 30),
                  ),
                })
              }
            />
          </label>

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
