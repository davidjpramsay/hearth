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

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    });

    const eventBus = services.moduleAdapterService.getEventBus();
    let closed = false;
    let unsubscribe: () => void = () => {};
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    const closeStream = () => {
      if (closed) {
        return;
      }

      closed = true;
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
      unsubscribe();
      if (!reply.raw.writableEnded && !reply.raw.destroyed) {
        reply.raw.end();
      }
    };

    heartbeat = setInterval(() => {
      if (closed || reply.raw.writableEnded || reply.raw.destroyed) {
        closeStream();
        return;
      }

      try {
        reply.raw.write(": heartbeat\n\n");
      } catch {
        closeStream();
      }
    }, 15_000);

    unsubscribe = eventBus.subscribe(parsedQuery.data.topic, (payload) => {
      if (closed || reply.raw.writableEnded || reply.raw.destroyed) {
        closeStream();
        return;
      }

      try {
        reply.raw.write(`data: ${JSON.stringify({ topic: parsedQuery.data.topic, payload })}\n\n`);
      } catch {
        closeStream();
      }
    });

    request.raw.on("close", () => {
      closeStream();
    });

    try {
      reply.raw.write(
        `data: ${JSON.stringify({ topic: parsedQuery.data.topic, payload: { connected: true } })}\n\n`,
      );
    } catch {
      closeStream();
      return;
    }
  });
};
