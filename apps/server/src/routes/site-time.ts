import { siteTimeConfigSchema } from "@hearth/shared";
import type { FastifyInstance } from "fastify";
import type { AppServices } from "../types.js";

export const registerSiteTimeRoutes = (app: FastifyInstance, services: AppServices): void => {
  app.get("/site-time", async (request, reply) => {
    await app.authenticate(request, reply);
    if (reply.sent) {
      return;
    }

    return reply.send(siteTimeConfigSchema.parse(services.settingsRepository.getSiteTimeConfig()));
  });

  app.put("/site-time", async (request, reply) => {
    await app.authenticate(request, reply);
    if (reply.sent) {
      return;
    }

    const body = siteTimeConfigSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ message: body.error.message });
    }

    services.settingsRepository.setSiteTimeConfig(body.data);
    services.layoutEventBus.publish({
      type: "site-time-updated",
      changedAt: new Date().toISOString(),
      siteTimezone: body.data.siteTimezone,
    });

    return reply.send(siteTimeConfigSchema.parse(services.settingsRepository.getSiteTimeConfig()));
  });
};
