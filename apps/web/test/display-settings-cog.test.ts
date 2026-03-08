import assert from "node:assert/strict";
import test from "node:test";
import {
  getDisplaySettingsCogVisible,
  setDisplaySettingsCogVisible,
} from "../src/preferences/display-settings-cog";

interface MockWindow {
  localStorage: {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
  };
  dispatchEvent: (event: Event) => boolean;
  addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
  removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
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
      removeItem: (key) => {
        storage.delete(key);
      },
    },
    dispatchEvent: () => true,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: mockWindow,
  });

  return mockWindow;
};

test("defaults display settings cog visibility to true without a browser window", () => {
  restoreWindow();

  assert.equal(getDisplaySettingsCogVisible(), true);
});

test("reads a stored hidden preference from localStorage", () => {
  installMockWindow({
    "hearth:display-settings-cog-visible": "false",
  });

  assert.equal(getDisplaySettingsCogVisible(), false);

  restoreWindow();
});

test("persists visibility updates as local device state", () => {
  const mockWindow = installMockWindow();

  const nextVisible = setDisplaySettingsCogVisible(false);

  assert.equal(nextVisible, false);
  assert.equal(
    mockWindow.localStorage.getItem("hearth:display-settings-cog-visible"),
    "false",
  );

  restoreWindow();
});
