import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import {
  compileLayoutSetAuthoringToLogicGraph,
  LOCAL_WARNING_AUTO_LAYOUT_LABEL,
  LOCAL_WARNING_CANVAS_ACTION_TYPE,
  LOCAL_WARNING_CONDITION_TYPE,
  LOCAL_WARNING_MODULE_ID,
  setPrimaryPhotoRouterBlock,
} from "@hearth/shared";
import { createDatabase } from "../src/db";
import { configureLayoutLogicRegistry } from "../src/layout-logic/registry";
import { DeviceRepository } from "../src/repositories/device-repository";
import { DuplicateDeviceNameError } from "../src/repositories/device-name";
import { LayoutRepository } from "../src/repositories/layout-repository";
import { SettingsRepository } from "../src/repositories/settings-repository";
import type { LocalWarningService } from "../src/services/local-warning-service";
import { ScreenProfileService } from "../src/services/screen-profile-service";

const createHarness = (localWarningService: LocalWarningService | null = null) => {
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
    localWarningService,
  );

  return {
    deviceRepository,
    settingsRepository,
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
    const response = harness.screenProfileService.reportScreenProfile(
      {
        screenSessionId: "device-seed-1",
        targetSelection: {
          kind: "layout",
          layoutName: "16:9 Standard Portrait",
        },
        reportedThemeId: "monokai",
      },
      { lastSeenIp: "192.168.1.40" },
    );

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
    assert.equal(storedDevice.lastSeenIp, "192.168.1.40");
  } finally {
    harness.dispose();
  }
});

test("reportScreenProfile refreshes the last seen ip when the screen checks in again", () => {
  const harness = createHarness();

  try {
    harness.screenProfileService.reportScreenProfile(
      {
        screenSessionId: "device-ip-1",
        reportedThemeId: "default",
      },
      { lastSeenIp: "192.168.1.40" },
    );

    harness.screenProfileService.reportScreenProfile(
      {
        screenSessionId: "device-ip-1",
        reportedThemeId: "default",
      },
      { lastSeenIp: "192.168.1.41" },
    );

    const storedDevice = harness.deviceRepository.getDevice("device-ip-1");
    assert.ok(storedDevice);
    assert.equal(storedDevice.lastSeenIp, "192.168.1.41");
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

test("reportScreenProfile returns the automatic warning layout for warning targets", () => {
  const harness = createHarness();

  try {
    configureLayoutLogicRegistry({
      localWarningService: {
        hasEscalatingWarning: () => true,
      } as unknown as LocalWarningService,
    });
    const warningAuthoring = setPrimaryPhotoRouterBlock({
      authoring: {
        version: 1,
        blocks: [],
      },
      block: {
        id: "photo-router",
        type: "photo-router",
        nodes: [
          {
            id: "warning-a",
            nodeType: "photo-orientation",
            title: "Warning Node",
            photoActionType: LOCAL_WARNING_CANVAS_ACTION_TYPE,
            photoActionCollectionId: null,
            portrait: {
              enabled: true,
              conditionType: LOCAL_WARNING_CONDITION_TYPE,
              conditionParams: {
                locationQuery: "Perth, AU",
              },
            },
            landscape: {
              enabled: false,
              conditionType: "photo.orientation.landscape",
              conditionParams: {},
            },
          },
          {
            id: "layout-fallback",
            nodeType: "layout",
            layoutName: "16:9 Standard Landscape",
            cycleSeconds: 20,
            actionType: "layout.display",
            actionParams: {},
          },
        ],
        title: "Photo Orientation",
        photoActionType: LOCAL_WARNING_CANVAS_ACTION_TYPE,
        photoActionCollectionId: null,
        layoutNodes: [],
        connections: [
          {
            id: "__start__::default::warning-a",
            source: "__start__",
            sourceHandle: null,
            target: "warning-a",
          },
          {
            id: "warning-a::fallback::layout-fallback",
            source: "warning-a",
            sourceHandle: "fallback",
            target: "layout-fallback",
          },
          {
            id: "layout-fallback::next::__end__",
            source: "layout-fallback",
            sourceHandle: "next",
            target: "__end__",
          },
        ],
        nodePositions: {},
        fallback: {
          steps: [],
        },
        portrait: {
          enabled: true,
          conditionType: LOCAL_WARNING_CONDITION_TYPE,
          conditionParams: {},
          steps: [],
        },
        landscape: {
          enabled: false,
          conditionType: "photo.orientation.landscape",
          conditionParams: {},
          steps: [],
        },
      },
    });
    const mapping = harness.settingsRepository.getScreenProfileLayouts();
    harness.settingsRepository.setScreenProfileLayouts({
      ...mapping,
      families: {
        ...mapping.families,
        "set-1": {
          ...mapping.families["set-1"],
          logicBlocks: warningAuthoring,
          logicGraph: compileLayoutSetAuthoringToLogicGraph(warningAuthoring),
        },
      },
    });

    const response = harness.screenProfileService.reportScreenProfile({
      screenSessionId: "device-warning-1",
      reportedThemeId: "default",
    });

    assert.equal(response.layout?.name, LOCAL_WARNING_AUTO_LAYOUT_LABEL);
    assert.equal(response.layout?.config.modules[0]?.moduleId, LOCAL_WARNING_MODULE_ID);
    assert.equal(response.layout?.config.modules[0]?.config.locationQuery, "Perth, AU");
    assert.equal(response.warningTicker, null);
  } finally {
    configureLayoutLogicRegistry({
      localWarningService: null,
    });
    harness.dispose();
  }
});

test("minor warnings stay on the normal layout and return a ticker payload", () => {
  const localWarningService = {
    hasEscalatingWarning: () => false,
    listCachedActiveWarnings: () => [
      {
        id: "warn-1",
        serviceKind: "emergency-wa" as const,
        serviceLabel: "Emergency WA",
        categoryLabel: "Fire",
        alertLevel: "Bushfire Advice",
        headline: "Bushfire Advice MONITOR CONDITIONS - YANCHEP",
        severity: "Minor",
        urgency: "Future",
        eventLabel: "Bushfire",
        areaLabels: ["Yanchep"],
        detailUrl: "https://emergency.wa.gov.au/warnings/test-warning",
      },
    ],
  } as unknown as LocalWarningService;
  const harness = createHarness(localWarningService);

  try {
    configureLayoutLogicRegistry({
      localWarningService,
    });
    const warningAuthoring = setPrimaryPhotoRouterBlock({
      authoring: {
        version: 1,
        blocks: [],
      },
      block: {
        id: "photo-router",
        type: "photo-router",
        nodes: [
          {
            id: "warning-a",
            nodeType: "photo-orientation",
            title: "Warning Node",
            photoActionType: LOCAL_WARNING_CANVAS_ACTION_TYPE,
            photoActionCollectionId: null,
            portrait: {
              enabled: true,
              conditionType: LOCAL_WARNING_CONDITION_TYPE,
              conditionParams: {
                locationQuery: "Yanchep, AU",
              },
            },
            landscape: {
              enabled: false,
              conditionType: "photo.orientation.landscape",
              conditionParams: {},
            },
          },
          {
            id: "layout-fallback",
            nodeType: "layout",
            layoutName: "16:9 Standard Landscape",
            cycleSeconds: 20,
            actionType: "layout.display",
            actionParams: {},
          },
        ],
        title: "Photo Orientation",
        photoActionType: LOCAL_WARNING_CANVAS_ACTION_TYPE,
        photoActionCollectionId: null,
        layoutNodes: [],
        connections: [
          {
            id: "__start__::default::warning-a",
            source: "__start__",
            sourceHandle: null,
            target: "warning-a",
          },
          {
            id: "warning-a::fallback::layout-fallback",
            source: "warning-a",
            sourceHandle: "fallback",
            target: "layout-fallback",
          },
          {
            id: "layout-fallback::next::__end__",
            source: "layout-fallback",
            sourceHandle: "next",
            target: "__end__",
          },
        ],
        nodePositions: {},
        fallback: {
          steps: [],
        },
        portrait: {
          enabled: true,
          conditionType: LOCAL_WARNING_CONDITION_TYPE,
          conditionParams: {},
          steps: [],
        },
        landscape: {
          enabled: false,
          conditionType: "photo.orientation.landscape",
          conditionParams: {},
          steps: [],
        },
      },
    });
    const mapping = harness.settingsRepository.getScreenProfileLayouts();
    harness.settingsRepository.setScreenProfileLayouts({
      ...mapping,
      families: {
        ...mapping.families,
        "set-1": {
          ...mapping.families["set-1"],
          logicBlocks: warningAuthoring,
          logicGraph: compileLayoutSetAuthoringToLogicGraph(warningAuthoring),
        },
      },
    });

    const response = harness.screenProfileService.reportScreenProfile({
      screenSessionId: "device-warning-ticker-1",
      reportedThemeId: "default",
    });

    assert.equal(response.layout?.name, "16:9 Standard Landscape");
    assert.equal(response.warningTicker?.locationLabel, "Yanchep, AU");
    assert.equal(response.warningTicker?.warnings.length, 1);
    assert.equal(response.warningTicker?.warnings[0]?.alertLevel, "Bushfire Advice");
  } finally {
    configureLayoutLogicRegistry({
      localWarningService: null,
    });
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

    const emptySetSelection = harness.screenProfileService.validateManagedDeviceTargetSelection({
      kind: "set",
      setId: null,
    });
    assert.equal(emptySetSelection.ok, false);
    assert.equal(emptySetSelection.message, "Choose a set.");
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

test("default device names stay unique when ids share the same readable prefix", () => {
  const harness = createHarness();

  try {
    const first = harness.screenProfileService.reportScreenProfile({
      screenSessionId: "abcd1234-first",
      reportedThemeId: "default",
    });
    const second = harness.screenProfileService.reportScreenProfile({
      screenSessionId: "abcd1234-second",
      reportedThemeId: "default",
    });

    assert.equal(first.device.name, "Display ABCD-1234");
    assert.equal(second.device.name, "Display ABCD-1234 (2)");
  } finally {
    harness.dispose();
  }
});

test("device updates reject duplicate names case-insensitively", () => {
  const harness = createHarness();

  try {
    harness.screenProfileService.reportScreenProfile({
      screenSessionId: "device-name-1",
      reportedThemeId: "default",
    });
    harness.screenProfileService.reportScreenProfile({
      screenSessionId: "device-name-2",
      reportedThemeId: "default",
    });

    harness.deviceRepository.updateDevice("device-name-1", {
      name: "Kitchen display",
      themeId: "default",
      targetSelection: null,
    });

    assert.throws(
      () =>
        harness.deviceRepository.updateDevice("device-name-2", {
          name: "kitchen DISPLAY",
          themeId: "default",
          targetSelection: null,
        }),
      DuplicateDeviceNameError,
    );
  } finally {
    harness.dispose();
  }
});

test("database startup normalizes existing duplicate device names before adding the unique index", () => {
  const directory = mkdtempSync(join(tmpdir(), "hearth-device-migration-"));
  const filePath = join(directory, "hearth.sqlite");
  const rawDb = new Database(filePath);

  try {
    rawDb.exec(`
      CREATE TABLE devices (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        theme_id TEXT NOT NULL DEFAULT 'default',
        target_selection_json TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    rawDb.exec(`
      INSERT INTO devices (id, name) VALUES
        ('device-a', 'Kitchen display'),
        ('device-b', 'kitchen display'),
        ('device-c', '');
    `);
  } finally {
    rawDb.close();
  }

  const migratedDb = createDatabase(filePath);
  const repository = new DeviceRepository(migratedDb);

  try {
    const devices = repository
      .listDevices()
      .slice()
      .sort((left, right) => left.id.localeCompare(right.id));

    assert.equal(devices[0]?.name, "Kitchen display");
    assert.equal(devices[0]?.lastSeenIp, null);
    assert.equal(devices[1]?.name, "kitchen display (2)");
    assert.equal(devices[1]?.lastSeenIp, null);
    assert.equal(devices[2]?.name, "Display DEVICEC");
    assert.equal(devices[2]?.lastSeenIp, null);
  } finally {
    migratedDb.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
