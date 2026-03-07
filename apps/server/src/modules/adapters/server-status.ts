import os from "node:os";
import { z } from "zod";
import type { ModuleServerAdapter } from "../types.js";

const processStartedAtMs = Date.now();
let statusTicker: NodeJS.Timeout | null = null;

export const serverStatusResponseSchema = z.object({
  ok: z.boolean(),
  service: z.string(),
  uptimeSeconds: z.number().nonnegative(),
  timestamp: z.string(),
  memory: z.object({
    rss: z.number().nonnegative(),
    heapUsed: z.number().nonnegative(),
    heapTotal: z.number().nonnegative(),
  }),
  host: z.object({
    hostname: z.string(),
    platform: z.string(),
  }),
});

const toStatusPayload = () =>
  serverStatusResponseSchema.parse({
    ok: true,
    service: "hearth-server",
    uptimeSeconds: (Date.now() - processStartedAtMs) / 1000,
    timestamp: new Date().toISOString(),
    memory: {
      rss: process.memoryUsage().rss,
      heapUsed: process.memoryUsage().heapUsed,
      heapTotal: process.memoryUsage().heapTotal,
    },
    host: {
      hostname: os.hostname(),
      platform: process.platform,
    },
  },
  );

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
