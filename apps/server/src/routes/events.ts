import type { FastifyInstance } from "fastify";
import type { AppServices } from "../types.js";

export const registerEventRoutes = (
  app: FastifyInstance,
  services: AppServices,
): void => {
  app.get("/events/layouts", async (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    reply.raw.write("event: ready\ndata: {}\n\n");

    const heartbeat = setInterval(() => {
      if (closed || reply.raw.writableEnded || reply.raw.destroyed) {
        closeStream();
        return;
      }

      try {
        reply.raw.write(": heartbeat\n\n");
      } catch {
        closeStream();
      }
    }, 15000);
    let closed = false;
    let unsubscribe: () => void = () => {};

    const closeStream = () => {
      if (closed) {
        return;
      }

      closed = true;
      clearInterval(heartbeat);
      unsubscribe();
      if (!reply.raw.writableEnded && !reply.raw.destroyed) {
        reply.raw.end();
      }
    };

    unsubscribe = services.layoutEventBus.subscribe((event) => {
      if (closed || reply.raw.writableEnded || reply.raw.destroyed) {
        closeStream();
        return;
      }

      try {
        reply.raw.write(`event: ${event.type}\n`);
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        closeStream();
      }
    });

    request.raw.on("close", () => {
      closeStream();
    });
  });
};
