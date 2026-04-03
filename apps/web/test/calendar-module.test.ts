import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { calendarModuleEventsResponseSchema } from "@hearth/shared";
import { moduleDefinition as calendarModule } from "../src/modules/sdk/calendar.module";
import { syncDisplayTimeContext } from "../src/runtime/display-time";

type Listener = EventListenerOrEventListenerObject;

const WEDNESDAY_NOW_MS = Date.parse("2026-04-01T02:00:00.000Z");
const FRIDAY_NOW_MS = Date.parse("2026-04-03T02:00:00.000Z");

const originalDateNow = Date.now;
const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalNavigator = globalThis.navigator;
const originalFetch = globalThis.fetch;
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

const createCalendarPayload = () =>
  calendarModuleEventsResponseSchema.parse({
    generatedAt: "2026-04-01T02:00:00.000Z",
    sources: [{ id: "family", label: "Family", color: "#22D3EE" }],
    events: [
      {
        id: "wed",
        source: "family",
        sourceLabel: "Family",
        sourceColor: "#22D3EE",
        title: "Wednesday catch-up",
        start: "2026-04-01T00:00:00.000Z",
        end: "2026-04-02T00:00:00.000Z",
        allDay: true,
        location: null,
      },
      {
        id: "thu",
        source: "family",
        sourceLabel: "Family",
        sourceColor: "#22D3EE",
        title: "Thursday errands",
        start: "2026-04-02T00:00:00.000Z",
        end: "2026-04-03T00:00:00.000Z",
        allDay: true,
        location: null,
      },
      {
        id: "fri",
        source: "family",
        sourceLabel: "Family",
        sourceColor: "#22D3EE",
        title: "Friday plan",
        start: "2026-04-03T00:00:00.000Z",
        end: "2026-04-04T00:00:00.000Z",
        allDay: true,
        location: null,
      },
    ],
    warnings: [],
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
  const Component = calendarModule.runtime.Component as (
    props: Record<string, unknown>,
  ) => React.ReactElement;

  return React.createElement(Component, {
    instanceId: "calendar-test",
    settings: calendarModule.settingsSchema.parse({
      viewMode: "list",
      daysToShow: 3,
      refreshIntervalSeconds: 300,
      use24Hour: true,
      feedSelections: [],
      legacyCalendars: [],
    }),
    data: null,
    loading: false,
    error: null,
    isEditing: false,
  });
};

test("calendar module advances upcoming days when display time rolls over even after refresh failure", async () => {
  const browser = installBrowserShims([createCalendarPayload(), new Error("Failed to fetch")]);
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
    assert.match(tree, /Wednesday catch-up/);
    assert.match(tree, /Thursday errands/);
    assert.match(tree, /Friday plan/);

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
    assert.doesNotMatch(tree, /Wednesday catch-up/);
    assert.doesNotMatch(tree, /Thursday errands/);
    assert.match(tree, /Friday plan/);
    assert.equal(browser.getFetchCallCount(), 2);
  } finally {
    await act(async () => {
      renderer?.unmount();
      await flushMicrotasks();
    });
    restoreBrowserShims();
  }
});
