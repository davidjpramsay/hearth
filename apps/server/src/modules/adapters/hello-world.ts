import type { ModuleServerAdapter } from "../types.js";

let ticker: NodeJS.Timeout | null = null;

export const helloWorldAdapter: ModuleServerAdapter = {
  id: "hello-world",
  streamTopics: ["hello-world.ticks"],
  registerRoutes: (app) => {
    app.get("/", async (_request, reply) => {
      return reply.send({
        id: "hello-world",
        message: "Hello from Hearth module adapters",
        timestamp: new Date().toISOString(),
      });
    });
  },
  start: ({ eventBus }) => {
    if (ticker) {
      return;
    }

    ticker = setInterval(() => {
      eventBus.publish("hello-world.ticks", {
        message: "Hello stream tick",
        timestamp: new Date().toISOString(),
      });
    }, 10_000);
  },
  stop: () => {
    if (ticker) {
      clearInterval(ticker);
      ticker = null;
    }
  },
  healthCheck: () => ({
    ok: true,
    details: {
      streamActive: ticker !== null,
    },
  }),
};
