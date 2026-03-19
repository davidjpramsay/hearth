import { z } from "zod";
import { withModulePresentation } from "./presentation.js";

export const calendarViewModeSchema = z.enum(["list", "week", "month"]);
const calendarColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

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

export const calendarModuleConfigSchema = withModulePresentation(
  z.object({
    viewMode: calendarViewModeSchema.default("list"),
    calendars: z.array(z.string().trim().max(2048)).max(24).default([]),
    calendarLabels: z.array(z.string().trim().max(120)).max(24).default([]),
    calendarColors: z.array(calendarColorSchema).max(24).default([]),
    daysToShow: z.number().int().min(1).max(90).default(14),
    use24Hour: z.boolean().default(true),
    refreshIntervalSeconds: z.number().int().min(30).max(86_400).default(300),
  }),
);

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
  events: z.array(calendarModuleEventSchema),
  warnings: z.array(z.string()).default([]),
});

export const calendarModuleParamsSchema = z.object({
  instanceId: z.string().min(1),
});

export type CalendarViewMode = z.infer<typeof calendarViewModeSchema>;
export type CalendarModuleConfig = z.infer<typeof calendarModuleConfigSchema>;
export type CalendarModuleEvent = z.infer<typeof calendarModuleEventSchema>;
export type CalendarModuleEventsResponse = z.infer<typeof calendarModuleEventsResponseSchema>;
export type CalendarModuleParams = z.infer<typeof calendarModuleParamsSchema>;
