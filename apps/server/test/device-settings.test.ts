import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createDatabase } from "../src/db";
import { DeviceRepository } from "../src/repositories/device-repository";
import { LayoutRepository } from "../src/repositories/layout-repository";
import { SettingsRepository } from "../src/repositories/settings-repository";
import { ScreenProfileService } from "../src/services/screen-profile-service";

const createHarness = () => {
  const directory = mkdtempSync(join(tmpdir(), "hearth-device-settings-"));
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

  return {
    deviceRepository,
    screenProfileService,
    dispose: () => {
      db.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
};

test("reportScreenProfile seeds a new device from reported local settings", () => {
  const harness = createHarness();

  try {
    const response = harness.screenProfileService.reportScreenProfile({
      screenSessionId: "device-seed-1",
      targetSelection: {
        kind: "layout",
        layoutName: "16:9 Standard Portrait",
      },
      reportedThemeId: "monokai",
    });

    assert.equal(response.device.id, "device-seed-1");
    assert.equal(response.device.themeId, "monokai");
    assert.equal(response.device.targetSelection?.kind, "layout");
    assert.equal(response.device.targetSelection?.layoutName, "16:9 Standard Portrait");
    assert.equal(response.resolvedTargetSelection.kind, "layout");
    assert.equal(response.layout?.name, "16:9 Standard Portrait");

    const storedDevice = harness.deviceRepository.getDevice("device-seed-1");
    assert.ok(storedDevice);
    assert.equal(storedDevice.themeId, "monokai");
    assert.equal(storedDevice.targetSelection?.kind, "layout");
  } finally {
    harness.dispose();
  }
});

test("server-managed device settings override later reported local values", () => {
  const harness = createHarness();

  try {
    harness.screenProfileService.reportScreenProfile({
      screenSessionId: "device-managed-1",
      targetSelection: {
        kind: "layout",
        layoutName: "16:9 Standard Portrait",
      },
      reportedThemeId: "monokai",
    });

    harness.deviceRepository.updateDevice("device-managed-1", {
      name: "Kitchen display",
      themeId: "nord",
      targetSelection: {
        kind: "set",
        setId: "set-1",
      },
    });

    const response = harness.screenProfileService.reportScreenProfile({
      screenSessionId: "device-managed-1",
      targetSelection: {
        kind: "layout",
        layoutName: "16:9 Standard Portrait",
      },
      reportedThemeId: "monokai",
    });

    assert.equal(response.device.name, "Kitchen display");
    assert.equal(response.device.themeId, "nord");
    assert.equal(response.device.targetSelection?.kind, "set");
    assert.equal(response.device.targetSelection?.setId, "set-1");
    assert.equal(response.resolvedTargetSelection.kind, "set");
    assert.equal(response.resolvedTargetSelection.setId, "set-1");
    assert.equal(response.layout?.name, "16:9 Standard Landscape");
  } finally {
    harness.dispose();
  }
});

test("managed device updates reject unknown target assignments", () => {
  const harness = createHarness();

  try {
    const missingSet = harness.screenProfileService.validateManagedDeviceTargetSelection({
      kind: "set",
      setId: "set-missing",
    });
    assert.equal(missingSet.ok, false);
    assert.equal(missingSet.message, "Set not found: set-missing");

    const missingLayout = harness.screenProfileService.validateManagedDeviceTargetSelection({
      kind: "layout",
      layoutName: "Unknown Layout",
    });
    assert.equal(missingLayout.ok, false);
    assert.equal(missingLayout.message, "Layout not found: Unknown Layout");

    const emptySetSelection =
      harness.screenProfileService.validateManagedDeviceTargetSelection({
        kind: "set",
        setId: null,
      });
    assert.equal(emptySetSelection.ok, false);
    assert.equal(
      emptySetSelection.message,
      "Choose a set or switch routing to Inherit default.",
    );
  } finally {
    harness.dispose();
  }
});

test("reportScreenProfile does not persist stale reported targets for a new device", () => {
  const harness = createHarness();

  try {
    const response = harness.screenProfileService.reportScreenProfile({
      screenSessionId: "device-stale-1",
      targetSelection: {
        kind: "layout",
        layoutName: "Removed Layout",
      },
      reportedThemeId: "solarized",
    });

    assert.equal(response.device.id, "device-stale-1");
    assert.equal(response.device.themeId, "solarized");
    assert.equal(response.device.targetSelection, null);
    assert.equal(response.resolvedTargetSelection.kind, "set");
    assert.equal(response.resolvedTargetSelection.setId, "set-1");

    const storedDevice = harness.deviceRepository.getDevice("device-stale-1");
    assert.ok(storedDevice);
    assert.equal(storedDevice.themeId, "solarized");
    assert.equal(storedDevice.targetSelection, null);
  } finally {
    harness.dispose();
  }
});
