import assert from "node:assert/strict";
import test from "node:test";
import { getDeviceId, getOrCreateDeviceId } from "../src/device/device-id";

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

test("getDeviceId returns null without a browser window", () => {
  restoreWindow();

  assert.equal(getDeviceId(), null);
});

test("getOrCreateDeviceId reuses an existing stored id", () => {
  installMockWindow({
    "hearth:screen-session-id": "existing-device-id",
  });

  assert.equal(getOrCreateDeviceId(), "existing-device-id");
  assert.equal(getDeviceId(), "existing-device-id");

  restoreWindow();
});

test("getOrCreateDeviceId creates and persists a new id", () => {
  const mockWindow = installMockWindow();

  const firstId = getOrCreateDeviceId();
  const secondId = getOrCreateDeviceId();

  assert.ok(firstId.length > 0);
  assert.equal(firstId, secondId);
  assert.equal(mockWindow.localStorage.getItem("hearth:screen-session-id"), firstId);

  restoreWindow();
});
