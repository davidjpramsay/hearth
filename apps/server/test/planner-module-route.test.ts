import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { HEARTH_DASHBOARD_SCHOOL_INSTANCE_ID, toCalendarDateInTimeZone } from "@hearth/shared";
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
    layoutEventBus: {
      publish: () => undefined,
    },
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
        slotMinutes: 30,
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
            slotMinutes: 30,
          },
          users: [],
          template: null,
          blocks: [],
          completions: [],
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
    assert.equal(response.json().dayWindow.slotMinutes, 30);
  } finally {
    globalThis.Date = RealDate;
    await app.close();
  }
});

test("planner today route returns an empty state when the module instance is missing", async () => {
  const app = Fastify();
  registerPlannerModuleRoutes(app, {
    layoutEventBus: {
      publish: () => undefined,
    },
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
        slotMinutes: 30,
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
    assert.equal(payload.completions.length, 0);
    assert.equal(payload.users.length, 1);
  } finally {
    await app.close();
  }
});

test("dashboard School view resolves the shared planner without a placed module", async () => {
  const app = Fastify();
  let dashboardRequested = false;
  registerPlannerModuleRoutes(app, {
    layoutEventBus: { publish: () => undefined },
    layoutRepository: { findModuleInstance: () => null },
    settingsRepository: {
      getSiteTimeConfig: () => ({ siteTimezone: "Australia/Perth" }),
      getPlannerDayWindow: () => ({ startTime: "08:00", endTime: "15:00", slotMinutes: 30 }),
    },
    plannerRepository: {
      listUsers: () => [],
      getTodayPlan: (input: { siteDate: string }) => {
        dashboardRequested = true;
        return {
          generatedAt: new Date().toISOString(),
          siteDate: input.siteDate,
          dayWindow: { startTime: "08:00", endTime: "15:00", slotMinutes: 30 },
          users: [],
          template: null,
          blocks: [],
          completions: [],
        };
      },
    },
  } as unknown as AppServices);

  try {
    const response = await app.inject({
      method: "GET",
      url: `/modules/homeschool-planner/${HEARTH_DASHBOARD_SCHOOL_INSTANCE_ID}/today`,
    });

    assert.equal(response.statusCode, 200);
    assert.equal(dashboardRequested, true);
  } finally {
    await app.close();
  }
});

test("planner completion route updates the current day summary", async () => {
  const app = Fastify();
  let requestedCompletion: {
    blockId: number;
    date: string;
    completed: boolean;
    dayWindow: { startTime: string; endTime: string; slotMinutes: 30 };
  } | null = null;

  registerPlannerModuleRoutes(app, {
    layoutEventBus: {
      publish: () => undefined,
    },
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
        slotMinutes: 30,
      }),
    },
    plannerRepository: {
      listUsers: () => [],
      getTodayPlan: (input: { siteDate: string }) => ({
        generatedAt: new Date().toISOString(),
        siteDate: input.siteDate,
        dayWindow: {
          startTime: "08:00",
          endTime: "15:00",
          slotMinutes: 30,
        },
        users: [],
        template: null,
        blocks: [],
        completions: [
          {
            blockId: 4,
            date: input.siteDate,
            completedAt: new Date().toISOString(),
          },
        ],
      }),
      setActivityCompletion: (input: {
        blockId: number;
        date: string;
        completed: boolean;
        dayWindow: { startTime: string; endTime: string; slotMinutes: 30 };
      }) => {
        requestedCompletion = input;
        return [];
      },
    },
  } as unknown as AppServices);

  try {
    const response = await app.inject({
      method: "PUT",
      url: "/modules/homeschool-planner/test-instance/completions",
      payload: {
        blockId: 4,
        date: "2026-04-06",
        completed: true,
      },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(requestedCompletion, {
      blockId: 4,
      date: "2026-04-06",
      completed: true,
      dayWindow: {
        startTime: "08:00",
        endTime: "15:00",
        slotMinutes: 30,
      },
    });
    assert.equal(response.json().completions.length, 1);
  } finally {
    await app.close();
  }
});

test("planner completion route can clear an activity completion", async () => {
  const app = Fastify();
  let requestedCompletion: {
    blockId: number;
    date: string;
    completed: boolean;
    dayWindow: { startTime: string; endTime: string; slotMinutes: 30 };
  } | null = null;

  registerPlannerModuleRoutes(app, {
    layoutEventBus: {
      publish: () => undefined,
    },
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
        slotMinutes: 30,
      }),
    },
    plannerRepository: {
      listUsers: () => [],
      getTodayPlan: (input: { siteDate: string }) => ({
        generatedAt: new Date().toISOString(),
        siteDate: input.siteDate,
        dayWindow: {
          startTime: "08:00",
          endTime: "15:00",
          slotMinutes: 30,
        },
        users: [],
        template: null,
        blocks: [],
        completions: [],
      }),
      setActivityCompletion: (input: {
        blockId: number;
        date: string;
        completed: boolean;
        dayWindow: { startTime: string; endTime: string; slotMinutes: 30 };
      }) => {
        requestedCompletion = input;
        return [];
      },
    },
  } as unknown as AppServices);

  try {
    const response = await app.inject({
      method: "PUT",
      url: "/modules/homeschool-planner/test-instance/completions",
      payload: {
        blockId: 4,
        date: "2026-04-06",
        completed: false,
      },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(requestedCompletion, {
      blockId: 4,
      date: "2026-04-06",
      completed: false,
      dayWindow: {
        startTime: "08:00",
        endTime: "15:00",
        slotMinutes: 30,
      },
    });
    assert.equal(response.json().completions.length, 0);
  } finally {
    await app.close();
  }
});

test("planner completion route rejects activities that are not part of the requested day", async () => {
  const app = Fastify();

  registerPlannerModuleRoutes(app, {
    layoutEventBus: {
      publish: () => undefined,
    },
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
        slotMinutes: 30,
      }),
    },
    plannerRepository: {
      listUsers: () => [],
      getTodayPlan: () => ({
        generatedAt: new Date().toISOString(),
        siteDate: "2026-04-06",
        dayWindow: {
          startTime: "08:00",
          endTime: "15:00",
          slotMinutes: 30,
        },
        users: [],
        template: null,
        blocks: [],
        completions: [],
      }),
      setActivityCompletion: () => {
        throw new Error("Planner activity is not part of that school day");
      },
    },
  } as unknown as AppServices);

  try {
    const response = await app.inject({
      method: "PUT",
      url: "/modules/homeschool-planner/test-instance/completions",
      payload: {
        blockId: 4,
        date: "2026-04-07",
        completed: true,
      },
    });

    assert.equal(response.statusCode, 400);
    assert.match(response.json().message, /school day/i);
  } finally {
    await app.close();
  }
});
