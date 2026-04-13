import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, isAbsolute, resolve } from "node:path";
import type { ParameterValue, VEvent } from "node-ical";
import ical from "node-ical";
import {
  calendarFeedsConfigSchema,
  calendarModuleConfigSchema,
  calendarModuleEventSchema,
  calendarModuleEventsResponseSchema,
  getThemeColorSlotByIndex,
  normalizeThemeColorSlot,
  serializeCalendarEventBoundary,
  type CalendarFeedsConfig,
  type CalendarModuleEvent,
  type CalendarModuleEventsResponse,
  type ThemeColorSlot,
} from "@hearth/shared";
import { z } from "zod";
import { config } from "../config.js";
import type { ModuleStateRepository } from "../repositories/module-state-repository.js";
import type { SettingsRepository } from "../repositories/settings-repository.js";
import {
  readPersistedModuleResponse,
  writePersistedModuleResponse,
} from "./persisted-module-response-cache.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const CALENDAR_RANGE_DAYS_PAST = 1;
const CALENDAR_RANGE_DAYS_AHEAD = 120;
const MAX_RETURNED_EVENTS = 700;
const FETCH_TIMEOUT_MS = 10_000;
const CALENDAR_SOURCE_CONCURRENCY = 4;
const CALENDAR_PERSISTED_RESPONSE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CALENDAR_PERSISTED_SOURCE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const REMOTE_PROTOCOL_REGEX = /^(https?|webcals?):\/\//i;
const WEB_CAL_DOUBLE_SLASH_REGEX = /^webcals?:\/\//i;
const WEB_CAL_SINGLE_SLASH_REGEX = /^webcals?:\/(?!\/)/i;

const cachedCalendarSourceEventSchema = z.object({
  uid: z.string().min(1),
  title: z.string().min(1),
  start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }).nullable(),
  allDay: z.boolean(),
  location: z.string().nullable(),
});

const cachedCalendarSourceSnapshotSchema = z.object({
  events: z.array(cachedCalendarSourceEventSchema).default([]),
});

type CachedCalendarSourceEvent = z.infer<typeof cachedCalendarSourceEventSchema>;

interface SourceCacheEntry {
  fetchedAtMs: number;
  events: CachedCalendarSourceEvent[];
}

interface SourceLoadResult {
  events: CalendarModuleEvent[];
  warning: string | null;
  sourceStatus: "live" | "memory-cache" | "persisted-cache" | "failed";
}

interface ResolvedSource {
  id: string;
  source: string;
  label: string;
  color: ThemeColorSlot;
}

const mapWithConcurrencyLimit = async <TInput, TOutput>(
  items: TInput[],
  limit: number,
  mapper: (item: TInput) => Promise<TOutput>,
): Promise<TOutput[]> => {
  if (items.length === 0) {
    return [];
  }

  const results = new Array<TOutput>(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex]!);
      }
    }),
  );

  return results;
};

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

const toLegacyPublicSourceId = (source: string): string =>
  `legacy-${createHash("sha256").update(source).digest("hex").slice(0, 16)}`;

const defaultCalendarColor = (index: number): ThemeColorSlot => getThemeColorSlotByIndex(index);

const buildPersistedCalendarResponseKey = (sources: ResolvedSource[]): string =>
  `calendar-response:${createHash("sha256").update(JSON.stringify(sources)).digest("hex")}`;

const buildPersistedCalendarSourceKey = (source: string): string =>
  `calendar-source:${createHash("sha256").update(source).digest("hex")}`;

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

const materializeSourceEvents = (
  sourceEvents: CachedCalendarSourceEvent[],
  source: ResolvedSource,
): CalendarModuleEvent[] =>
  sourceEvents.map((event) =>
    calendarModuleEventSchema.parse({
      id: `${source.id}::${event.uid}::${event.start}`,
      source: source.id,
      sourceLabel: source.label,
      sourceColor: source.color,
      title: event.title,
      start: event.start,
      end: event.end,
      allDay: event.allDay,
      location: event.location,
    }),
  );

export class CalendarFeedService {
  private readonly sourceCache = new Map<string, SourceCacheEntry>();
  private readonly inFlightSourceLoads = new Map<string, Promise<SourceLoadResult>>();
  private lastPrefetchAttemptAtMs: number | null = null;
  private lastPrefetchCompletedAtMs: number | null = null;

  constructor(
    private readonly moduleStateRepository: ModuleStateRepository | null = null,
    private readonly settingsRepository: SettingsRepository | null = null,
  ) {}

  async prefetchConfiguredFeeds(calendarFeedsConfig?: CalendarFeedsConfig): Promise<void> {
    this.lastPrefetchAttemptAtMs = Date.now();
    const configuredFeeds =
      calendarFeedsConfig ??
      this.settingsRepository?.getCalendarFeeds() ??
      calendarFeedsConfigSchema.parse({});

    const enabledFeeds = configuredFeeds.feeds.filter((feed) => feed.enabled);
    await mapWithConcurrencyLimit(enabledFeeds, CALENDAR_SOURCE_CONCURRENCY, async (feed) =>
      this.loadSourceEvents({
        source: {
          id: feed.id,
          source: feed.url,
          label: feed.name,
          color: normalizeThemeColorSlot(feed.color),
        },
        refreshMs: 0,
      }).catch(() => null),
    );
    this.lastPrefetchCompletedAtMs = Date.now();
  }

  async getUpcomingEvents(rawConfig: unknown): Promise<CalendarModuleEventsResponse> {
    const parsedConfig = calendarModuleConfigSchema.parse(rawConfig);
    const resolved = this.resolveConfiguredSources(parsedConfig);

    if (resolved.sources.length === 0) {
      return calendarModuleEventsResponseSchema.parse({
        generatedAt: new Date().toISOString(),
        sources: [],
        events: [],
        warnings:
          resolved.warnings.length > 0
            ? resolved.warnings
            : ["Add at least one saved calendar feed or legacy calendar source."],
      });
    }

    const persistedResponseKey = buildPersistedCalendarResponseKey(resolved.sources);
    const refreshMs = Math.max(parsedConfig.refreshIntervalSeconds, 30) * 1000;
    const sourceResults = await mapWithConcurrencyLimit(
      resolved.sources,
      CALENDAR_SOURCE_CONCURRENCY,
      (source) =>
        this.loadSourceEvents({
          source,
          refreshMs,
        }),
    );

    const warnings = [...resolved.warnings];
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
      sources: resolved.sources.map((source) => ({
        id: source.id,
        label: source.label,
        color: source.color,
      })),
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

  private resolveConfiguredSources(
    rawConfig: ReturnType<typeof calendarModuleConfigSchema.parse>,
  ): {
    sources: ResolvedSource[];
    warnings: string[];
  } {
    const configuredFeeds =
      this.settingsRepository?.getCalendarFeeds() ?? calendarFeedsConfigSchema.parse({});
    const feedMap = new Map(configuredFeeds.feeds.map((feed) => [feed.id, feed]));
    const seenSources = new Set<string>();
    const sources: ResolvedSource[] = [];
    const warnings: string[] = [];

    for (const selection of rawConfig.feedSelections) {
      const feed = feedMap.get(selection.feedId);
      if (!feed) {
        warnings.push(`Saved calendar feed "${selection.feedId}" is missing.`);
        continue;
      }

      if (!feed.enabled) {
        warnings.push(`Saved calendar feed "${feed.name}" is disabled.`);
        continue;
      }

      const source = feed.url.trim();
      if (source.length === 0 || seenSources.has(source)) {
        continue;
      }

      seenSources.add(source);
      sources.push({
        id: feed.id,
        source,
        label: selection.labelOverride?.trim() ? selection.labelOverride.trim() : feed.name,
        color:
          (selection.colorOverride ? normalizeThemeColorSlot(selection.colorOverride) : null) ??
          normalizeThemeColorSlot(feed.color) ??
          defaultCalendarColor(sources.length),
      });
    }

    for (const legacyCalendar of rawConfig.legacyCalendars) {
      const source = legacyCalendar.source.trim();
      if (source.length === 0 || seenSources.has(source)) {
        continue;
      }

      seenSources.add(source);
      sources.push({
        id: toLegacyPublicSourceId(source),
        source,
        label: legacyCalendar.label?.trim() ? legacyCalendar.label.trim() : toSourceLabel(source),
        color:
          (legacyCalendar.color ? normalizeThemeColorSlot(legacyCalendar.color) : null) ??
          defaultCalendarColor(sources.length),
      });
    }

    return {
      sources,
      warnings,
    };
  }

  private async loadSourceEvents(input: {
    source: ResolvedSource;
    refreshMs: number;
  }): Promise<SourceLoadResult> {
    const { source, refreshMs } = input;
    const now = Date.now();
    const cached = this.sourceCache.get(source.source);

    if (cached && now - cached.fetchedAtMs < refreshMs) {
      return {
        events: materializeSourceEvents(cached.events, source),
        warning: null,
        sourceStatus: "memory-cache",
      };
    }
    const existingLoad = this.inFlightSourceLoads.get(source.source);
    if (existingLoad) {
      return existingLoad;
    }

    const loadPromise = (async () => {
      try {
        const sourceBody = await this.loadSourceBody(source.source);
        const events = this.parseEventsFromIcs(sourceBody, source.source);

        this.sourceCache.set(source.source, {
          fetchedAtMs: now,
          events,
        });
        writePersistedModuleResponse(
          this.moduleStateRepository,
          buildPersistedCalendarSourceKey(source.source),
          cachedCalendarSourceSnapshotSchema.parse({ events }),
        );

        return {
          events: materializeSourceEvents(events, source),
          warning: null,
          sourceStatus: "live",
        } satisfies SourceLoadResult;
      } catch (error) {
        if (cached) {
          return {
            events: materializeSourceEvents(cached.events, source),
            warning: `Using cached data for "${source.label}" after refresh failure.`,
            sourceStatus: "memory-cache",
          } satisfies SourceLoadResult;
        }

        const persistedSource = readPersistedModuleResponse({
          repository: this.moduleStateRepository,
          key: buildPersistedCalendarSourceKey(source.source),
          parse: (payload) => cachedCalendarSourceSnapshotSchema.parse(payload),
          maxAgeMs: CALENDAR_PERSISTED_SOURCE_MAX_AGE_MS,
        });

        if (persistedSource) {
          return {
            events: materializeSourceEvents(persistedSource.payload.events, source),
            warning: `Using saved feed snapshot for "${source.label}" while refresh is unavailable.`,
            sourceStatus: "persisted-cache",
          } satisfies SourceLoadResult;
        }

        return {
          events: [],
          warning: `Failed to load "${source.label}": ${summarizeError(error)}`,
          sourceStatus: "failed",
        } satisfies SourceLoadResult;
      }
    })().finally(() => {
      if (this.inFlightSourceLoads.get(source.source) === loadPromise) {
        this.inFlightSourceLoads.delete(source.source);
      }
    });

    this.inFlightSourceLoads.set(source.source, loadPromise);
    return loadPromise;
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

  private parseEventsFromIcs(icsBody: string, source: string): CachedCalendarSourceEvent[] {
    const calendarComponents = ical.sync.parseICS(icsBody);
    const rangeStart = startOfDay(addDays(new Date(), -CALENDAR_RANGE_DAYS_PAST));
    const rangeEnd = endOfDay(addDays(new Date(), CALENDAR_RANGE_DAYS_AHEAD));
    const events: CachedCalendarSourceEvent[] = [];

    for (const component of Object.values(calendarComponents)) {
      if (!component || component.type !== "VEVENT") {
        continue;
      }

      events.push(...this.expandEventInstances(component, source, rangeStart, rangeEnd));
    }

    return events;
  }

  private expandEventInstances(
    event: VEvent,
    source: string,
    rangeStart: Date,
    rangeEnd: Date,
  ): CachedCalendarSourceEvent[] {
    const uid =
      event.uid?.trim() || `event-${createHash("sha256").update(source).digest("hex").slice(0, 8)}`;
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
            title,
            location,
            start: instance.start,
            end: instance.end,
            allDay: instance.isFullDay,
            rangeStart,
            rangeEnd,
          }),
        )
        .filter((value): value is CachedCalendarSourceEvent => value !== null);
    }

    const singleEvent = this.createNormalizedEvent({
      uid,
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
    title: string;
    location: string | null;
    start: unknown;
    end: unknown;
    allDay: boolean;
    rangeStart: Date;
    rangeEnd: Date;
  }): CachedCalendarSourceEvent | null {
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

    return cachedCalendarSourceEventSchema.parse({
      uid: input.uid,
      title: input.title,
      start: serializeCalendarEventBoundary(start, input.allDay),
      end: end ? serializeCalendarEventBoundary(end, input.allDay) : null,
      allDay: input.allDay,
      location: input.location,
    });
  }

  getDiagnostics(): {
    configuredFeedCount: number;
    enabledFeedCount: number;
    memoryCacheEntries: number;
    inFlightRefreshes: number;
    lastPrefetchAttemptAt: string | null;
    lastPrefetchCompletedAt: string | null;
  } {
    const configuredFeeds =
      this.settingsRepository?.getCalendarFeeds() ?? calendarFeedsConfigSchema.parse({});

    return {
      configuredFeedCount: configuredFeeds.feeds.length,
      enabledFeedCount: configuredFeeds.feeds.filter((feed) => feed.enabled).length,
      memoryCacheEntries: this.sourceCache.size,
      inFlightRefreshes: this.inFlightSourceLoads.size,
      lastPrefetchAttemptAt:
        this.lastPrefetchAttemptAtMs === null
          ? null
          : new Date(this.lastPrefetchAttemptAtMs).toISOString(),
      lastPrefetchCompletedAt:
        this.lastPrefetchCompletedAtMs === null
          ? null
          : new Date(this.lastPrefetchCompletedAtMs).toISOString(),
    };
  }
}
