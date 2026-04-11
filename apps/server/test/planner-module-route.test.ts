import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { toCalendarDateInTimeZone } from "@hearth/shared";
import { registerPlannerModuleRoutes } from "../src/routes/planner-module.js";
import type { AppServices } from "../src/types.js";

test("planner today route resolves the site date using the household timezone", async () => {
  const fixedNow = new Date("2026-04-05T16:45:00.000Z");
  const RealDate = Date;
  let requestedSiteDate: string | null = null;

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
  registerPlannerModuleRoutes(app, {
    layoutRepository: {
      findModuleInstance: () => ({
        module: {
          config: {},
        },
      }),
    },
    settingsRepository: {
      getSiteTimeConfig: () => ({
        siteTimezone: "Australia/Perth",
      }),
      getPlannerDayWindow: () => ({
        startTime: "08:00",
        endTime: "15:00",
      }),
    },
    plannerRepository: {
      listUsers: () => [],
      getTodayPlan: (input: { siteDate: string }) => {
        requestedSiteDate = input.siteDate;
        return {
          generatedAt: new Date().toISOString(),
          siteDate: input.siteDate,
          dayWindow: {
            startTime: "08:00",
            endTime: "15:00",
          },
          users: [],
          template: null,
          blocks: [],
        };
      },
    },
  } as unknown as AppServices);

  try {
    const response = await app.inject({
      method: "GET",
      url: "/modules/homeschool-planner/test-instance/today",
    });

    const expectedSiteDate = toCalendarDateInTimeZone(fixedNow, "Australia/Perth");
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.equal(requestedSiteDate, expectedSiteDate);
    assert.equal(response.json().siteDate, expectedSiteDate);
  } finally {
    globalThis.Date = RealDate;
    await app.close();
  }
});

test("planner today route returns an empty state when the module instance is missing", async () => {
  const app = Fastify();
  registerPlannerModuleRoutes(app, {
    layoutRepository: {
      findModuleInstance: () => null,
    },
    settingsRepository: {
      getSiteTimeConfig: () => ({
        siteTimezone: "Australia/Perth",
      }),
      getPlannerDayWindow: () => ({
        startTime: "08:00",
        endTime: "15:00",
      }),
    },
    plannerRepository: {
      listUsers: () => [{ id: 1, name: "Alex", createdAt: "", updatedAt: "" }],
      getTodayPlan: () => {
        throw new Error("Should not be called");
      },
    },
  } as unknown as AppServices);

  try {
    const response = await app.inject({
      method: "GET",
      url: "/modules/homeschool-planner/test-instance/today",
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json();
    assert.equal(payload.template, null);
    assert.equal(payload.blocks.length, 0);
    assert.equal(payload.users.length, 1);
  } finally {
    await app.close();
  }
});
