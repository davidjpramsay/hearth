import {
  choresBoardResponseSchema,
  choresModuleConfigSchema,
  choresModuleParamsSchema,
  choresModuleSummaryQuerySchema,
  setChoreCompletionRequestSchema,
} from "@hearth/shared";
import type { FastifyInstance } from "fastify";
import type { AppServices } from "../types.js";

const todayDate = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const registerChoresModuleRoutes = (
  app: FastifyInstance,
  services: AppServices,
): void => {
  app.get("/modules/chores/:instanceId/summary", async (request, reply) => {
    const params = choresModuleParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: params.error.message });
    }

    const query = choresModuleSummaryQuerySchema.safeParse(request.query ?? {});
    if (!query.success) {
      return reply.code(400).send({ message: query.error.message });
    }

    const startDate = query.data.startDate ?? todayDate();
    reply.header("cache-control", "no-store");

    const payoutConfig = services.settingsRepository.getChoresPayoutConfig();
    const moduleInstance = services.layoutRepository.findModuleInstance(
      params.data.instanceId,
      "chores",
    );
    if (!moduleInstance) {
      return reply.send(
        choresBoardResponseSchema.parse({
          generatedAt: new Date().toISOString(),
          startDate,
          days: 1,
          payoutConfig,
          members: [],
          chores: [],
          board: [{ date: startDate, items: [] }],
          stats: {
            dailyCompletionRate: 0,
            weeklyCompletedCount: 0,
            weeklyTotalValue: 0,
            weeklyByMember: [],
          },
        }),
      );
    }

    const parsedConfig = choresModuleConfigSchema.safeParse(moduleInstance.module.config);
    const config = parsedConfig.success ? parsedConfig.data : choresModuleConfigSchema.parse({});
    const days = Math.max(1, config.previewDays + 1);

    const board = services.choresRepository.getBoard({
      startDate,
      days,
      enableMoneyTracking: config.enableMoneyTracking,
      payoutConfig,
    });

    return reply.send(choresBoardResponseSchema.parse(board));
  });

  app.put("/modules/chores/:instanceId/completions", async (request, reply) => {
    const params = choresModuleParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: params.error.message });
    }

    const body = setChoreCompletionRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ message: body.error.message });
    }

    const moduleInstance = services.layoutRepository.findModuleInstance(
      params.data.instanceId,
      "chores",
    );
    if (!moduleInstance) {
      return reply.code(404).send({ message: "Chores module instance not found" });
    }

    const chore = services.choresRepository.getChoreById(body.data.choreId);
    if (!chore) {
      return reply.code(404).send({ message: "Chore not found" });
    }

    try {
      services.choresRepository.setCompletion(body.data);
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : "Failed to update completion",
      });
    }
    services.layoutEventBus.publish({
      type: "chores-updated",
      reason: "completion-updated",
      changedAt: new Date().toISOString(),
      choreId: body.data.choreId,
      date: body.data.date,
    });

    return reply.code(204).send();
  });
};
