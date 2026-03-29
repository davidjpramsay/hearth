import { z } from "zod";
import { withModulePresentation } from "./presentation.js";

export const calendarViewModeSchema = z.enum(["list", "week", "month"]);
export const calendarColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const calendarFeedIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9-]*$/);
export const calendarFeedNameSchema = z.string().trim().min(1).max(80);
export const calendarFeedUrlSchema = z.string().trim().min(1).max(2048);

export const calendarFeedSchema = z.object({
  id: calendarFeedIdSchema,
  name: calendarFeedNameSchema,
  url: calendarFeedUrlSchema,
  color: calendarColorSchema.default("#22D3EE"),
  enabled: z.boolean().default(true),
});

export const calendarFeedsConfigSchema = z
  .object({
    feeds: z.array(calendarFeedSchema).max(128).default([]),
  })
  .superRefine((value, context) => {
    const usedIds = new Set<string>();

    for (let index = 0; index < value.feeds.length; index += 1) {
      const entry = value.feeds[index];
      const idKey = entry.id.toLowerCase();
      if (!usedIds.has(idKey)) {
        usedIds.add(idKey);
        continue;
      }

      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["feeds", index, "id"],
        message: "Feed ids must be unique.",
      });
    }
  });

export const calendarFeedSelectionSchema = z.object({
  feedId: calendarFeedIdSchema,
  labelOverride: z.string().trim().max(120).nullable().default(null),
  colorOverride: calendarColorSchema.nullable().default(null),
});

export const legacyCalendarSourceSchema = z.object({
  source: calendarFeedUrlSchema,
  label: z.string().trim().max(120).nullable().default(null),
  color: calendarColorSchema.nullable().default(null),
});

const migrateLegacyCalendarModuleConfig = (input: unknown): unknown => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return input;
  }

  const current = input as Record<string, unknown>;
  if (Array.isArray(current.feedSelections) || Array.isArray(current.legacyCalendars)) {
    return input;
  }

  const calendars = Array.isArray(current.calendars) ? current.calendars : [];
  const calendarLabels = Array.isArray(current.calendarLabels) ? current.calendarLabels : [];
  const calendarColors = Array.isArray(current.calendarColors) ? current.calendarColors : [];
  if (calendars.length === 0 && calendarLabels.length === 0 && calendarColors.length === 0) {
    return input;
  }

  return {
    ...current,
    legacyCalendars: calendars.map((entry, index) => ({
      source: typeof entry === "string" ? entry : "",
      label: typeof calendarLabels[index] === "string" ? calendarLabels[index] : null,
      color: typeof calendarColors[index] === "string" ? calendarColors[index] : null,
    })),
  };
};

const toUtcCalendarDay = (date: Date): Date =>
  new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0));

const toLocalCalendarDay = (date: Date): Date =>
  new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0);

// All-day events are calendar dates, not timezone-specific instants.
// Serialize them as UTC midnight for that date so every client can restore
// the same day regardless of where the feed was parsed.
export const serializeCalendarEventBoundary = (date: Date, allDay: boolean): string =>
  (allDay ? toUtcCalendarDay(date) : date).toISOString();

// Restore all-day events back to a local calendar day using the UTC date
// components encoded above. Timed events keep their exact instant.
export const parseCalendarEventBoundary = (value: string, allDay: boolean): Date | null => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return allDay ? toLocalCalendarDay(parsed) : parsed;
};

const calendarModuleConfigBaseSchema = withModulePresentation(
  z.object({
    viewMode: calendarViewModeSchema.default("list"),
    feedSelections: z.array(calendarFeedSelectionSchema).max(24).default([]),
    legacyCalendars: z.array(legacyCalendarSourceSchema).max(24).default([]),
    daysToShow: z.number().int().min(1).max(90).default(14),
    use24Hour: z.boolean().default(true),
    refreshIntervalSeconds: z.number().int().min(30).max(86_400).default(300),
  }),
);

export const calendarModuleConfigSchema = z.preprocess(
  migrateLegacyCalendarModuleConfig,
  calendarModuleConfigBaseSchema,
);

export const calendarModuleSourceSchema = z.object({
  id: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(120),
  color: calendarColorSchema,
});

export const calendarModuleEventSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  sourceLabel: z.string().min(1),
  sourceColor: calendarColorSchema.nullable().default(null),
  title: z.string().min(1),
  start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }).nullable(),
  allDay: z.boolean(),
  location: z.string().nullable(),
});

export const calendarModuleEventsResponseSchema = z.object({
  generatedAt: z.string().datetime({ offset: true }),
  sources: z.array(calendarModuleSourceSchema).default([]),
  events: z.array(calendarModuleEventSchema),
  warnings: z.array(z.string()).default([]),
});

export const calendarModuleParamsSchema = z.object({
  instanceId: z.string().min(1),
});

export type CalendarViewMode = z.infer<typeof calendarViewModeSchema>;
export type CalendarModuleConfig = z.infer<typeof calendarModuleConfigSchema>;
export type CalendarFeed = z.infer<typeof calendarFeedSchema>;
export type CalendarFeedsConfig = z.infer<typeof calendarFeedsConfigSchema>;
export type CalendarFeedSelection = z.infer<typeof calendarFeedSelectionSchema>;
export type LegacyCalendarSource = z.infer<typeof legacyCalendarSourceSchema>;
export type CalendarModuleSource = z.infer<typeof calendarModuleSourceSchema>;
export type CalendarModuleEvent = z.infer<typeof calendarModuleEventSchema>;
export type CalendarModuleEventsResponse = z.infer<typeof calendarModuleEventsResponseSchema>;
export type CalendarModuleParams = z.infer<typeof calendarModuleParamsSchema>;
