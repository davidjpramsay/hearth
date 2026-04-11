import {
  plannerModuleParamsSchema,
  plannerTodayResponseSchema,
  toCalendarDateInTimeZone,
} from "@hearth/shared";
import type { FastifyInstance } from "fastify";
import type { AppServices } from "../types.js";

export const registerPlannerModuleRoutes = (app: FastifyInstance, services: AppServices): void => {
  app.get("/modules/homeschool-planner/:instanceId/today", async (request, reply) => {
    const params = plannerModuleParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: params.error.message });
    }

    const siteTimezone = services.settingsRepository.getSiteTimeConfig().siteTimezone;
    const siteDate = toCalendarDateInTimeZone(new Date(), siteTimezone);
    const dayWindow = services.settingsRepository.getPlannerDayWindow();
    const moduleInstance = services.layoutRepository.findModuleInstance(
      params.data.instanceId,
      "homeschool-planner",
    );

    reply.header("cache-control", "no-store");

    if (!moduleInstance) {
      return reply.send(
        plannerTodayResponseSchema.parse({
          generatedAt: new Date().toISOString(),
          siteDate,
          dayWindow,
          users: services.plannerRepository.listUsers(),
          template: null,
          blocks: [],
        }),
      );
    }

    return reply.send(
      plannerTodayResponseSchema.parse(
        services.plannerRepository.getTodayPlan({
          siteDate,
          dayWindow,
        }),
      ),
    );
  });
};
