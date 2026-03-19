import assert from "node:assert/strict";
import test from "node:test";
import {
  getDashboardDeviceBootstrapStateForDeviceRefresh,
  getDashboardDeviceBootstrapStateFromResolution,
} from "../src/pages/dashboard-device-bootstrap";

interface MockWindow {
  localStorage: {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
  };
}

const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");

const restoreWindow = (): void => {
  if (originalWindowDescriptor) {
    Object.defineProperty(globalThis, "window", originalWindowDescriptor);
    return;
  }

  Reflect.deleteProperty(globalThis, "window");
};

const installMockWindow = (initialStorage: Record<string, string> = {}): MockWindow => {
  const storage = new Map<string, string>(Object.entries(initialStorage));

  const mockWindow: MockWindow = {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => {
        storage.set(key, value);
      },
    },
  };

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: mockWindow,
  });

  return mockWindow;
};

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

test("dashboard bootstrap state preserves the compatibility fallback when the device has no explicit target", () => {
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

test("device refresh bootstrap falls back to local defaults instead of stale managed routing", () => {
  installMockWindow({
    "hearth:device-layout-family": "set-local",
    "hearth:theme-id": "monokai",
  });

  const state = getDashboardDeviceBootstrapStateForDeviceRefresh();

  assert.deepEqual(state, {
    reportedThemeId: "monokai",
    targetSelection: {
      kind: "set",
      setId: "set-local",
    },
  });

  restoreWindow();
});
