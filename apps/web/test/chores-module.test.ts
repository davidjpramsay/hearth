import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import {
  choresBoardResponseSchema,
  type ChoresBoardResponse,
  type ChoresModuleConfig,
} from "@hearth/shared";
import { moduleDefinition as choresModule } from "../src/modules/sdk/chores.module";

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

const createBoard = (input: {
  startDate: string;
  items: Array<{
    choreId: number;
    choreName: string;
    completed: boolean;
    valueAmount?: number | null;
  }>;
  weeklyByMember?: ChoresBoardResponse["stats"]["weeklyByMember"];
}): ChoresBoardResponse =>
  choresBoardResponseSchema.parse({
    generatedAt: new Date("2026-03-24T08:00:00.000Z").toISOString(),
    startDate: input.startDate,
    days: 1,
    payoutConfig: {
      mode: "all-or-nothing",
      oneOffBonusEnabled: true,
      paydayDayOfWeek: 6,
      siteTimezone: "Australia/Perth",
    },
    members: [
      {
        id: 1,
        name: "Alex",
        avatarUrl: null,
        weeklyAllowance: 10,
        createdAt: "2026-03-24T08:00:00.000Z",
        updatedAt: "2026-03-24T08:00:00.000Z",
      },
    ],
    chores: input.items.map((item) => ({
      id: item.choreId,
      name: item.choreName,
      memberId: 1,
      schedule: { type: "daily" as const },
      startsOn: input.startDate,
      valueAmount: item.valueAmount ?? null,
      active: true,
      createdAt: "2026-03-24T08:00:00.000Z",
      updatedAt: "2026-03-24T08:00:00.000Z",
    })),
    board: [
      {
        date: input.startDate,
        items: input.items.map((item) => ({
          date: input.startDate,
          choreId: item.choreId,
          choreName: item.choreName,
          memberId: 1,
          memberName: "Alex",
          memberAvatarUrl: null,
          schedule: { type: "daily" as const },
          valueAmount: item.valueAmount ?? null,
          completed: item.completed,
        })),
      },
    ],
    stats: {
      dailyCompletionRate:
        input.items.length === 0
          ? 0
          : input.items.filter((item) => item.completed).length / input.items.length,
      weeklyCompletedCount: input.items.filter((item) => item.completed).length,
      weeklyTotalValue: 0,
      weeklyByMember: input.weeklyByMember ?? [
        {
          memberId: 1,
          memberName: "Alex",
          memberAvatarUrl: null,
          completedCount: input.items.filter((item) => item.completed).length,
          totalValue: 0,
          recurringScheduledCount: input.items.length,
          recurringCompletedCount: input.items.filter((item) => item.completed).length,
          completionRatio:
            input.items.length === 0
              ? 0
              : input.items.filter((item) => item.completed).length / input.items.length,
          baseAllowance: 10,
          basePayout: 0,
          bonusPayout: 0,
          payoutTotal: 0,
        },
      ],
    },
  });

const callListener = (listener: Listener, event: Event): void => {
  if (typeof listener === "function") {
    listener(event);
    return;
  }

  listener.handleEvent(event);
};

const installBrowserShims = (responses: ChoresBoardResponse[]) => {
  const windowListeners = new Map<string, Set<Listener>>();
  const documentListeners = new Map<string, Set<Listener>>();
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
    documentShim,
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

const renderModule = (settings: Partial<ChoresModuleConfig> = {}) => {
  const Component = choresModule.runtime.Component as (
    props: Record<string, unknown>,
  ) => React.ReactElement;
  return React.createElement(Component, {
    instanceId: "chores-test",
    settings: choresModule.settingsSchema.parse(settings),
    data: null,
    loading: false,
    error: null,
    isEditing: false,
  });
};

test("chores module refreshes when the page becomes visible again", async () => {
  const shims = installBrowserShims([
    createBoard({
      startDate: "2026-03-23",
      items: [{ choreId: 1, choreName: "Yesterday Dishes", completed: true }],
    }),
    createBoard({
      startDate: "2026-03-24",
      items: [{ choreId: 1, choreName: "Today Dishes", completed: false }],
    }),
  ]);

  let renderer: ReactTestRenderer | null = null;

  try {
    await act(async () => {
      renderer = create(renderModule());
      await flushMicrotasks();
    });

    assert.equal(shims.getFetchCallCount(), 1);
    assert.match(JSON.stringify(renderer?.toJSON()), /Yesterday Dishes/);

    await act(async () => {
      shims.documentShim.dispatchEvent({ type: "visibilitychange" } as Event);
      await flushMicrotasks();
    });

    const tree = JSON.stringify(renderer?.toJSON());
    assert.equal(shims.getFetchCallCount(), 2);
    assert.match(tree, /Today Dishes/);
    assert.doesNotMatch(tree, /Yesterday Dishes/);
  } finally {
    await act(async () => {
      renderer?.unmount();
      await flushMicrotasks();
    });
    restoreBrowserShims();
  }
});

test("chores module keeps incomplete items first and shows actual earned payout", async () => {
  installBrowserShims([
    createBoard({
      startDate: "2026-03-24",
      items: [
        { choreId: 1, choreName: "Completed Task", completed: true },
        { choreId: 2, choreName: "Open Task", completed: false },
      ],
      weeklyByMember: [
        {
          memberId: 1,
          memberName: "Alex",
          memberAvatarUrl: null,
          completedCount: 1,
          totalValue: 0,
          recurringScheduledCount: 2,
          recurringCompletedCount: 1,
          completionRatio: 0.5,
          baseAllowance: 10,
          basePayout: 0,
          bonusPayout: 0,
          payoutTotal: 0,
        },
      ],
    }),
  ]);

  let renderer: ReactTestRenderer | null = null;

  try {
    await act(async () => {
      renderer = create(renderModule({ enableMoneyTracking: true, showStats: true }));
      await flushMicrotasks();
    });

    const tree = JSON.stringify(renderer?.toJSON());
    assert.ok(tree.indexOf("Open Task") < tree.indexOf("Completed Task"));
    assert.ok(tree.includes('"children":["Pay $","0.00"," / $","10.00"]'));
  } finally {
    await act(async () => {
      renderer?.unmount();
      await flushMicrotasks();
    });
    restoreBrowserShims();
  }
});
