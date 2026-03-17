import assert from "node:assert/strict";
import test from "node:test";
import React, { StrictMode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { moduleDefinition as clockModule } from "../src/modules/sdk/clock.module";
import { moduleDefinition as countDownModule } from "../src/modules/sdk/count-down.module";
import { moduleDefinition as serverStatusModule } from "../src/modules/sdk/server-status.module";
import { moduleDefinition as localWarningsModule } from "../src/modules/sdk/local-warnings.module";
import { moduleDefinition as koboReaderModule } from "../src/modules/sdk/kobo-reader.module";

type RuntimeComponentProps = {
  instanceId: string;
  settings: Record<string, unknown>;
  data: unknown;
  loading: boolean;
  error: string | null;
  isEditing: boolean;
};

type TestModuleDefinition = {
  manifest: { id: string };
  settingsSchema: { parse: (input: unknown) => Record<string, unknown> };
  runtime: {
    Component: (props: RuntimeComponentProps) => React.ReactElement | null;
  };
};

const originalWindow = globalThis.window;
const originalNavigator = globalThis.navigator;
const originalFetch = globalThis.fetch;
const originalResizeObserver = globalThis.ResizeObserver;
const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const createFetchResponse = (url: string) => {
  if (url.includes("/api/modules/server-status")) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        service: "hearth",
        uptimeSeconds: 123,
        timestamp: new Date().toISOString(),
        memory: {
          rss: 1024,
          heapUsed: 512,
          heapTotal: 2048,
        },
      }),
    };
  }

  if (url.includes("/api/modules/local-warnings/current")) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        generatedAt: new Date().toISOString(),
        locationLabel: "Perth",
        warnings: [],
        warning: null,
      }),
    };
  }

  if (url.includes("/api/modules/kobo-reader/current")) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        generatedAt: new Date().toISOString(),
        userName: "Test User",
        book: null,
        warning: null,
        progressPercent: 0,
        spentReadingMinutes: null,
        remainingReadingMinutes: null,
      }),
    };
  }

  throw new Error(`Unhandled fetch in edit-mode regression test: ${url}`);
};

const installBrowserShims = () => {
  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

  const windowShim = {
    addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
      const existing = listeners.get(type) ?? new Set<EventListenerOrEventListenerObject>();
      existing.add(listener);
      listeners.set(type, existing);
    },
    removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent: (_event: Event) => true,
    setInterval,
    clearInterval,
    setTimeout,
    clearTimeout,
    localStorage: {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    },
  } as unknown as Window & typeof globalThis;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: windowShim,
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { onLine: true },
  });
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async (input: string | URL | Request) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      return createFetchResponse(url);
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
};

const restoreBrowserShims = () => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow,
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
};

const renderModule = (
  moduleDefinition: TestModuleDefinition,
  isEditing: boolean,
) => {
  const Component = moduleDefinition.runtime.Component;
  return React.createElement(
    StrictMode,
    null,
    React.createElement(Component, {
      instanceId: `test-${moduleDefinition.manifest.id}`,
      settings: moduleDefinition.settingsSchema.parse({}),
      data: null,
      loading: false,
      error: null,
      isEditing,
    }),
  );
};

const assertEditingToggleIsStable = async (moduleDefinition: TestModuleDefinition) => {
  let renderer: ReactTestRenderer | null = null;

  await act(async () => {
    renderer = create(renderModule(moduleDefinition, true));
    await flushMicrotasks();
  });

  assert.ok(renderer, `Expected renderer for ${moduleDefinition.manifest.id}`);

  await act(async () => {
    renderer?.update(renderModule(moduleDefinition, false));
    await flushMicrotasks();
  });

  await act(async () => {
    renderer?.update(renderModule(moduleDefinition, true));
    await flushMicrotasks();
  });

  await act(async () => {
    renderer?.unmount();
    await flushMicrotasks();
  });
};

test("sdk modules stay stable when toggling edit mode", async () => {
  installBrowserShims();

  try {
    const modules: TestModuleDefinition[] = [
      clockModule,
      countDownModule,
      serverStatusModule,
      localWarningsModule,
      koboReaderModule,
    ];

    for (const moduleDefinition of modules) {
      await assertEditingToggleIsStable(moduleDefinition);
    }
  } finally {
    restoreBrowserShims();
  }
});
