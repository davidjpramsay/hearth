import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { toCalendarDateInTimeZone } from "@hearth/shared";
import { registerChoresModuleRoutes } from "../src/routes/chores-module.js";
import type { AppServices } from "../src/types.js";

test("chores summary route ignores legacy previewDays config and honors the requested startDate", async () => {
  let requestedStartDate: string | null = null;
  let requestedDays: number | null = null;

  const app = Fastify();
  registerChoresModuleRoutes(app, {
    layoutRepository: {
      findModuleInstance: () => ({
        module: {
          config: {
            enableMoneyTracking: true,
            previewDays: 14,
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
      getBoard: (input: { startDate: string; days: number }) => {
        requestedStartDate = input.startDate;
        requestedDays = input.days;
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
  } as unknown as AppServices);

  try {
    const response = await app.inject({
      method: "GET",
      url: "/modules/chores/test-instance/summary?startDate=2026-03-09",
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.equal(requestedStartDate, "2026-03-09");
    assert.equal(requestedDays, 1);

    const payload = response.json();
    assert.equal(payload.startDate, "2026-03-09");
    assert.deepEqual(payload.board, [{ date: "2026-03-09", items: [] }]);
  } finally {
    await app.close();
  }
});

test("chores summary route defaults startDate using the household timezone", async () => {
  let requestedStartDate: string | null = null;
  let requestedDays: number | null = null;
  const fixedNow = new Date("2026-03-09T16:45:00.000Z");
  const RealDate = Date;

  class FixedDate extends Date {
    constructor(...args: ConstructorParameters<typeof Date>) {
      super(args.length === 0 ? fixedNow.toISOString() : args[0]);
    }

    static now(): number {
      return fixedNow.getTime();
    }
  }

  globalThis.Date = FixedDate as DateConstructor;

  const app = Fastify();
  registerChoresModuleRoutes(app, {
    layoutRepository: {
      findModuleInstance: () => ({
        module: {
          config: {
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
        siteTimezone: "Australia/Perth",
      }),
    },
    choresRepository: {
      getBoard: (input: { startDate: string; days: number }) => {
        requestedStartDate = input.startDate;
        requestedDays = input.days;
        return {
          generatedAt: new Date().toISOString(),
          startDate: input.startDate,
          days: 1,
          payoutConfig: {
            mode: "all-or-nothing",
            oneOffBonusEnabled: true,
            paydayDayOfWeek: 6,
            siteTimezone: "Australia/Perth",
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
  } as unknown as AppServices);

  try {
    const response = await app.inject({
      method: "GET",
      url: "/modules/chores/test-instance/summary",
    });

    const expectedStartDate = toCalendarDateInTimeZone(fixedNow, "Australia/Perth");
    assert.equal(response.statusCode, 200);
    assert.equal(requestedStartDate, expectedStartDate);
    assert.equal(requestedDays, 1);

    const payload = response.json();
    assert.equal(payload.startDate, expectedStartDate);
  } finally {
    globalThis.Date = RealDate;
    await app.close();
  }
});

test("chores completion route returns the refreshed summary payload for the updated day", async () => {
  let requestedStartDate: string | null = null;
  let setCompletionCalled = false;

  const app = Fastify();
  registerChoresModuleRoutes(app, {
    layoutRepository: {
      findModuleInstance: () => ({
        module: {
          config: {
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
        siteTimezone: "Australia/Perth",
      }),
    },
    choresRepository: {
      getChoreById: () => ({
        id: 2,
        name: "Bins",
        memberId: 1,
        schedule: { type: "daily" },
        startsOn: "2026-03-01",
        valueAmount: null,
        active: true,
        createdAt: "",
        updatedAt: "",
      }),
      setCompletion: () => {
        setCompletionCalled = true;
      },
      getBoard: (input: { startDate: string; days: number }) => {
        requestedStartDate = input.startDate;
        return {
          generatedAt: new Date().toISOString(),
          startDate: input.startDate,
          days: input.days,
          payoutConfig: {
            mode: "all-or-nothing",
            oneOffBonusEnabled: true,
            paydayDayOfWeek: 6,
            siteTimezone: "Australia/Perth",
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
    layoutEventBus: {
      publish: () => undefined,
    },
  } as unknown as AppServices);

  try {
    const response = await app.inject({
      method: "PUT",
      url: "/modules/chores/test-instance/completions",
      payload: {
        choreId: 2,
        date: "2026-03-24",
        completed: true,
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(setCompletionCalled, true);
    assert.equal(requestedStartDate, "2026-03-24");

    const payload = response.json();
    assert.equal(payload.startDate, "2026-03-24");
    assert.deepEqual(payload.board, [{ date: "2026-03-24", items: [] }]);
  } finally {
    await app.close();
  }
});
