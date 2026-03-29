import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Fastify from "fastify";
import { createDatabase } from "../src/db.js";
import { SettingsRepository } from "../src/repositories/settings-repository.js";
import { registerSiteTimeRoutes } from "../src/routes/site-time.js";
import { LayoutEventBus, type AppEvent } from "../src/services/layout-event-bus.js";
import type { AppServices } from "../src/types.js";

const createHarness = async () => {
  const directory = mkdtempSync(join(tmpdir(), "hearth-site-time-route-"));
  const db = createDatabase(join(directory, "hearth.sqlite"));
  const settingsRepository = new SettingsRepository(db, {
    defaultSiteTimeZone: "Australia/Perth",
  });
  const layoutEventBus = new LayoutEventBus();
  const events: AppEvent[] = [];
  const unsubscribe = layoutEventBus.subscribe((event) => {
    events.push(event);
  });
  const app = Fastify();

  app.decorate("authenticate", async () => {});
  registerSiteTimeRoutes(app, {
    layoutRepository: {} as AppServices["layoutRepository"],
    choresRepository: {} as AppServices["choresRepository"],
    deviceRepository: {} as AppServices["deviceRepository"],
    settingsRepository,
    moduleStateRepository: {} as AppServices["moduleStateRepository"],
    calendarFeedService: {} as AppServices["calendarFeedService"],
    photosSlideshowService: {} as AppServices["photosSlideshowService"],
    localWarningService: {} as AppServices["localWarningService"],
    screenProfileService: {} as AppServices["screenProfileService"],
    layoutEventBus,
    moduleAdapterService: {} as AppServices["moduleAdapterService"],
  });
  await app.ready();

  return {
    app,
    events,
    settingsRepository,
    dispose: async () => {
      unsubscribe();
      await app.close();
      db.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
};

test("site-time routes return and update the household timezone", async () => {
  const harness = await createHarness();

  try {
    const initialResponse = await harness.app.inject({
      method: "GET",
      url: "/site-time",
    });

    assert.equal(initialResponse.statusCode, 200);
    assert.equal(initialResponse.json().siteTimezone, "Australia/Perth");

    const updateResponse = await harness.app.inject({
      method: "PUT",
      url: "/site-time",
      payload: {
        siteTimezone: "America/Chicago",
      },
    });

    assert.equal(updateResponse.statusCode, 200);
    assert.equal(updateResponse.json().siteTimezone, "America/Chicago");
    assert.equal(harness.settingsRepository.getSiteTimeConfig().siteTimezone, "America/Chicago");
    assert.deepEqual(harness.events.at(-1), {
      type: "site-time-updated",
      changedAt: harness.events.at(-1)?.changedAt,
      siteTimezone: "America/Chicago",
    });
  } finally {
    await harness.dispose();
  }
});
