import assert from "node:assert/strict";
import test from "node:test";
import { getDashboardDeviceBootstrapStateFromResolution } from "../src/pages/dashboard-device-bootstrap";

test("dashboard bootstrap state follows the latest server-managed device settings", () => {
  const state = getDashboardDeviceBootstrapStateFromResolution({
    device: {
      id: "device-1",
      name: "Kitchen display",
      themeId: "nord",
      targetSelection: {
        kind: "layout",
        layoutName: "16:9 Standard Portrait",
      },
    },
  });

  assert.deepEqual(state, {
    reportedThemeId: "nord",
    targetSelection: {
      kind: "layout",
      layoutName: "16:9 Standard Portrait",
    },
  });
});

test("dashboard bootstrap state falls back to inherit when the device has no explicit target", () => {
  const state = getDashboardDeviceBootstrapStateFromResolution({
    device: {
      id: "device-2",
      name: "Hallway display",
      themeId: "default",
      targetSelection: null,
    },
  });

  assert.deepEqual(state, {
    reportedThemeId: "default",
    targetSelection: {
      kind: "set",
      setId: null,
    },
  });
});
