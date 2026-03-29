import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, isAbsolute, resolve } from "node:path";
import type { ParameterValue, VEvent } from "node-ical";
import ical from "node-ical";
import {
  calendarModuleConfigSchema,
  calendarModuleEventsResponseSchema,
  serializeCalendarEventBoundary,
  type CalendarModuleEvent,
  type CalendarModuleEventsResponse,
} from "@hearth/shared";
import { config } from "../config.js";
import type { ModuleStateRepository } from "../repositories/module-state-repository.js";
import {
  readPersistedModuleResponse,
  writePersistedModuleResponse,
} from "./persisted-module-response-cache.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const CALENDAR_RANGE_DAYS_PAST = 1;
const CALENDAR_RANGE_DAYS_AHEAD = 120;
const MAX_RETURNED_EVENTS = 700;
const FETCH_TIMEOUT_MS = 10_000;
const CALENDAR_PERSISTED_RESPONSE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const REMOTE_PROTOCOL_REGEX = /^(https?|webcals?):\/\//i;
const WEB_CAL_DOUBLE_SLASH_REGEX = /^webcals?:\/\//i;
const WEB_CAL_SINGLE_SLASH_REGEX = /^webcals?:\/(?!\/)/i;

interface SourceCacheEntry {
  fetchedAtMs: number;
  events: CalendarModuleEvent[];
}

interface SourceLoadResult {
  events: CalendarModuleEvent[];
  warning: string | null;
  sourceStatus: "live" | "memory-cache" | "failed";
}

interface NormalizedSource {
  source: string;
  label: string;
  color: string;
}

const addDays = (date: Date, days: number): Date => new Date(date.getTime() + days * DAY_MS);

const startOfDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);

const endOfDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

const isRemoteSource = (source: string): boolean => REMOTE_PROTOCOL_REGEX.test(source);

const toRemoteFetchUrl = (source: string): string | null => {
  if (!isRemoteSource(source)) {
    return null;
  }

  if (WEB_CAL_DOUBLE_SLASH_REGEX.test(source)) {
    return source.replace(WEB_CAL_DOUBLE_SLASH_REGEX, "https://");
  }

  if (WEB_CAL_SINGLE_SLASH_REGEX.test(source)) {
    return source.replace(WEB_CAL_SINGLE_SLASH_REGEX, "https://");
  }

  return source;
};

const toSourceLabel = (source: string): string => {
  const remoteUrl = toRemoteFetchUrl(source);
  if (remoteUrl) {
    try {
      const url = new URL(remoteUrl);
      return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`;
    } catch {
      return "remote calendar";
    }
  }

  return basename(source);
};

const toPublicSourceId = (source: string): string =>
  `src-${createHash("sha256").update(source).digest("hex").slice(0, 16)}`;

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_CALENDAR_COLORS = [
  "#22D3EE",
  "#60A5FA",
  "#A78BFA",
  "#34D399",
  "#F59E0B",
  "#FB7185",
  "#F97316",
  "#38BDF8",
];

const defaultCalendarColor = (index: number): string =>
  DEFAULT_CALENDAR_COLORS[index % DEFAULT_CALENDAR_COLORS.length] ?? "#22D3EE";

const normalizeColor = (input: string | undefined): string | null => {
  if (typeof input !== "string") {
    return null;
  }

  const trimmed = input.trim();
  if (!HEX_COLOR_REGEX.test(trimmed)) {
    return null;
  }

  return trimmed.toUpperCase();
};

const normalizeSources = (
  sources: string[],
  labels: string[],
  colors: string[],
): NormalizedSource[] => {
  const seen = new Set<string>();
  const normalized: NormalizedSource[] = [];

  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index]?.trim() ?? "";
    if (source.length === 0 || seen.has(source)) {
      continue;
    }

    seen.add(source);
    const customLabel = labels[index]?.trim() ?? "";
    normalized.push({
      source,
      label: customLabel.length > 0 ? customLabel : toSourceLabel(source),
      color: normalizeColor(colors[index]) ?? defaultCalendarColor(index),
    });
  }

  return normalized;
};

const buildPersistedCalendarResponseKey = (sources: NormalizedSource[]): string =>
  `calendar-response:${createHash("sha256").update(JSON.stringify(sources)).digest("hex")}`;

const isValidDate = (value: unknown): value is Date =>
  value instanceof Date && !Number.isNaN(value.getTime());

const readParameterValue = (value: ParameterValue | undefined): string | null => {
  if (typeof value === "string") {
    return value.trim() || null;
  }

  if (value && typeof value === "object" && "val" in value) {
    const raw = value.val;
    if (typeof raw === "string") {
      return raw.trim() || null;
    }
  }

  return null;
};

const summarizeError = (error: unknown): string =>
  error instanceof Error && error.message.trim().length > 0
    ? error.message.trim()
    : "Unknown parsing error";

const applySourceColor = (
  events: CalendarModuleEvent[],
  sourceColor: string | null,
): CalendarModuleEvent[] =>
  events.map((event) => ({
    ...event,
    sourceColor,
  }));

export class CalendarFeedService {
  private readonly sourceCache = new Map<string, SourceCacheEntry>();

  constructor(private readonly moduleStateRepository: ModuleStateRepository | null = null) {}

  async getUpcomingEvents(rawConfig: unknown): Promise<CalendarModuleEventsResponse> {
    const parsedConfig = calendarModuleConfigSchema.parse(rawConfig);
    const sources = normalizeSources(
      parsedConfig.calendars,
      parsedConfig.calendarLabels,
      parsedConfig.calendarColors,
    );

    if (sources.length === 0) {
      return {
        generatedAt: new Date().toISOString(),
        events: [],
        warnings: ["Add at least one .ics URL or file path in Calendar settings."],
      };
    }

    const persistedResponseKey = buildPersistedCalendarResponseKey(sources);
    const refreshMs = Math.max(parsedConfig.refreshIntervalSeconds, 30) * 1000;
    const sourceResults = await Promise.all(
      sources.map((source) =>
        this.loadSourceEvents({
          source: source.source,
          sourceLabel: source.label,
          sourceColor: source.color,
          refreshMs,
        }),
      ),
    );

    const warnings: string[] = [];
    const mergedEvents: CalendarModuleEvent[] = [];

    for (const result of sourceResults) {
      mergedEvents.push(...result.events);
      if (result.warning) {
        warnings.push(result.warning);
      }
    }

    const deduplicatedEvents = Array.from(
      new Map(mergedEvents.map((event) => [event.id, event])).values(),
    )
      .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime())
      .slice(0, MAX_RETURNED_EVENTS);

    const responsePayload = calendarModuleEventsResponseSchema.parse({
      generatedAt: new Date().toISOString(),
      events: deduplicatedEvents,
      warnings,
    });
    const hasFailedSource = sourceResults.some((result) => result.sourceStatus === "failed");

    if (!hasFailedSource) {
      writePersistedModuleResponse(
        this.moduleStateRepository,
        persistedResponseKey,
        responsePayload,
      );
      return responsePayload;
    }

    const allSourcesFailed = sourceResults.every((result) => result.sourceStatus === "failed");
    if (!allSourcesFailed) {
      return responsePayload;
    }

    const persistedResponse = readPersistedModuleResponse({
      repository: this.moduleStateRepository,
      key: persistedResponseKey,
      parse: (payload) => calendarModuleEventsResponseSchema.parse(payload),
      maxAgeMs: CALENDAR_PERSISTED_RESPONSE_MAX_AGE_MS,
    });
    if (!persistedResponse) {
      return responsePayload;
    }

    return calendarModuleEventsResponseSchema.parse({
      ...persistedResponse.payload,
      generatedAt: new Date().toISOString(),
      warnings: [
        ...persistedResponse.payload.warnings,
        "Using saved calendar snapshot while refresh is unavailable.",
      ],
    });
  }

  private async loadSourceEvents(input: {
    source: string;
    sourceLabel: string;
    sourceColor: string | null;
    refreshMs: number;
  }): Promise<SourceLoadResult> {
    const { source, sourceLabel, sourceColor, refreshMs } = input;
    const now = Date.now();
    const cached = this.sourceCache.get(source);

    if (cached && now - cached.fetchedAtMs < refreshMs) {
      return {
        events: applySourceColor(cached.events, sourceColor),
        warning: null,
        sourceStatus: "memory-cache",
      };
    }

    try {
      const sourceBody = await this.loadSourceBody(source);
      const events = this.parseEventsFromIcs(sourceBody, source, sourceLabel, sourceColor);

      this.sourceCache.set(source, {
        fetchedAtMs: now,
        events,
      });

      return {
        events: applySourceColor(events, sourceColor),
        warning: null,
        sourceStatus: "live",
      };
    } catch (error) {
      if (cached) {
        return {
          events: applySourceColor(cached.events, sourceColor),
          warning: `Using cached data for "${sourceLabel}" after refresh failure.`,
          sourceStatus: "memory-cache",
        };
      }

      return {
        events: [],
        warning: `Failed to load "${sourceLabel}": ${summarizeError(error)}`,
        sourceStatus: "failed",
      };
    }
  }

  private async loadSourceBody(source: string): Promise<string> {
    const remoteUrl = toRemoteFetchUrl(source);

    if (remoteUrl) {
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), FETCH_TIMEOUT_MS);

      try {
        const response = await fetch(remoteUrl, {
          signal: abortController.signal,
          headers: {
            Accept: "text/calendar,text/plain;q=0.9,*/*;q=0.1",
          },
        });

        if (!response.ok) {
          throw new Error(`Remote feed returned HTTP ${response.status}`);
        }

        return await response.text();
      } finally {
        clearTimeout(timeoutId);
      }
    }

    const localPath = isAbsolute(source) ? source : resolve(config.dataDir, source);
    return readFile(localPath, "utf8");
  }

  private parseEventsFromIcs(
    icsBody: string,
    source: string,
    sourceLabel: string,
    sourceColor: string | null,
  ): CalendarModuleEvent[] {
    const calendarComponents = ical.sync.parseICS(icsBody);
    const rangeStart = startOfDay(addDays(new Date(), -CALENDAR_RANGE_DAYS_PAST));
    const rangeEnd = endOfDay(addDays(new Date(), CALENDAR_RANGE_DAYS_AHEAD));
    const events: CalendarModuleEvent[] = [];

    for (const component of Object.values(calendarComponents)) {
      if (!component || component.type !== "VEVENT") {
        continue;
      }

      events.push(
        ...this.expandEventInstances(
          component,
          source,
          sourceLabel,
          sourceColor,
          rangeStart,
          rangeEnd,
        ),
      );
    }

    return events;
  }

  private expandEventInstances(
    event: VEvent,
    source: string,
    sourceLabel: string,
    sourceColor: string | null,
    rangeStart: Date,
    rangeEnd: Date,
  ): CalendarModuleEvent[] {
    const sourceId = toPublicSourceId(source);
    const uid = event.uid?.trim() || `event-${Math.random().toString(36).slice(2, 10)}`;
    const title = readParameterValue(event.summary) ?? "Untitled event";
    const location = readParameterValue(event.location);

    if (event.rrule) {
      const recurringInstances = ical.expandRecurringEvent(event, {
        from: rangeStart,
        to: rangeEnd,
        expandOngoing: true,
      });

      return recurringInstances
        .map((instance) =>
          this.createNormalizedEvent({
            uid,
            sourceId,
            sourceLabel,
            sourceColor,
            title,
            location,
            start: instance.start,
            end: instance.end,
            allDay: instance.isFullDay,
            rangeStart,
            rangeEnd,
          }),
        )
        .filter((value): value is CalendarModuleEvent => value !== null);
    }

    const singleEvent = this.createNormalizedEvent({
      uid,
      sourceId,
      sourceLabel,
      sourceColor,
      title,
      location,
      start: event.start,
      end: event.end ?? null,
      allDay: event.datetype === "date" || Boolean(event.start?.dateOnly),
      rangeStart,
      rangeEnd,
    });

    return singleEvent ? [singleEvent] : [];
  }

  private createNormalizedEvent(input: {
    uid: string;
    sourceId: string;
    sourceLabel: string;
    sourceColor: string | null;
    title: string;
    location: string | null;
    start: unknown;
    end: unknown;
    allDay: boolean;
    rangeStart: Date;
    rangeEnd: Date;
  }): CalendarModuleEvent | null {
    if (!isValidDate(input.start)) {
      return null;
    }

    const start = input.start;
    const end = isValidDate(input.end) ? input.end : null;
    const eventEnd = end ?? start;

    if (eventEnd.getTime() < input.rangeStart.getTime()) {
      return null;
    }

    if (start.getTime() > input.rangeEnd.getTime()) {
      return null;
    }

    const startIso = serializeCalendarEventBoundary(start, input.allDay);

    return {
      id: `${input.sourceId}::${input.uid}::${startIso}`,
      source: input.sourceId,
      sourceLabel: input.sourceLabel,
      sourceColor: input.sourceColor,
      title: input.title,
      start: startIso,
      end: end ? serializeCalendarEventBoundary(end, input.allDay) : null,
      allDay: input.allDay,
      location: input.location,
    };
  }
}
