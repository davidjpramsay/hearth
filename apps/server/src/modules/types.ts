import type { FastifyInstance } from "fastify";
import type { ModuleEventBus } from "./event-bus.js";

export interface ModuleAdapterHealth {
  ok: boolean;
  details?: Record<string, unknown>;
}

export interface ModuleAdapterContext {
  eventBus: ModuleEventBus;
  processStartedAtMs: number;
}

export interface ModuleServerAdapter {
  id: string;
  registerRoutes: (app: FastifyInstance, context: ModuleAdapterContext) => void;
  streamTopics?: string[];
  start?: (context: ModuleAdapterContext) => void | Promise<void>;
  stop?: () => void | Promise<void>;
  healthCheck?: () => ModuleAdapterHealth | Promise<ModuleAdapterHealth>;
}
