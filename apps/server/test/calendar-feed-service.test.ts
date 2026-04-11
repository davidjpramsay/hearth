import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ModuleStateRepository } from "../src/repositories/module-state-repository.js";
import type { SettingsRepository } from "../src/repositories/settings-repository.js";
import { CalendarFeedService } from "../src/services/calendar-feed-service.js";

const toIcsDate = (date: Date): string =>
  [
    date.getFullYear().toString().padStart(4, "0"),
    (date.getMonth() + 1).toString().padStart(2, "0"),
    date.getDate().toString().padStart(2, "0"),
  ].join("");

const toUtcMidnightIso = (date: Date): string =>
  new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)).toISOString();

const createModuleStateRepositoryStub = (): ModuleStateRepository => {
  const store = new Map<string, unknown>();

  return {
    getState: <T>(key: string): T | null => (store.get(key) as T | undefined) ?? null,
    setState: (key: string, value: unknown) => {
      store.set(key, value);
    },
  } as ModuleStateRepository;
};

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
    legacyCalendars: [
      {
        source: icsPath,
        label: "Family",
        color: "color-6",
      },
    ],
    refreshIntervalSeconds: 300,
  });

  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.sources, [
    {
      id: result.sources[0]?.id,
      label: "Family",
      color: "color-6",
    },
  ]);

  const event = result.events.find((entry) => entry.title === "Timezone-safe all day");
  assert.ok(event);
  assert.equal(event.allDay, true);
  assert.equal(event.start, toUtcMidnightIso(start));
  assert.equal(event.end, toUtcMidnightIso(end));
});

test("CalendarFeedService falls back to a persisted response after a cold-start source failure", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "hearth-calendar-cache-"));
  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const start = new Date();
  start.setHours(9, 0, 0, 0);
  start.setDate(start.getDate() + 2);

  const end = new Date(start);
  end.setHours(10, 0, 0, 0);

  const icsPath = join(tempDir, "upcoming.ics");
  await writeFile(
    icsPath,
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Hearth Test//EN",
      "BEGIN:VEVENT",
      "UID:persisted-calendar-test",
      "DTSTAMP:20260306T000000Z",
      `DTSTART:${start
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z")}`,
      `DTEND:${end
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z")}`,
      "SUMMARY:Persisted planning event",
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ].join("\r\n"),
  );

  const moduleStateRepository = createModuleStateRepositoryStub();
  const initialService = new CalendarFeedService(moduleStateRepository);
  const initialResult = await initialService.getUpcomingEvents({
    legacyCalendars: [
      {
        source: icsPath,
        label: "Planning",
        color: "color-6",
      },
    ],
    refreshIntervalSeconds: 300,
  });

  assert.equal(initialResult.warnings.length, 0);
  assert.equal(initialResult.events.length, 1);
  assert.equal(initialResult.events[0]?.title, "Persisted planning event");

  await rm(icsPath, { force: true });

  const coldStartService = new CalendarFeedService(moduleStateRepository);
  const fallbackResult = await coldStartService.getUpcomingEvents({
    legacyCalendars: [
      {
        source: icsPath,
        label: "Planning",
        color: "color-6",
      },
    ],
    refreshIntervalSeconds: 300,
  });

  assert.equal(fallbackResult.events.length, 1);
  assert.equal(fallbackResult.events[0]?.title, "Persisted planning event");
  assert.match(fallbackResult.warnings.join(" "), /saved feed snapshot .* refresh is unavailable/i);
});

test("CalendarFeedService resolves saved feed ids through the global registry", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "hearth-calendar-feeds-"));
  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const start = new Date();
  start.setHours(8, 0, 0, 0);
  start.setDate(start.getDate() + 1);

  const end = new Date(start);
  end.setHours(9, 0, 0, 0);

  const icsPath = join(tempDir, "school.ics");
  await writeFile(
    icsPath,
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Hearth Test//EN",
      "BEGIN:VEVENT",
      "UID:feed-registry-test",
      "DTSTAMP:20260306T000000Z",
      `DTSTART:${start
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z")}`,
      `DTEND:${end
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z")}`,
      "SUMMARY:School assembly",
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ].join("\r\n"),
  );

  const settingsRepository = {
    getCalendarFeeds: () => ({
      feeds: [
        {
          id: "school",
          name: "School",
          url: icsPath,
          color: "color-4",
          enabled: true,
        },
      ],
    }),
  };

  const service = new CalendarFeedService(
    createModuleStateRepositoryStub(),
    settingsRepository as unknown as SettingsRepository,
  );
  const result = await service.getUpcomingEvents({
    feedSelections: [
      {
        feedId: "school",
        labelOverride: "Kids School",
        colorOverride: "color-7",
      },
    ],
    refreshIntervalSeconds: 300,
  });

  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.sources, [
    {
      id: "school",
      label: "Kids School",
      color: "color-7",
    },
  ]);
  assert.equal(result.events[0]?.source, "school");
  assert.equal(result.events[0]?.sourceLabel, "Kids School");
  assert.equal(result.events[0]?.sourceColor, "color-7");
});
