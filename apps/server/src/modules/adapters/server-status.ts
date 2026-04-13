import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getRuntimeTimeZone } from "@hearth/shared";
import { z } from "zod";
import { config } from "../../config.js";
import type { ModuleAdapterContext, ModuleServerAdapter } from "../types.js";

const processStartedAtMs = Date.now();
let statusTicker: NodeJS.Timeout | null = null;

const resolveExistingFile = (...candidates: string[]): string | null => {
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
};

const readSha1 = (filePath: string | null): string | null => {
  if (!filePath) {
    return null;
  }

  try {
    return createHash("sha1").update(readFileSync(filePath)).digest("hex");
  } catch {
    return null;
  }
};

const readBuiltAt = (filePath: string | null): string | null => {
  if (!filePath) {
    return null;
  }

  try {
    return statSync(filePath).mtime.toISOString();
  } catch {
    return null;
  }
};

const readFileSizeBytes = (filePath: string | null): number | null => {
  if (!filePath) {
    return null;
  }

  try {
    return statSync(filePath).size;
  } catch {
    return null;
  }
};

const readHtmlBuildAsset = (html: string, kind: "script" | "stylesheet"): string | null => {
  const pattern =
    kind === "script"
      ? /<script[^>]+src=["']([^"']+)["'][^>]*type=["']module["'][^>]*>|<script[^>]+type=["']module["'][^>]*src=["']([^"']+)["'][^>]*>/i
      : /<link[^>]+href=["']([^"']+)["'][^>]*rel=["']stylesheet["'][^>]*>|<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/i;
  const match = html.match(pattern);
  return match?.[1] ?? match?.[2] ?? null;
};

const readBuildMetadata = (): {
  serverEntrySha1: string | null;
  serverEntryBuiltAt: string | null;
  webIndexSha1: string | null;
  webIndexBuiltAt: string | null;
  webMainScript: string | null;
  webMainStylesheet: string | null;
} => {
  const serverEntryPath = resolveExistingFile(
    fileURLToPath(new URL("../../index.js", import.meta.url)),
    fileURLToPath(new URL("../../index.ts", import.meta.url)),
  );
  const webIndexPath = resolve(config.webDistPath, "index.html");
  const webIndexHtml =
    existsSync(webIndexPath) && statSync(webIndexPath).isFile()
      ? readFileSync(webIndexPath, "utf8")
      : null;

  return {
    serverEntrySha1: readSha1(serverEntryPath),
    serverEntryBuiltAt: readBuiltAt(serverEntryPath),
    webIndexSha1: readSha1(webIndexPath),
    webIndexBuiltAt: readBuiltAt(webIndexPath),
    webMainScript: webIndexHtml ? readHtmlBuildAsset(webIndexHtml, "script") : null,
    webMainStylesheet: webIndexHtml ? readHtmlBuildAsset(webIndexHtml, "stylesheet") : null,
  };
};

export const serverStatusResponseSchema = z.object({
  ok: z.boolean(),
  service: z.string(),
  uptimeSeconds: z.number().nonnegative(),
  timestamp: z.string(),
  processStartedAt: z.string(),
  memory: z.object({
    rss: z.number().nonnegative(),
    heapUsed: z.number().nonnegative(),
    heapTotal: z.number().nonnegative(),
  }),
  host: z.object({
    hostname: z.string(),
    platform: z.string(),
  }),
  time: z.object({
    runtimeTimeZone: z.string(),
    defaultSiteTimeZone: z.string().nullable(),
  }),
  diagnostics: z.object({
    backup: z.object({
      running: z.boolean(),
      latestBackupAt: z.string().nullable(),
      backupCount: z.number().nonnegative(),
      intervalMinutes: z.number().nonnegative(),
      retentionDays: z.number().nonnegative(),
      lastError: z.string().nullable(),
    }),
    calendar: z.object({
      configuredFeedCount: z.number().nonnegative(),
      enabledFeedCount: z.number().nonnegative(),
      memoryCacheEntries: z.number().nonnegative(),
      inFlightRefreshes: z.number().nonnegative(),
      lastPrefetchAttemptAt: z.string().nullable(),
      lastPrefetchCompletedAt: z.string().nullable(),
    }),
    storage: z.object({
      databaseFileSizeBytes: z.number().nonnegative().nullable(),
      databaseLastModifiedAt: z.string().nullable(),
    }),
  }),
  build: z.object({
    serverEntrySha1: z.string().nullable(),
    serverEntryBuiltAt: z.string().nullable(),
    webIndexSha1: z.string().nullable(),
    webIndexBuiltAt: z.string().nullable(),
    webMainScript: z.string().nullable(),
    webMainStylesheet: z.string().nullable(),
  }),
});

const defaultBackupDiagnostics = {
  running: false,
  latestBackupAt: null,
  backupCount: 0,
  intervalMinutes: 0,
  retentionDays: 0,
  lastError: null,
};

const defaultCalendarDiagnostics = {
  configuredFeedCount: 0,
  enabledFeedCount: 0,
  memoryCacheEntries: 0,
  inFlightRefreshes: 0,
  lastPrefetchAttemptAt: null,
  lastPrefetchCompletedAt: null,
};

const readStorageDiagnostics = () => ({
  databaseFileSizeBytes: readFileSizeBytes(config.dbPath),
  databaseLastModifiedAt: readBuiltAt(config.dbPath),
});

const toStatusPayload = (context: ModuleAdapterContext) =>
  serverStatusResponseSchema.parse({
    ok: true,
    service: "hearth-server",
    uptimeSeconds: (Date.now() - processStartedAtMs) / 1000,
    timestamp: new Date().toISOString(),
    processStartedAt: new Date(processStartedAtMs).toISOString(),
    memory: {
      rss: process.memoryUsage().rss,
      heapUsed: process.memoryUsage().heapUsed,
      heapTotal: process.memoryUsage().heapTotal,
    },
    host: {
      hostname: os.hostname(),
      platform: process.platform,
    },
    time: {
      runtimeTimeZone: getRuntimeTimeZone(),
      defaultSiteTimeZone: config.defaultSiteTimeZone,
    },
    diagnostics: {
      backup: context.getBackupDiagnostics?.() ?? defaultBackupDiagnostics,
      calendar: context.getCalendarDiagnostics?.() ?? defaultCalendarDiagnostics,
      storage: readStorageDiagnostics(),
    },
    build: readBuildMetadata(),
  });

export const serverStatusAdapter: ModuleServerAdapter = {
  id: "server-status",
  streamTopics: ["server-status.updates"],
  registerRoutes: (app, context) => {
    app.get("/", async (_request, reply) => {
      return reply.send(toStatusPayload(context));
    });
  },
  start: (context) => {
    if (statusTicker) {
      return;
    }

    statusTicker = setInterval(() => {
      context.eventBus.publish("server-status.updates", toStatusPayload(context));
    }, 15_000);
  },
  stop: () => {
    if (statusTicker) {
      clearInterval(statusTicker);
      statusTicker = null;
    }
  },
  healthCheck: () => ({
    ok: true,
    details: {
      uptimeSeconds: (Date.now() - processStartedAtMs) / 1000,
    },
  }),
};
