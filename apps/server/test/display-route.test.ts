import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Fastify from "fastify";
import { createDatabase } from "../src/db.js";
import { DeviceRepository } from "../src/repositories/device-repository.js";
import { LayoutRepository } from "../src/repositories/layout-repository.js";
import { registerDisplayRoutes } from "../src/routes/display.js";
import { SettingsRepository } from "../src/repositories/settings-repository.js";
import { LayoutEventBus } from "../src/services/layout-event-bus.js";
import { ScreenProfileService } from "../src/services/screen-profile-service.js";
import type { AppServices } from "../src/types.js";

const createHarness = async () => {
  const directory = mkdtempSync(join(tmpdir(), "hearth-display-route-"));
  const db = createDatabase(join(directory, "hearth.sqlite"));
  const layoutRepository = new LayoutRepository(db, {
    calendarEncryptionSecret: "test-calendar-secret",
  });
  const settingsRepository = new SettingsRepository(db);
  const deviceRepository = new DeviceRepository(db);
  const screenProfileService = new ScreenProfileService(
    layoutRepository,
    settingsRepository,
    deviceRepository,
  );
  const layoutEventBus = new LayoutEventBus();
  const app = Fastify();

  app.decorate("authenticate", async () => {});
  registerDisplayRoutes(
    app,
    {
      layoutRepository,
      choresRepository: {} as AppServices["choresRepository"],
      deviceRepository,
      settingsRepository,
      moduleStateRepository: {} as AppServices["moduleStateRepository"],
      calendarFeedService: {} as AppServices["calendarFeedService"],
      photosSlideshowService: {} as AppServices["photosSlideshowService"],
      screenProfileService,
      layoutEventBus,
      moduleAdapterService: {} as AppServices["moduleAdapterService"],
    },
  );
  await app.ready();

  return {
    app,
    deviceRepository,
    dispose: async () => {
      await app.close();
      db.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
};

test("screen-profile report stores the last seen ip from the request headers", async () => {
  const harness = await createHarness();

  try {
    const response = await harness.app.inject({
      method: "POST",
      url: "/display/screen-profile/report",
      headers: {
        "x-forwarded-for": "192.168.1.45, 10.0.0.2",
      },
      payload: {
        screenSessionId: "device-ip-route-1",
        reportedThemeId: "default",
      },
    });

    assert.equal(response.statusCode, 200);

    const storedDevice = harness.deviceRepository.getDevice("device-ip-route-1");
    assert.ok(storedDevice);
    assert.equal(storedDevice.lastSeenIp, "192.168.1.45");
  } finally {
    await harness.dispose();
  }
});

test("delete display device removes the saved device record", async () => {
  const harness = await createHarness();

  try {
    await harness.app.inject({
      method: "POST",
      url: "/display/screen-profile/report",
      payload: {
        screenSessionId: "device-delete-route-1",
        reportedThemeId: "default",
      },
    });

    const response = await harness.app.inject({
      method: "DELETE",
      url: "/display/devices/device-delete-route-1",
    });

    assert.equal(response.statusCode, 204);
    assert.equal(harness.deviceRepository.getDevice("device-delete-route-1"), null);
  } finally {
    await harness.dispose();
  }
});
