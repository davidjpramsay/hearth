import assert from "node:assert/strict";
import test from "node:test";
import { resolveModuleConnectivityState } from "../src/modules/data/connection-state";

test("keeps stale content visible for connectivity errors when a snapshot exists", () => {
  const result = resolveModuleConnectivityState({
    error: "Failed to fetch",
    hasSnapshot: true,
    isOnline: true,
  });

  assert.equal(result.blockingError, null);
  assert.equal(result.showDisconnected, true);
});

test("shows a blocking error when no snapshot exists yet", () => {
  const result = resolveModuleConnectivityState({
    error: "Failed to fetch",
    hasSnapshot: false,
    isOnline: true,
  });

  assert.equal(result.blockingError, "Can't reach the server yet. Waiting for first sync.");
  assert.equal(result.showDisconnected, false);
});

test("shows the disconnected badge immediately when the browser is offline", () => {
  const result = resolveModuleConnectivityState({
    error: null,
    hasSnapshot: true,
    isOnline: false,
  });

  assert.equal(result.blockingError, null);
  assert.equal(result.showDisconnected, true);
});

test("keeps non-connectivity errors blocking even with a snapshot", () => {
  const result = resolveModuleConnectivityState({
    error: "Request failed (500)",
    hasSnapshot: true,
    isOnline: true,
  });

  assert.equal(result.blockingError, "Request failed (500)");
  assert.equal(result.showDisconnected, false);
});
