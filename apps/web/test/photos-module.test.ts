import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { photosModuleNextResponseSchema } from "@hearth/shared";
import { moduleDefinition as photosModule } from "../src/modules/sdk/photos.module";
import { writePersistedModuleSnapshot } from "../src/modules/data/persisted-module-snapshot";

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

const callListener = (listener: Listener, event: Event): void => {
  if (typeof listener === "function") {
    listener(event);
    return;
  }

  listener.handleEvent(event);
};

const installBrowserShims = () => {
  const windowListeners = new Map<string, Set<Listener>>();
  const localStorageEntries = new Map<string, string>();

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
    documentElement: {
      getAttribute: () => null,
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
      throw new Error("Failed to fetch");
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
  const Component = photosModule.runtime.Component as (
    props: Record<string, unknown>,
  ) => React.ReactElement;
  return React.createElement(Component, {
    instanceId: "photos-test",
    settings: photosModule.settingsSchema.parse({}),
    data: null,
    loading: false,
    error: null,
    isEditing: false,
  });
};

test("photos module uses the persisted frame on a cold boot fetch failure", async () => {
  installBrowserShims();
  writePersistedModuleSnapshot(
    'photos:photos-test:{"requestedSourceKind":"layout","setCollectionId":null,"moduleCollectionId":null,"folderPath":"/photos"}',
    photosModuleNextResponseSchema.parse({
      generatedAt: "2026-03-29T00:00:00.000Z",
      frame: {
        imageId: "cached-photo",
        imageUrl: "/api/modules/photos/photos-test/image/cached-photo",
        filename: "cached-photo.jpg",
        width: 1200,
        height: 900,
        orientation: "landscape",
      },
      stableOrientation: "landscape",
      warning: null,
    }),
    Date.now(),
  );

  let renderer: ReactTestRenderer | null = null;

  try {
    await act(async () => {
      renderer = create(renderModule());
      await flushMicrotasks();
    });

    const tree = JSON.stringify(renderer?.toJSON());
    assert.match(tree, /cached-photo\.jpg/);
    assert.doesNotMatch(tree, /Failed to fetch/);
  } finally {
    await act(async () => {
      renderer?.unmount();
      await flushMicrotasks();
    });
    restoreBrowserShims();
  }
});
