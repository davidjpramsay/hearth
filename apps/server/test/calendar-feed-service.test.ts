import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CalendarFeedService } from "../src/services/calendar-feed-service.js";

const toIcsDate = (date: Date): string =>
  [
    date.getFullYear().toString().padStart(4, "0"),
    (date.getMonth() + 1).toString().padStart(2, "0"),
    date.getDate().toString().padStart(2, "0"),
  ].join("");

const toUtcMidnightIso = (date: Date): string =>
  new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)).toISOString();

test("CalendarFeedService serializes all-day events as calendar days", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "hearth-calendar-"));
  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + 1);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const icsPath = join(tempDir, "all-day.ics");
  await writeFile(
    icsPath,
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Hearth Test//EN",
      "BEGIN:VEVENT",
      "UID:all-day-timezone-test",
      "DTSTAMP:20260306T000000Z",
      `DTSTART;VALUE=DATE:${toIcsDate(start)}`,
      `DTEND;VALUE=DATE:${toIcsDate(end)}`,
      "SUMMARY:Timezone-safe all day",
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ].join("\r\n"),
  );

  const service = new CalendarFeedService();
  const result = await service.getUpcomingEvents({
    calendars: [icsPath],
    refreshIntervalSeconds: 300,
  });

  assert.deepEqual(result.warnings, []);

  const event = result.events.find((entry) => entry.title === "Timezone-safe all day");
  assert.ok(event);
  assert.equal(event.allDay, true);
  assert.equal(event.start, toUtcMidnightIso(start));
  assert.equal(event.end, toUtcMidnightIso(end));
});
