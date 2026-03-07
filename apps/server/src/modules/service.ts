import type { FastifyInstance } from "fastify";
import { ModuleEventBus } from "./event-bus.js";
import { defaultModuleAdapters } from "./adapters/index.js";
import type { ModuleAdapterContext, ModuleServerAdapter } from "./types.js";

export class ModuleAdapterService {
  private readonly adaptersById = new Map<string, ModuleServerAdapter>();

  constructor(
    private readonly context: ModuleAdapterContext,
    adapters: ModuleServerAdapter[] = defaultModuleAdapters,
  ) {
    for (const adapter of adapters) {
      if (this.adaptersById.has(adapter.id)) {
        throw new Error(`Duplicate module adapter id '${adapter.id}'`);
      }
      this.adaptersById.set(adapter.id, adapter);
    }
  }

  static createDefault(): ModuleAdapterService {
    return new ModuleAdapterService({
      eventBus: new ModuleEventBus(),
      processStartedAtMs: Date.now(),
    });
  }

  listAdapters(): ModuleServerAdapter[] {
    return [...this.adaptersById.values()];
  }

  getEventBus(): ModuleEventBus {
    return this.context.eventBus;
  }

  async start(): Promise<void> {
    for (const adapter of this.adaptersById.values()) {
      await adapter.start?.(this.context);
    }
  }

  async stop(): Promise<void> {
    for (const adapter of this.adaptersById.values()) {
      await adapter.stop?.();
    }
  }

  registerAdapterRoutes(app: FastifyInstance): void {
    for (const adapter of this.adaptersById.values()) {
      app.register(
        async (adapterApp) => {
          adapter.registerRoutes(adapterApp, this.context);

          if (adapter.healthCheck) {
            adapterApp.get("/health", async (_request, reply) => {
              const health = await adapter.healthCheck?.();
              return reply.send({
                id: adapter.id,
                ...health,
              });
            });
          }
        },
        {
          prefix: `/modules/${adapter.id}`,
        },
      );
    }
  }
}
