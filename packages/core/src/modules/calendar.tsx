import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  calendarModuleConfigSchema,
  calendarModuleEventsResponseSchema,
  parseCalendarEventBoundary,
  type CalendarModuleConfig,
  type CalendarModuleEvent,
  type ModuleDefinition,
} from "@hearth/shared";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CALENDAR_CONFIG = calendarModuleConfigSchema.parse({});
const CALENDAR_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
const CALENDAR_DEFAULT_COLORS = [
  "#22D3EE",
  "#60A5FA",
  "#A78BFA",
  "#34D399",
  "#F59E0B",
  "#FB7185",
  "#F97316",
  "#38BDF8",
];
const REMOTE_PROTOCOL_REGEX = /^(https?|webcals?):\/\//i;
const WEB_CAL_DOUBLE_SLASH_REGEX = /^webcals?:\/\//i;
const WEB_CAL_SINGLE_SLASH_REGEX = /^webcals?:\/(?!\/)/i;

type CalendarTileEvent = CalendarModuleEvent & {
  startDate: Date;
  endDate: Date | null;
};

const addDays = (date: Date, days: number): Date => new Date(date.getTime() + days * DAY_MS);

const startOfDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);

const normalizeConfig = (config: unknown): CalendarModuleConfig => {
  const parsedConfig = calendarModuleConfigSchema.safeParse(config);
  return parsedConfig.success ? parsedConfig.data : DEFAULT_CALENDAR_CONFIG;
};

const defaultCalendarColor = (index: number): string =>
  CALENDAR_DEFAULT_COLORS[index % CALENDAR_DEFAULT_COLORS.length] ?? "#22D3EE";

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

const toCalendarSourceLabel = (source: string): string => {
  const trimmed = source.trim();
  if (trimmed.length === 0) {
    return "Calendar";
  }

  if (REMOTE_PROTOCOL_REGEX.test(trimmed)) {
    const normalizedUrl = WEB_CAL_DOUBLE_SLASH_REGEX.test(trimmed)
      ? trimmed.replace(WEB_CAL_DOUBLE_SLASH_REGEX, "https://")
      : WEB_CAL_SINGLE_SLASH_REGEX.test(trimmed)
        ? trimmed.replace(WEB_CAL_SINGLE_SLASH_REGEX, "https://")
        : trimmed;

    try {
      const url = new URL(normalizedUrl);
      return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`;
    } catch {
      return trimmed;
    }
  }

  const normalizedPath = trimmed.replace(/\\/g, "/");
  const segments = normalizedPath.split("/").filter((entry) => entry.length > 0);
  return segments[segments.length - 1] ?? normalizedPath;
};

const resolveCalendarLabel = (
  source: string,
  configuredLabel: string | undefined,
): string => {
  const trimmedLabel = configuredLabel?.trim() ?? "";
  if (trimmedLabel.length > 0) {
    return trimmedLabel;
  }

  return toCalendarSourceLabel(source);
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
    borderColor: alphaHex(color, 0.62),
    boxShadow: `inset 8px 0 0 ${alphaHex(color, 0.78)}`,
  };
};

const getEventEndExclusive = (event: CalendarTileEvent): Date => {
  const eventStart = event.startDate;
  if (event.endDate && event.endDate.getTime() > eventStart.getTime()) {
    return event.endDate;
  }
  return new Date(eventStart.getTime() + 1);
};

const eventOccursOnDay = (event: CalendarTileEvent, date: Date): boolean => {
  const dayStart = startOfDay(date);
  const nextDayStart = addDays(dayStart, 1);
  const eventStart = event.startDate;
  const eventEndExclusive = getEventEndExclusive(event);

  // Use exclusive end semantics to avoid spilling midnight-ending events
  // into the following day.
  return eventStart < nextDayStart && eventEndExclusive > dayStart;
};

const isPastEvent = (event: CalendarTileEvent, reference: Date): boolean =>
  getEventEndExclusive(event).getTime() <= reference.getTime();

const eventStyleForView = (
  event: CalendarTileEvent,
  reference: Date,
): CSSProperties | undefined => {
  const baseStyle = eventAccentStyle(event.sourceColor);
  if (!isPastEvent(event, reference)) {
    return baseStyle;
  }
  return baseStyle ? { ...baseStyle, opacity: 0.52 } : { opacity: 0.52 };
};

const formatEventTime = (
  event: CalendarTileEvent,
  timeFormatter: Intl.DateTimeFormat,
): string => {
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

const loadCalendarEvents = async (
  instanceId: string,
  signal: AbortSignal,
) => {
  const response = await fetch(
    `/api/modules/calendar/${encodeURIComponent(instanceId)}/events`,
    {
      method: "GET",
      signal,
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

  const payload = await response.json();
  return calendarModuleEventsResponseSchema.parse(payload);
};

export const calendarModule: ModuleDefinition<CalendarModuleConfig> = {
  id: "calendar",
  displayName: "Calendar",
  defaultSize: { w: 6, h: 4 },
  configSchema: calendarModuleConfigSchema,
  DashboardTile: ({ instanceId, config, isEditing }) => {
    const normalizedConfig = useMemo(() => normalizeConfig(config), [config]);
    const [payload, setPayload] = useState(() =>
      calendarModuleEventsResponseSchema.parse({
        generatedAt: new Date().toISOString(),
        events: [],
        warnings: [],
      }),
    );
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

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
          const nextPayload = await loadCalendarEvents(
            instanceId,
            abortController.signal,
          );

          if (!active) {
            return;
          }

          setPayload(nextPayload);
          setError(null);
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

      void refresh();
      const refreshMs = Math.max(normalizedConfig.refreshIntervalSeconds, 30) * 1000;
      const timer = window.setInterval(() => {
        void refresh();
      }, refreshMs);

      return () => {
        active = false;
        window.clearInterval(timer);
        abortController?.abort();
      };
    }, [instanceId, isEditing, normalizedConfig.refreshIntervalSeconds]);

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
          hour12: !normalizedConfig.use24Hour,
        }),
      [normalizedConfig.use24Hour],
    );

    const dayFormatter = useMemo(
      () =>
        new Intl.DateTimeFormat(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
        }),
      [],
    );

    const monthDayFormatter = useMemo(
      () => new Intl.DateTimeFormat(undefined, { day: "numeric" }),
      [],
    );
    const monthNameFormatter = useMemo(
      () => new Intl.DateTimeFormat(undefined, { month: "long" }),
      [],
    );

    const now = new Date();
    const headerViewLabel =
      normalizedConfig.viewMode === "month"
        ? monthNameFormatter.format(now)
        : normalizedConfig.viewMode.toUpperCase();

    const listDays = useMemo(() => {
      const firstDay = startOfDay(now);
      return Array.from(
        { length: normalizedConfig.daysToShow },
        (_value, index) => addDays(firstDay, index),
      );
    }, [normalizedConfig.daysToShow, now]);

    const weekDays = useMemo(() => {
      const firstDay = startOfDay(now);
      return Array.from({ length: 7 }, (_value, index) => addDays(firstDay, index));
    }, [now]);

    const monthCells = useMemo(() => {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const gridStart = addDays(startOfDay(monthStart), -monthStart.getDay());
      return Array.from({ length: 42 }, (_value, index) => addDays(gridStart, index));
    }, [now]);

    const calendarLegendEntries = useMemo(() => {
      const seenSources = new Set<string>();
      const entries: Array<{ source: string; label: string; color: string }> = [];

      for (let index = 0; index < normalizedConfig.calendars.length; index += 1) {
        const source = normalizedConfig.calendars[index]?.trim() ?? "";
        if (source.length === 0 || seenSources.has(source)) {
          continue;
        }

        seenSources.add(source);
        entries.push({
          source,
          label: resolveCalendarLabel(
            source,
            normalizedConfig.calendarLabels[index],
          ),
          color:
            normalizeCalendarColor(normalizedConfig.calendarColors[index]) ??
            defaultCalendarColor(index),
        });
      }

      return entries;
    }, [
      normalizedConfig.calendarColors,
      normalizedConfig.calendarLabels,
      normalizedConfig.calendars,
    ]);

    const hasListEvents = useMemo(
      () =>
        listDays.some((day) =>
          parsedEvents.some((event) => eventOccursOnDay(event, day)),
        ),
      [listDays, parsedEvents],
    );

    if (isEditing) {
      return (
        <div className="flex h-full flex-col justify-center rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-3 text-slate-200">
          <p className="text-sm font-semibold text-slate-100">Calendar preview</p>
          <p className="mt-2 text-xs text-slate-300">
            Events load from the active layout on the dashboard.
          </p>
          <p className="mt-3 text-xs text-slate-400">
            View: {normalizedConfig.viewMode} | Sources: {normalizedConfig.calendars.length}
          </p>
        </div>
      );
    }

    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-slate-700 bg-gradient-to-b from-slate-900 to-slate-950 p-2 text-slate-100">
        <header className="mb-2 flex items-center justify-between rounded-md border border-slate-700/80 bg-slate-900/80 px-3 py-2">
          <p className="text-sm font-semibold tracking-wide text-slate-100">Upcoming</p>
          <p className="text-[11px] tracking-wide text-slate-400">
            {headerViewLabel}
          </p>
        </header>

        {loading ? (
          <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-slate-300">
            Loading calendar...
          </div>
        ) : null}

        {!loading && error ? (
          <div className="flex min-h-0 flex-1 items-center justify-center rounded-md border border-rose-500/60 bg-rose-500/10 px-3 text-center text-xs text-rose-200">
            {error}
          </div>
        ) : null}

        {!loading && !error && normalizedConfig.viewMode === "list" ? (
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="space-y-3">
              {listDays.map((day) => {
                const dayEvents = parsedEvents
                  .filter((event) => eventOccursOnDay(event, day))
                  .slice(0, 8);

                if (dayEvents.length === 0) {
                  return null;
                }

                return (
                  <section key={day.toISOString()} className="rounded-md border border-slate-700/80 bg-slate-900/70 p-2">
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-cyan-200">
                      {dayFormatter.format(day)}
                    </h4>
                    <div className="space-y-2">
                      {dayEvents.map((event) => (
                        <article
                          key={event.id}
                          className="rounded border border-slate-700/70 bg-slate-950/70 pl-4 pr-2 py-1.5"
                          style={eventAccentStyle(event.sourceColor)}
                        >
                          <p className="line-clamp-2 text-[13px] font-semibold text-slate-100">
                            {event.title}
                          </p>
                          <p className="mt-0.5 text-[11px] text-cyan-200">
                            {formatEventTime(event, timeFormatter)}
                          </p>
                          {event.location ? (
                            <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-300">
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
                <p className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-300">
                  No upcoming events for the configured calendars.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {!loading && !error && normalizedConfig.viewMode === "week" ? (
          <div className="min-h-0 flex-1 overflow-x-auto">
            {calendarLegendEntries.length > 0 ? (
              <div className="mb-2 flex min-w-[680px] flex-wrap gap-1.5">
                {calendarLegendEntries.map((entry) => (
                  <span
                    key={entry.source}
                    title={entry.label}
                    className="inline-flex items-center gap-1 rounded border border-slate-700/70 bg-slate-900/80 px-1.5 py-0.5 text-[10px] text-slate-200"
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="max-w-[120px] truncate">{entry.label}</span>
                  </span>
                ))}
              </div>
            ) : null}
            <div className="grid min-h-full min-w-[680px] grid-cols-7 gap-2">
              {weekDays.map((day) => {
                const dayEvents = parsedEvents
                  .filter((event) => eventOccursOnDay(event, day))
                  .slice(0, 4);

                return (
                  <section
                    key={day.toISOString()}
                    className="rounded-md border border-slate-700/80 bg-slate-900/70 p-2"
                  >
                    <h4 className="mb-2 text-center text-[11px] font-semibold uppercase tracking-wide text-cyan-200">
                      {dayFormatter.format(day)}
                    </h4>
                    <div className="space-y-1.5">
                      {dayEvents.map((event) => (
                        <article
                          key={event.id}
                          className="rounded border border-slate-700/70 bg-slate-950/80 pl-4 pr-2 py-1"
                          style={eventStyleForView(event, now)}
                        >
                          <p className="line-clamp-2 text-[11px] font-medium text-slate-100">
                            {event.title}
                          </p>
                          <p className="mt-0.5 text-[10px] text-cyan-200">
                            {formatEventTime(event, timeFormatter)}
                          </p>
                        </article>
                      ))}
                      {dayEvents.length === 0 ? (
                        <p className="text-center text-[10px] text-slate-400">No events</p>
                      ) : null}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        ) : null}

        {!loading && !error && normalizedConfig.viewMode === "month" ? (
          <div className="min-h-0 flex flex-1 flex-col overflow-hidden">
            {calendarLegendEntries.length > 0 ? (
              <div className="mb-2 flex min-w-[680px] flex-wrap gap-1.5 pr-1">
                {calendarLegendEntries.map((entry) => (
                  <span
                    key={entry.source}
                    title={entry.label}
                    className="inline-flex items-center gap-1 rounded border border-slate-700/70 bg-slate-900/80 px-1.5 py-0.5 text-[10px] text-slate-200"
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="max-w-[120px] truncate">{entry.label}</span>
                  </span>
                ))}
              </div>
            ) : null}
            <div className="min-h-0 flex-1 overflow-auto pr-1">
              <div className="grid min-h-full min-w-[680px] grid-cols-7 grid-rows-[auto_repeat(6,minmax(0,1fr))] gap-1 text-[11px]">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((dayLabel) => (
                  <p
                    key={dayLabel}
                    className="pb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400"
                  >
                    {dayLabel}
                  </p>
                ))}

                {monthCells.map((day) => {
                  const inMonth = day.getMonth() === now.getMonth();
                  const dayEvents = parsedEvents
                    .filter((event) => eventOccursOnDay(event, day))
                    .slice(0, 2);

                  return (
                    <section
                      key={day.toISOString()}
                      className={`flex h-full min-h-0 flex-col rounded border p-1.5 ${
                        inMonth
                          ? "border-slate-700/80 bg-slate-900/70"
                          : "border-slate-800/80 bg-slate-900/30"
                      }`}
                    >
                      <p
                        className={`shrink-0 text-right text-[10px] ${
                          inMonth ? "text-slate-200" : "text-slate-500"
                        }`}
                      >
                        {monthDayFormatter.format(day)}
                      </p>
                      <div className="mt-1 min-h-0 space-y-1 overflow-hidden">
                        {dayEvents.map((event) => (
                          <p
                            key={event.id}
                            className="line-clamp-2 rounded border border-slate-700/60 bg-slate-950/80 pl-3 pr-1 py-0.5 text-[10px] text-slate-100"
                            style={eventStyleForView(event, now)}
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

        {!loading && !error && payload.warnings.length > 0 ? (
          <div className="mt-2 rounded border border-amber-500/50 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-100">
            {payload.warnings[0]}
          </div>
        ) : null}
      </div>
    );
  },
  SettingsPanel: ({ config, onChange }) => {
    const normalizedConfig = normalizeConfig(config);

    const applyPatch = (patch: Partial<CalendarModuleConfig>) => {
      onChange({
        ...normalizedConfig,
        ...patch,
      });
    };

    const calendarColorAt = (index: number): string =>
      normalizeCalendarColor(normalizedConfig.calendarColors[index]) ?? defaultCalendarColor(index);

    const updateCalendarSource = (index: number, nextValue: string) => {
      applyPatch({
        calendars: normalizedConfig.calendars.map((entry, entryIndex) =>
          entryIndex === index ? nextValue : entry,
        ),
      });
    };

    const updateCalendarLabel = (index: number, nextValue: string) => {
      const nextLabels = [...normalizedConfig.calendarLabels];
      nextLabels[index] = nextValue;
      applyPatch({
        calendarLabels: nextLabels,
      });
    };

    const updateCalendarColor = (index: number, nextColor: string) => {
      const color = normalizeCalendarColor(nextColor) ?? defaultCalendarColor(index);
      const nextColors = [...normalizedConfig.calendarColors];
      nextColors[index] = color;
      applyPatch({
        calendarColors: nextColors,
      });
    };

    const removeCalendarSource = (index: number) => {
      applyPatch({
        calendars: normalizedConfig.calendars.filter(
          (_entry, entryIndex) => entryIndex !== index,
        ),
        calendarLabels: normalizedConfig.calendarLabels.filter(
          (_entry, entryIndex) => entryIndex !== index,
        ),
        calendarColors: normalizedConfig.calendarColors.filter(
          (_entry, entryIndex) => entryIndex !== index,
        ),
      });
    };

    return (
      <div className="space-y-4 rounded-lg border border-slate-700 bg-slate-900 p-4 text-sm text-slate-200">
        <h3 className="text-base font-semibold">Calendar settings</h3>

        <label className="block space-y-2">
          <span>View mode</span>
          <select
            className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
            value={normalizedConfig.viewMode}
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
          <p className="font-medium text-slate-100">Calendars (.ics URL or file path)</p>
          <div className="space-y-2">
            {normalizedConfig.calendars.map((source, index) => (
              <div
                key={`${source}-${index}`}
                className="space-y-2 rounded border border-slate-700/80 bg-slate-900/60 p-2"
              >
                <label className="block space-y-1">
                  <span className="text-[11px] font-medium text-slate-300">
                    Calendar name
                  </span>
                  <input
                    className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-100"
                    type="text"
                    value={normalizedConfig.calendarLabels[index] ?? ""}
                    onChange={(event) =>
                      updateCalendarLabel(index, event.target.value)
                    }
                  />
                </label>
                <div className="flex gap-2">
                  <input
                    className="h-9 w-12 cursor-pointer rounded border border-slate-600 bg-slate-800 p-1"
                    type="color"
                    value={calendarColorAt(index)}
                    title={`Calendar color ${index + 1}`}
                    onChange={(event) => updateCalendarColor(index, event.target.value)}
                  />
                  <input
                    className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-100"
                    type="text"
                    value={source}
                    placeholder="https://calendar.example.com/family.ics or /data/family.ics"
                    onChange={(event) => updateCalendarSource(index, event.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => removeCalendarSource(index)}
                    className="rounded border border-rose-400/70 px-2 py-1 text-xs text-rose-100 hover:bg-rose-500/20"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              applyPatch({
                calendars: [...normalizedConfig.calendars, ""],
                calendarLabels: [...normalizedConfig.calendarLabels, ""],
                calendarColors: [
                  ...normalizedConfig.calendarColors,
                  defaultCalendarColor(normalizedConfig.calendars.length),
                ],
              })
            }
            className="rounded border border-slate-500 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:border-slate-300"
          >
            Add calendar source
          </button>
        </div>

        <label className="block space-y-2">
          <span>Days to show (list view)</span>
          <input
            className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
            type="number"
            min={1}
            max={90}
            value={normalizedConfig.daysToShow}
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
            checked={normalizedConfig.use24Hour}
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
            value={normalizedConfig.refreshIntervalSeconds}
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
      </div>
    );
  },
};
