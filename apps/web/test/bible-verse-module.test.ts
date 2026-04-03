import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { bibleVerseModuleResponseSchema } from "@hearth/shared";
import { moduleDefinition as bibleVerseModule } from "../src/modules/sdk/bible-verse.module";
import { syncDisplayTimeContext } from "../src/runtime/display-time";

type Listener = EventListenerOrEventListenerObject;

const WEDNESDAY_NOW_MS = Date.parse("2026-04-01T02:00:00.000Z");
const FRIDAY_NOW_MS = Date.parse("2026-04-03T02:00:00.000Z");

const originalDateNow = Date.now;
const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalNavigator = globalThis.navigator;
const originalFetch = globalThis.fetch;
const originalResizeObserver = globalThis.ResizeObserver;
const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
const originalIsActEnvironment = (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT;

const flushMicrotasks = async () => {
  await Promise.resolve();
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

const createVersePayload = (input: { verse: string; reference: string }) =>
  bibleVerseModuleResponseSchema.parse({
    generatedAt: new Date(WEDNESDAY_NOW_MS).toISOString(),
    verse: input.verse,
    reference: input.reference,
    sourceLabel: "api.esv.org (ESV)",
    warning: null,
  });

const installBrowserShims = (responses: Array<unknown>) => {
  const windowListeners = new Map<string, Set<Listener>>();
  const documentListeners = new Map<string, Set<Listener>>();
  const localStorageEntries = new Map<string, string>();
  let fetchCallCount = 0;
  let nowMs = WEDNESDAY_NOW_MS;
  let visibilityState: DocumentVisibilityState = "visible";

  const windowShim = {
    addEventListener: (type: string, listener: Listener) => {
      const existing = windowListeners.get(type) ?? new Set<Listener>();
      existing.add(listener);
      windowListeners.set(type, existing);
    },
    removeEventListener: (type: string, listener: Listener) => {
      windowListeners.get(type)?.delete(listener);
    },
    dispatchEvent: (event: Event) => {
      for (const listener of windowListeners.get(event.type) ?? []) {
        callListener(listener, event);
      }
      return true;
    },
    setInterval,
    clearInterval,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0),
    cancelAnimationFrame: (handle: number) => clearTimeout(handle),
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

  const documentShim = {
    addEventListener: (type: string, listener: Listener) => {
      const existing = documentListeners.get(type) ?? new Set<Listener>();
      existing.add(listener);
      documentListeners.set(type, existing);
    },
    removeEventListener: (type: string, listener: Listener) => {
      documentListeners.get(type)?.delete(listener);
    },
    dispatchEvent: (event: Event) => {
      for (const listener of documentListeners.get(event.type) ?? []) {
        callListener(listener, event);
      }
      return true;
    },
    get visibilityState() {
      return visibilityState;
    },
    set visibilityState(value: DocumentVisibilityState) {
      visibilityState = value;
    },
  } as unknown as Document;

  Object.defineProperty(Date, "now", {
    configurable: true,
    value: () => nowMs,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: windowShim,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: documentShim,
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { onLine: true },
  });
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async () => {
      const response = responses[Math.min(fetchCallCount, responses.length - 1)];
      fetchCallCount += 1;
      if (response instanceof Error) {
        throw response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => response,
      };
    },
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

  return {
    setNowMs: (value: number) => {
      nowMs = value;
    },
    getFetchCallCount: () => fetchCallCount,
  };
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
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: originalDocument,
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: originalNavigator,
  });
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: originalFetch,
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

const renderModule = () => {
  const Component = bibleVerseModule.runtime.Component as (
    props: Record<string, unknown>,
  ) => React.ReactElement;

  return React.createElement(Component, {
    instanceId: "bible-verse-test",
    settings: bibleVerseModule.settingsSchema.parse({
      refreshIntervalSeconds: 3600,
      showReference: true,
      showSource: false,
    }),
    data: null,
    loading: false,
    error: null,
    isEditing: false,
  });
};

test("bible verse module refreshes when synced site date rolls over", async () => {
  const browser = installBrowserShims([
    createVersePayload({
      verse: "Wednesday verse text",
      reference: "John 3:16",
    }),
    createVersePayload({
      verse: "Friday verse text",
      reference: "Psalm 23:1",
    }),
  ]);
  let renderer: ReactTestRenderer | null = null;

  try {
    syncDisplayTimeContext({
      siteTimeZone: "Australia/Perth",
      serverNowMs: WEDNESDAY_NOW_MS,
      localStartedAtMs: WEDNESDAY_NOW_MS,
      localReceivedAtMs: WEDNESDAY_NOW_MS,
    });

    await act(async () => {
      renderer = create(renderModule());
      await flushMicrotasks();
    });

    let tree = JSON.stringify(renderer?.toJSON());
    assert.match(tree, /Wednesday verse text/);
    assert.match(tree, /John 3:16/);

    browser.setNowMs(FRIDAY_NOW_MS);
    syncDisplayTimeContext({
      siteTimeZone: "Australia/Perth",
      serverNowMs: FRIDAY_NOW_MS,
      localStartedAtMs: FRIDAY_NOW_MS,
      localReceivedAtMs: FRIDAY_NOW_MS,
    });

    await act(async () => {
      await flushMicrotasks();
    });

    tree = JSON.stringify(renderer?.toJSON());
    assert.match(tree, /Friday verse text/);
    assert.match(tree, /Psalm 23:1/);
    assert.doesNotMatch(tree, /Wednesday verse text/);
    assert.equal(browser.getFetchCallCount(), 2);
  } finally {
    await act(async () => {
      renderer?.unmount();
      await flushMicrotasks();
    });
    restoreBrowserShims();
  }
});
