import { z } from "zod";

const FALLBACK_TIME_ZONE = "UTC";
const CALENDAR_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const moduleTimeModeSchema = z.enum([
  "device-local",
  "site-local",
  "source-local",
]);

export const isValidIanaTimeZone = (value: string): boolean => {
  const candidate = value.trim();
  if (candidate.length === 0) {
    return false;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return true;
  } catch {
    return false;
  }
};

export const ianaTimeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine(isValidIanaTimeZone, {
    message: "Invalid IANA time zone",
  });

export const siteTimeConfigSchema = z.object({
  siteTimezone: ianaTimeZoneSchema.default(FALLBACK_TIME_ZONE),
});

export const getRuntimeTimeZone = (): string => {
  const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return typeof resolved === "string" && isValidIanaTimeZone(resolved)
    ? resolved
    : FALLBACK_TIME_ZONE;
};

export const toCalendarDateInTimeZone = (
  date: Date,
  timeZone: string,
): string => {
  const normalizedTimeZone = ianaTimeZoneSchema.parse(timeZone);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: normalizedTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error(`Unable to format calendar date for time zone: ${normalizedTimeZone}`);
  }

  return `${year}-${month}-${day}`;
};

export const getDayOfYearFromCalendarDate = (value: string): number => {
  if (!CALENDAR_DATE_REGEX.test(value)) {
    throw new Error(`Invalid calendar date: ${value}`);
  }

  const [yearPart, monthPart, dayPart] = value.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    throw new Error(`Invalid calendar date: ${value}`);
  }

  const startOfYearMs = Date.UTC(year, 0, 1);
  const currentDayMs = Date.UTC(year, month - 1, day);
  return Math.floor((currentDayMs - startOfYearMs) / (24 * 60 * 60 * 1000));
};

export const getDayOfYearInTimeZone = (date: Date, timeZone: string): number =>
  getDayOfYearFromCalendarDate(toCalendarDateInTimeZone(date, timeZone));

export type ModuleTimeMode = z.infer<typeof moduleTimeModeSchema>;
export type SiteTimeConfig = z.infer<typeof siteTimeConfigSchema>;
