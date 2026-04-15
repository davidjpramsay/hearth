import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { registerPlannerRoutes } from "../src/routes/planner.js";
import type { AppServices } from "../src/types.js";

const createApp = () => {
  const app = Fastify();
  app.decorate("authenticate", async () => undefined);
  return app;
};

test("planner summary route returns the latest archived week", async () => {
  const app = createApp();

  registerPlannerRoutes(app, {
    layoutEventBus: { publish: () => undefined },
    settingsRepository: {
      getSiteTimeConfig: () => ({ siteTimezone: "Australia/Perth" }),
      getPlannerDayWindow: () => ({ startTime: "08:00", endTime: "15:00", slotMinutes: 30 }),
    },
    plannerRepository: {
      freezeCompletedWeeksThrough: () => ({ archives: [] }),
      freezeElapsedDatesThrough: () => undefined,
      getLatestWeekSummary: () => ({
        generatedAt: "2026-04-15T08:00:00.000Z",
        startDate: "2026-04-06",
        endDate: "2026-04-12",
        dayWindow: { startTime: "08:00", endTime: "15:00", slotMinutes: 30 },
        users: [],
        days: [],
      }),
    },
    plannerSummaryArchiveService: {
      ensurePdfForSummary: async () => "planner-summaries/hearth-school-summary-2026-04-06.pdf",
      ensurePdfForWeekStart: async () => "planner-summaries/hearth-school-summary-2026-04-06.pdf",
    },
  } as unknown as AppServices);

  try {
    const response = await app.inject({
      method: "GET",
      url: "/planner/summary",
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().startDate, "2026-04-06");
  } finally {
    await app.close();
  }
});

test("planner summary archives route lists archive metadata", async () => {
  const app = createApp();

  registerPlannerRoutes(app, {
    layoutEventBus: { publish: () => undefined },
    settingsRepository: {
      getSiteTimeConfig: () => ({ siteTimezone: "Australia/Perth" }),
      getPlannerDayWindow: () => ({ startTime: "08:00", endTime: "15:00", slotMinutes: 30 }),
    },
    plannerRepository: {
      freezeCompletedWeeksThrough: () => ({
        archives: [
          {
            weekStartDate: "2026-04-06",
            weekEndDate: "2026-04-12",
            generatedAt: "2026-04-15T08:00:00.000Z",
            pdfAvailable: true,
          },
        ],
      }),
      listSummaryArchives: () => ({
        archives: [
          {
            weekStartDate: "2026-04-06",
            weekEndDate: "2026-04-12",
            generatedAt: "2026-04-15T08:00:00.000Z",
            pdfAvailable: true,
          },
        ],
      }),
    },
    plannerSummaryArchiveService: {
      ensurePdfForWeekStart: async () => "planner-summaries/hearth-school-summary-2026-04-06.pdf",
    },
  } as unknown as AppServices);

  try {
    const response = await app.inject({
      method: "GET",
      url: "/planner/summary/archives",
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().archives.length, 1);
  } finally {
    await app.close();
  }
});

test("planner summary pdf route downloads the archived pdf", async () => {
  const app = createApp();

  registerPlannerRoutes(app, {
    layoutEventBus: { publish: () => undefined },
    settingsRepository: {
      getSiteTimeConfig: () => ({ siteTimezone: "Australia/Perth" }),
      getPlannerDayWindow: () => ({ startTime: "08:00", endTime: "15:00", slotMinutes: 30 }),
    },
    plannerRepository: {
      freezeCompletedWeeksThrough: () => ({ archives: [] }),
      freezeElapsedDatesThrough: () => undefined,
      getSummaryArchive: () => ({
        weekStartDate: "2026-04-06",
        weekEndDate: "2026-04-12",
        generatedAt: "2026-04-15T08:00:00.000Z",
        pdfAvailable: true,
      }),
    },
    plannerSummaryArchiveService: {
      readPdf: async () => Buffer.from("%PDF-1.4 test"),
    },
  } as unknown as AppServices);

  try {
    const response = await app.inject({
      method: "GET",
      url: "/planner/summary/archives/2026-04-06/pdf",
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["content-type"], "application/pdf");
    assert.match(String(response.body), /%PDF-1.4/);
  } finally {
    await app.close();
  }
});
