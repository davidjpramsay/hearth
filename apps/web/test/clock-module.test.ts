import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { moduleDefinition as clockModule } from "../src/modules/sdk/clock.module";
import { syncDisplayTimeContext } from "../src/runtime/display-time";

type Listener = EventListenerOrEventListenerObject;

const FIXED_NOW_MS = Date.parse("2026-03-29T10:34:56.000Z");
const originalDateNow = Date.now;
const originalWindow = globalThis.window;
const originalNavigator = globalThis.navigator;
const originalResizeObserver = globalThis.ResizeObserver;
const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
const originalIsActEnvironment = (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT;

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const callListener = (listener: Listener, event: Event): void => {
  if (typeof listener === "function") {
    listener(event);
    return;
  }

  listener.handleEvent(event);
};

const installBrowserShims = () => {
  const listeners = new Map<string, Set<Listener>>();
  const localStorageEntries = new Map<string, string>();
  const windowShim = {
    addEventListener: (type: string, listener: Listener) => {
      const existing = listeners.get(type) ?? new Set<Listener>();
      existing.add(listener);
      listeners.set(type, existing);
    },
    removeEventListener: (type: string, listener: Listener) => {
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent: (event: Event) => {
      for (const listener of listeners.get(event.type) ?? []) {
        callListener(listener, event);
      }
      return true;
    },
    setInterval,
    clearInterval,
    setTimeout,
    clearTimeout,
    localStorage: {
      getItem: (key: string) => localStorageEntries.get(key) ?? null,
      setItem: (key: string, value: string) => {
        localStorageEntries.set(key, value);
      },
      removeItem: (key: string) => {
        localStorageEntries.delete(key);
      },
    },
  } as unknown as Window & typeof globalThis;

  Object.defineProperty(Date, "now", {
    configurable: true,
    value: () => FIXED_NOW_MS,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: windowShim,
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { onLine: true },
  });
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: class ResizeObserver {
      observe(): void {}
      disconnect(): void {}
      unobserve(): void {}
    },
  });
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true,
    value: (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0),
  });
  Object.defineProperty(globalThis, "cancelAnimationFrame", {
    configurable: true,
    value: (handle: number) => clearTimeout(handle),
  });
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    configurable: true,
    value: true,
  });
};

const restoreBrowserShims = () => {
  Object.defineProperty(Date, "now", {
    configurable: true,
    value: originalDateNow,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow,
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: originalNavigator,
  });
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: originalResizeObserver,
  });
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true,
    value: originalRequestAnimationFrame,
  });
  Object.defineProperty(globalThis, "cancelAnimationFrame", {
    configurable: true,
    value: originalCancelAnimationFrame,
  });
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    configurable: true,
    value: originalIsActEnvironment,
  });
};

const renderModule = (settings: Record<string, unknown>) => {
  const Component = clockModule.runtime.Component as (
    props: Record<string, unknown>,
  ) => React.ReactElement;

  return React.createElement(Component, {
    instanceId: "clock-test",
    settings: clockModule.settingsSchema.parse(settings),
    data: null,
    loading: false,
    error: null,
    isEditing: false,
  });
};

const getParagraphClassNames = (renderer: ReactTestRenderer): string[] =>
  renderer.root
    .findAll((node) => node.type === "p")
    .map((node) => String(node.props.className ?? ""));

test("clock module can render the date beside the time", async () => {
  installBrowserShims();
  let renderer: ReactTestRenderer | null = null;

  try {
    syncDisplayTimeContext({
      siteTimeZone: "Australia/Perth",
      serverNowMs: FIXED_NOW_MS,
      localStartedAtMs: FIXED_NOW_MS,
      localReceivedAtMs: FIXED_NOW_MS,
    });

    await act(async () => {
      renderer = create(
        renderModule({
          showDate: true,
          showSeconds: false,
          dateLayout: "inline",
          reverseOrder: false,
        }),
      );
      await flushMicrotasks();
    });

    const paragraphClasses = getParagraphClassNames(renderer!);
    assert.match(paragraphClasses[0] ?? "", /module-copy-label/);
    assert.match(paragraphClasses[1] ?? "", /module-copy-body/);
    assert.match(paragraphClasses[2] ?? "", /module-copy-hero/);
  } finally {
    await act(async () => {
      renderer?.unmount();
      await flushMicrotasks();
    });
    restoreBrowserShims();
  }
});

test("clock module can reverse the inline date and time order", async () => {
  installBrowserShims();
  let renderer: ReactTestRenderer | null = null;

  try {
    syncDisplayTimeContext({
      siteTimeZone: "Australia/Perth",
      serverNowMs: FIXED_NOW_MS,
      localStartedAtMs: FIXED_NOW_MS,
      localReceivedAtMs: FIXED_NOW_MS,
    });

    await act(async () => {
      renderer = create(
        renderModule({
          showDate: true,
          showSeconds: false,
          dateLayout: "inline",
          reverseOrder: true,
        }),
      );
      await flushMicrotasks();
    });

    const paragraphClasses = getParagraphClassNames(renderer!);
    assert.match(paragraphClasses[0] ?? "", /module-copy-hero/);
    assert.match(paragraphClasses[1] ?? "", /module-copy-label/);
    assert.match(paragraphClasses[2] ?? "", /module-copy-body/);
  } finally {
    await act(async () => {
      renderer?.unmount();
      await flushMicrotasks();
    });
    restoreBrowserShims();
  }
});

test("clock module can render a specific timezone override", async () => {
  installBrowserShims();
  let renderer: ReactTestRenderer | null = null;

  try {
    syncDisplayTimeContext({
      siteTimeZone: "Australia/Perth",
      serverNowMs: FIXED_NOW_MS,
      localStartedAtMs: FIXED_NOW_MS,
      localReceivedAtMs: FIXED_NOW_MS,
    });

    await act(async () => {
      renderer = create(
        renderModule({
          showDate: false,
          showSeconds: false,
          use24Hour: true,
          timeSource: "specific",
          customTimeZone: "Asia/Tokyo",
        }),
      );
      await flushMicrotasks();
    });

    const tree = JSON.stringify(renderer?.toJSON());
    assert.match(tree, /19:34/);
    assert.doesNotMatch(tree, /18:34/);
  } finally {
    await act(async () => {
      renderer?.unmount();
      await flushMicrotasks();
    });
    restoreBrowserShims();
  }
});
