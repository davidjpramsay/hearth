import type { FastifyInstance } from "fastify";
import type { ModuleEventBus } from "./event-bus.js";

export interface ModuleAdapterHealth {
  ok: boolean;
  details?: Record<string, unknown>;
}

export interface ModuleAdapterContext {
  eventBus: ModuleEventBus;
  processStartedAtMs: number;
  getBackupDiagnostics?: () => {
    running: boolean;
    latestBackupAt: string | null;
    backupCount: number;
    intervalMinutes: number;
    retentionDays: number;
    lastError: string | null;
  };
  getCalendarDiagnostics?: () => {
    configuredFeedCount: number;
    enabledFeedCount: number;
    memoryCacheEntries: number;
    inFlightRefreshes: number;
    lastPrefetchAttemptAt: string | null;
    lastPrefetchCompletedAt: string | null;
  };
}

export interface ModuleServerAdapter {
  id: string;
  registerRoutes: (app: FastifyInstance, context: ModuleAdapterContext) => void;
  streamTopics?: string[];
  start?: (context: ModuleAdapterContext) => void | Promise<void>;
  stop?: () => void | Promise<void>;
  healthCheck?: () => ModuleAdapterHealth | Promise<ModuleAdapterHealth>;
}
