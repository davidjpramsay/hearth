import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { plannerTodayResponseSchema, type PlannerTodayResponse } from "@hearth/shared";
import { moduleDefinition as plannerModule } from "../src/modules/sdk/homeschool-planner.module";
import { syncDisplayTimeContext } from "../src/runtime/display-time";

type Listener = EventListenerOrEventListenerObject;

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

const createResponse = (input: {
  siteDate: string;
  templateName: string | null;
}): PlannerTodayResponse =>
  plannerTodayResponseSchema.parse({
    generatedAt: new Date("2026-04-06T08:00:00.000Z").toISOString(),
    siteDate: input.siteDate,
    dayWindow: {
      startTime: "08:00",
      endTime: "15:00",
    },
    users: [
      {
        id: 1,
        name: "Alex",
        createdAt: "2026-04-06T08:00:00.000Z",
        updatedAt: "2026-04-06T08:00:00.000Z",
      },
    ],
    template: input.templateName
      ? {
          id: 1,
          name: input.templateName,
          repeatDays: [1],
          createdAt: "2026-04-06T08:00:00.000Z",
          updatedAt: "2026-04-06T08:00:00.000Z",
        }
      : null,
    blocks: input.templateName
      ? [
          {
            id: 1,
            templateId: 1,
            userId: 1,
            name: "Maths",
            colour: "color-4",
            notes: "Workbook",
            startTime: "08:00",
            endTime: "09:00",
            createdAt: "2026-04-06T08:00:00.000Z",
            updatedAt: "2026-04-06T08:00:00.000Z",
          },
        ]
      : [],
  });

const callListener = (listener: Listener, event: Event): void => {
  if (typeof listener === "function") {
    listener(event);
    return;
  }

  listener.handleEvent(event);
};

const installBrowserShims = (responses: Array<PlannerTodayResponse | Error>) => {
  const windowListeners = new Map<string, Set<Listener>>();
  const documentListeners = new Map<string, Set<Listener>>();
  const localStorageEntries = new Map<string, string>();
  let fetchCallCount = 0;
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
    getFetchCallCount: () => fetchCallCount,
  };
};

const restoreBrowserShims = () => {
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

test("planner module shows a clear empty state when no plan is assigned", async () => {
  const shims = installBrowserShims([
    createResponse({ siteDate: "2026-04-06", templateName: null }),
  ]);
  syncDisplayTimeContext({
    siteTimeZone: "Australia/Perth",
    serverNowMs: new Date("2026-04-06T08:00:00.000Z").getTime(),
    localReceivedAtMs: new Date("2026-04-06T08:00:00.000Z").getTime(),
  });

  let renderer: ReactTestRenderer | null = null;

  try {
    await act(async () => {
      renderer = create(
        React.createElement(plannerModule.runtime.Component, {
          instanceId: "planner-1",
          settings: plannerModule.settingsSchema.parse({}),
          data: null,
          loading: false,
          error: null,
          isEditing: false,
        }),
      );
      await flushMicrotasks();
    });

    const text = JSON.stringify(renderer!.toJSON());
    assert.match(text, /No plan assigned for today/);
    assert.equal(shims.getFetchCallCount(), 1);
  } finally {
    if (renderer) {
      await act(async () => {
        renderer?.unmount();
      });
    }
    restoreBrowserShims();
  }
});

test("planner module refreshes when synced display time rolls into a new site day", async () => {
  const shims = installBrowserShims([
    createResponse({ siteDate: "2026-04-06", templateName: "Monday core" }),
    createResponse({ siteDate: "2026-04-07", templateName: "Tuesday core" }),
  ]);
  const firstNowMs = new Date("2026-04-06T08:00:00.000Z").getTime();
  syncDisplayTimeContext({
    siteTimeZone: "Australia/Perth",
    serverNowMs: firstNowMs,
    localReceivedAtMs: firstNowMs,
  });

  let renderer: ReactTestRenderer | null = null;

  try {
    await act(async () => {
      renderer = create(
        React.createElement(plannerModule.runtime.Component, {
          instanceId: "planner-2",
          settings: plannerModule.settingsSchema.parse({}),
          data: null,
          loading: false,
          error: null,
          isEditing: false,
        }),
      );
      await flushMicrotasks();
    });

    assert.equal(shims.getFetchCallCount(), 1);
    assert.match(JSON.stringify(renderer!.toJSON()), /Monday core/);

    await act(async () => {
      const secondNowMs = new Date("2026-04-07T08:00:05.000Z").getTime();
      syncDisplayTimeContext({
        siteTimeZone: "Australia/Perth",
        serverNowMs: secondNowMs,
        localReceivedAtMs: secondNowMs,
      });
      await flushMicrotasks();
    });

    assert.equal(shims.getFetchCallCount(), 2);
    assert.match(JSON.stringify(renderer!.toJSON()), /Tuesday core/);
  } finally {
    if (renderer) {
      await act(async () => {
        renderer?.unmount();
      });
    }
    restoreBrowserShims();
  }
});
