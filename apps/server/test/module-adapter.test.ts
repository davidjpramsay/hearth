import assert from "node:assert/strict";
import test from "node:test";
import { ModuleEventBus } from "../src/modules/event-bus";
import { serverStatusResponseSchema } from "../src/modules/adapters/server-status";

test("module event bus keeps publishing when a listener throws", () => {
  const eventBus = new ModuleEventBus();
  let delivered = 0;

  eventBus.subscribe("health", () => {
    throw new Error("broken listener");
  });
  eventBus.subscribe("health", () => {
    delivered += 1;
  });

  eventBus.publish("health", { ok: true });

  assert.equal(delivered, 1);
});

test("server status adapter response schema accepts valid payload", () => {
  const parsed = serverStatusResponseSchema.parse({
    ok: true,
    service: "hearth-server",
    uptimeSeconds: 123.4,
    timestamp: new Date().toISOString(),
    processStartedAt: new Date().toISOString(),
    memory: {
      rss: 1000,
      heapUsed: 500,
      heapTotal: 900,
    },
    host: {
      hostname: "local",
      platform: "darwin",
    },
    time: {
      runtimeTimeZone: "Australia/Perth",
      defaultSiteTimeZone: "Australia/Perth",
    },
    diagnostics: {
      backup: {
        running: false,
        latestBackupAt: null,
        backupCount: 2,
        intervalMinutes: 60,
        retentionDays: 7,
        lastError: null,
      },
      calendar: {
        configuredFeedCount: 4,
        enabledFeedCount: 3,
        memoryCacheEntries: 2,
        inFlightRefreshes: 0,
        lastPrefetchAttemptAt: new Date().toISOString(),
        lastPrefetchCompletedAt: new Date().toISOString(),
      },
      storage: {
        databaseFileSizeBytes: 1024,
        databaseLastModifiedAt: new Date().toISOString(),
      },
    },
    build: {
      serverEntrySha1: "abc123",
      serverEntryBuiltAt: new Date().toISOString(),
      webIndexSha1: "def456",
      webIndexBuiltAt: new Date().toISOString(),
      webMainScript: "/assets/index-123.js",
      webMainStylesheet: "/assets/index-123.css",
    },
  });

  assert.equal(parsed.ok, true);
  assert.equal(parsed.service, "hearth-server");
  assert.equal(parsed.build.webMainScript, "/assets/index-123.js");
});
