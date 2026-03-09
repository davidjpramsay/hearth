import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { registerChoresModuleRoutes } from "../src/routes/chores-module.js";
import type { AppServices } from "../src/types.js";

test("chores summary route honors the requested startDate", async () => {
  let requestedStartDate: string | null = null;

  const app = Fastify();
  registerChoresModuleRoutes(
    app,
    {
      layoutRepository: {
        findModuleInstance: () => ({
          module: {
            config: {
              previewDays: 0,
              enableMoneyTracking: true,
            },
          },
        }),
      },
      settingsRepository: {
        getChoresPayoutConfig: () => ({
          mode: "all-or-nothing",
          oneOffBonusEnabled: true,
          paydayDayOfWeek: 6,
        }),
      },
      choresRepository: {
        getBoard: (input: { startDate: string }) => {
          requestedStartDate = input.startDate;
          return {
            generatedAt: new Date().toISOString(),
            startDate: input.startDate,
            days: 1,
            payoutConfig: {
              mode: "all-or-nothing",
              oneOffBonusEnabled: true,
              paydayDayOfWeek: 6,
            },
            members: [],
            chores: [],
            board: [{ date: input.startDate, items: [] }],
            stats: {
              dailyCompletionRate: 0,
              weeklyCompletedCount: 0,
              weeklyTotalValue: 0,
              weeklyByMember: [],
            },
          };
        },
      },
    } as unknown as AppServices,
  );

  try {
    const response = await app.inject({
      method: "GET",
      url: "/modules/chores/test-instance/summary?startDate=2026-03-09",
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.equal(requestedStartDate, "2026-03-09");

    const payload = response.json();
    assert.equal(payload.startDate, "2026-03-09");
    assert.deepEqual(payload.board, [{ date: "2026-03-09", items: [] }]);
  } finally {
    await app.close();
  }
});
