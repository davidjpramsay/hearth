import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { toCalendarDateInTimeZone } from "@hearth/shared";
import { registerChoresRoutes } from "../src/routes/chores.js";
import type { AppServices } from "../src/types.js";

const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10);

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const getWeekRangeForPayday = (
  referenceDate: string,
  paydayDayOfWeek: number,
): { startDate: string; endDate: string } => {
  const reference = new Date(`${referenceDate}T00:00:00.000Z`);
  const dayOfWeek = reference.getUTCDay();
  const weekStartDayOfWeek = (paydayDayOfWeek + 1) % 7;
  const offsetFromStart = (dayOfWeek - weekStartDayOfWeek + 7) % 7;
  const startDate = toIsoDate(addDays(reference, -offsetFromStart));

  return {
    startDate,
    endDate: toIsoDate(addDays(new Date(`${startDate}T00:00:00.000Z`), 6)),
  };
};

test("chores dashboard route aggregates the current household snapshot in one response", async () => {
  let requestedStartDate: string | null = null;
  let requestedDays: number | null = null;
  const fixedNow = new Date("2026-03-24T00:45:00.000Z");
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
  app.decorate("authenticate", async () => undefined);

  registerChoresRoutes(app, {
    settingsRepository: {
      getChoresPayoutConfig: () => ({
        mode: "all-or-nothing",
        oneOffBonusEnabled: true,
        paydayDayOfWeek: 6,
        siteTimezone: "Australia/Perth",
      }),
    },
    choresRepository: {
      listMembers: () => [
        { id: 1, name: "Alex", avatarUrl: null, weeklyAllowance: 10, createdAt: "", updatedAt: "" },
      ],
      listChores: () => [],
      getBoard: (input: { startDate: string; days: number }) => {
        requestedStartDate = input.startDate;
        requestedDays = input.days;
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
      method: "GET",
      url: "/chores/dashboard",
    });

    const expectedSiteToday = toCalendarDateInTimeZone(fixedNow, "Australia/Perth");
    const expectedWeekRange = getWeekRangeForPayday(expectedSiteToday, 6);
    assert.equal(response.statusCode, 200);
    assert.equal(requestedStartDate, expectedWeekRange.startDate);
    assert.equal(requestedDays, 7);

    const payload = response.json();
    assert.equal(payload.siteToday, expectedSiteToday);
    assert.deepEqual(payload.selectableWeekRange, {
      startDate: expectedWeekRange.startDate,
      endDate: expectedSiteToday,
    });
    assert.equal(payload.board.startDate, expectedWeekRange.startDate);
    assert.equal(payload.board.days, 7);
  } finally {
    globalThis.Date = RealDate;
    await app.close();
  }
});

test("chores completion route returns the refreshed dashboard snapshot", async () => {
  let completionInput: { choreId: number; date: string; completed: boolean } | null = null;
  let publishedReason: string | null = null;

  const app = Fastify();
  app.decorate("authenticate", async () => undefined);

  registerChoresRoutes(app, {
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
        id: 7,
        name: "Bins",
        memberId: 1,
        schedule: { type: "daily" },
        startsOn: "2026-03-20",
        valueAmount: null,
        active: true,
        createdAt: "",
        updatedAt: "",
      }),
      setCompletion: (input: { choreId: number; date: string; completed: boolean }) => {
        completionInput = input;
      },
      listMembers: () => [],
      listChores: () => [],
      getBoard: (input: { startDate: string; days: number }) => ({
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
      }),
    },
    layoutEventBus: {
      publish: (event: { reason?: string }) => {
        publishedReason = event.reason ?? null;
      },
    },
  } as unknown as AppServices);

  try {
    const response = await app.inject({
      method: "PUT",
      url: "/chores/completions",
      payload: {
        choreId: 7,
        date: "2026-03-24",
        completed: true,
      },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(completionInput, {
      choreId: 7,
      date: "2026-03-24",
      completed: true,
    });
    assert.equal(publishedReason, "completion-updated");

    const payload = response.json();
    assert.equal(payload.board.days, 7);
    assert.equal(payload.payoutConfig.siteTimezone, "Australia/Perth");
  } finally {
    await app.close();
  }
});
