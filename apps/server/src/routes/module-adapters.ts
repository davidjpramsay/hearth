import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { AppServices } from "../types.js";

const streamQuerySchema = z.object({
  topic: z.string().trim().min(1),
});

export const registerModuleAdapterRoutes = (app: FastifyInstance, services: AppServices): void => {
  app.get("/modules/adapters", async (_request, reply) => {
    const adapters = services.moduleAdapterService.listAdapters().map((adapter) => ({
      id: adapter.id,
      streamTopics: adapter.streamTopics ?? [],
      hasHealthCheck: Boolean(adapter.healthCheck),
    }));

    return reply.send(adapters);
  });

  services.moduleAdapterService.registerAdapterRoutes(app);

  app.get("/modules/stream", async (request, reply) => {
    const parsedQuery = streamQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.code(400).send({ message: parsedQuery.error.message });
    }

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "Cache-Control": "no-cache",
    });

    const eventBus = services.moduleAdapterService.getEventBus();
    const unsubscribe = eventBus.subscribe(parsedQuery.data.topic, (payload) => {
      reply.raw.write(`data: ${JSON.stringify({ topic: parsedQuery.data.topic, payload })}\n\n`);
    });

    const heartbeat = setInterval(() => {
      reply.raw.write(": heartbeat\n\n");
    }, 15_000);

    reply.raw.write(
      `data: ${JSON.stringify({ topic: parsedQuery.data.topic, payload: { connected: true } })}\n\n`,
    );

    request.raw.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
      reply.raw.end();
    });
  });
};
