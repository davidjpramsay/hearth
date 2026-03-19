import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { config } from "../../config.js";
import type { ModuleServerAdapter } from "../types.js";

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
  build: z.object({
    serverEntrySha1: z.string().nullable(),
    serverEntryBuiltAt: z.string().nullable(),
    webIndexSha1: z.string().nullable(),
    webIndexBuiltAt: z.string().nullable(),
    webMainScript: z.string().nullable(),
    webMainStylesheet: z.string().nullable(),
  }),
});

const toStatusPayload = () =>
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
    build: readBuildMetadata(),
  });

export const serverStatusAdapter: ModuleServerAdapter = {
  id: "server-status",
  streamTopics: ["server-status.updates"],
  registerRoutes: (app) => {
    app.get("/", async (_request, reply) => {
      return reply.send(toStatusPayload());
    });
  },
  start: ({ eventBus }) => {
    if (statusTicker) {
      return;
    }

    statusTicker = setInterval(() => {
      eventBus.publish("server-status.updates", toStatusPayload());
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
