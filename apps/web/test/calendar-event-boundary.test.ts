import assert from "node:assert/strict";
import test from "node:test";
import { parseCalendarEventBoundary } from "@hearth/shared";

const DAY_MS = 24 * 60 * 60 * 1000;

const addDays = (date: Date, days: number): Date => new Date(date.getTime() + days * DAY_MS);

const startOfDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);

const eventOccursOnDay = (start: Date, endExclusive: Date, date: Date): boolean => {
  const dayStart = startOfDay(date);
  const nextDayStart = addDays(dayStart, 1);
  return start < nextDayStart && endExclusive > dayStart;
};

test("parseCalendarEventBoundary keeps a one-day all-day event on one local day", () => {
  const start = parseCalendarEventBoundary("2026-03-06T00:00:00.000Z", true);
  const end = parseCalendarEventBoundary("2026-03-07T00:00:00.000Z", true);

  assert.ok(start);
  assert.ok(end);
  assert.equal(eventOccursOnDay(start, end, new Date(2026, 2, 6)), true);
  assert.equal(eventOccursOnDay(start, end, new Date(2026, 2, 7)), false);
});

test("parseCalendarEventBoundary preserves exact instants for timed events", () => {
  const parsed = parseCalendarEventBoundary("2026-03-06T14:30:00.000Z", false);

  assert.ok(parsed);
  assert.equal(parsed.toISOString(), "2026-03-06T14:30:00.000Z");
});
