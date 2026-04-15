import {
  plannerModuleParamsSchema,
  plannerTodayResponseSchema,
  setPlannerActivityCompletionRequestSchema,
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
          completions: [],
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

  app.put("/modules/homeschool-planner/:instanceId/completions", async (request, reply) => {
    const params = plannerModuleParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: params.error.message });
    }

    const body = setPlannerActivityCompletionRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ message: body.error.message });
    }

    const moduleInstance = services.layoutRepository.findModuleInstance(
      params.data.instanceId,
      "homeschool-planner",
    );
    if (!moduleInstance) {
      return reply.code(404).send({ message: "School planner module instance not found" });
    }

    try {
      const dayWindow = services.settingsRepository.getPlannerDayWindow();
      services.plannerRepository.setActivityCompletion({
        blockId: body.data.blockId,
        date: body.data.date,
        completed: body.data.completed,
        dayWindow,
      });

      services.layoutEventBus.publish({
        type: "planner-updated",
        reason: "activity-completion-updated",
        changedAt: new Date().toISOString(),
        blockId: body.data.blockId,
        date: body.data.date,
      });

      return reply.send(
        plannerTodayResponseSchema.parse(
          services.plannerRepository.getTodayPlan({
            siteDate: body.data.date,
            dayWindow,
          }),
        ),
      );
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : "Failed to update activity",
      });
    }
  });
};
