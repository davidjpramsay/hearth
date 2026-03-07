import {
  calendarModuleConfigSchema,
  calendarModuleEventsResponseSchema,
  calendarModuleParamsSchema,
} from "@hearth/shared";
import type { FastifyInstance } from "fastify";
import type { AppServices } from "../types.js";

export const registerCalendarRoutes = (
  app: FastifyInstance,
  services: AppServices,
): void => {
  app.get("/modules/calendar/:instanceId/events", async (request, reply) => {
    const params = calendarModuleParamsSchema.safeParse(request.params);

    if (!params.success) {
      return reply.code(400).send({ message: params.error.message });
    }

    const calendarInstanceMatch = services.layoutRepository.findModuleInstance(
      params.data.instanceId,
      "calendar",
    );

    if (!calendarInstanceMatch) {
      return reply.code(404).send({ message: "Calendar module instance not found" });
    }

    const parsedConfig = calendarModuleConfigSchema.safeParse(
      calendarInstanceMatch.module.config,
    );
    const normalizedConfig = parsedConfig.success
      ? parsedConfig.data
      : calendarModuleConfigSchema.parse({});

    const calendarData =
      await services.calendarFeedService.getUpcomingEvents(normalizedConfig);

    return reply.send(calendarModuleEventsResponseSchema.parse(calendarData));
  });
};
