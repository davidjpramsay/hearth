import { z } from "zod";
import {
  choreMemberSchema,
  choreRecordSchema,
  choresBoardQuerySchema,
  choresBoardResponseSchema,
  choresPayoutConfigSchema,
  createChoreMemberRequestSchema,
  createChoreRequestSchema,
  setChoreCompletionRequestSchema,
  toCalendarDateInTimeZone,
  updateChoresPayoutConfigRequestSchema,
  updateChoreMemberRequestSchema,
  updateChoreRequestSchema,
} from "@hearth/shared";
import type { FastifyInstance } from "fastify";
import type { AppServices } from "../types.js";

const idParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const publishChoreEvent = (
  services: AppServices,
  payload: Parameters<AppServices["layoutEventBus"]["publish"]>[0],
): void => {
  services.layoutEventBus.publish(payload);
};

export const registerChoresRoutes = (
  app: FastifyInstance,
  services: AppServices,
): void => {
  app.get("/chores/board", async (request, reply) => {
    await app.authenticate(request, reply);
    if (reply.sent) {
      return;
    }

    const query = choresBoardQuerySchema.safeParse(request.query ?? {});
    if (!query.success) {
      return reply.code(400).send({ message: query.error.message });
    }

    const payoutConfig = services.settingsRepository.getChoresPayoutConfig();
    const startDate =
      query.data.startDate ??
      toCalendarDateInTimeZone(new Date(), payoutConfig.siteTimezone);
    const board = services.choresRepository.getBoard({
      startDate,
      days: query.data.days,
      enableMoneyTracking: true,
      payoutConfig,
      siteTimezone: payoutConfig.siteTimezone,
    });

    return reply.send(choresBoardResponseSchema.parse(board));
  });

  app.get("/chores/payout-config", async (request, reply) => {
    await app.authenticate(request, reply);
    if (reply.sent) {
      return;
    }

    const payoutConfig = services.settingsRepository.getChoresPayoutConfig();
    return reply.send(choresPayoutConfigSchema.parse(payoutConfig));
  });

  app.put("/chores/payout-config", async (request, reply) => {
    await app.authenticate(request, reply);
    if (reply.sent) {
      return;
    }

    const body = updateChoresPayoutConfigRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ message: body.error.message });
    }

    services.settingsRepository.setChoresPayoutConfig(body.data);

    publishChoreEvent(services, {
      type: "chores-updated",
      reason: "payout-config-updated",
      changedAt: new Date().toISOString(),
    });

    return reply.send(choresPayoutConfigSchema.parse(body.data));
  });

  app.get("/chores/members", async (request, reply) => {
    await app.authenticate(request, reply);
    if (reply.sent) {
      return;
    }

    const members = services.choresRepository.listMembers();
    return reply.send(z.array(choreMemberSchema).parse(members));
  });

  app.post("/chores/members", async (request, reply) => {
    await app.authenticate(request, reply);
    if (reply.sent) {
      return;
    }

    const body = createChoreMemberRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ message: body.error.message });
    }

    const member = services.choresRepository.createMember({
      name: body.data.name,
      avatarUrl: body.data.avatarUrl ?? null,
      weeklyAllowance: body.data.weeklyAllowance,
    });

    publishChoreEvent(services, {
      type: "chores-updated",
      reason: "member-created",
      changedAt: new Date().toISOString(),
      memberId: member.id,
    });

    return reply.code(201).send(choreMemberSchema.parse(member));
  });

  app.put("/chores/members/:id", async (request, reply) => {
    await app.authenticate(request, reply);
    if (reply.sent) {
      return;
    }

    const params = idParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: params.error.message });
    }

    const body = updateChoreMemberRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ message: body.error.message });
    }

    const updated = services.choresRepository.updateMember(params.data.id, {
      name: body.data.name,
      avatarUrl: body.data.avatarUrl,
      weeklyAllowance: body.data.weeklyAllowance,
    });

    if (!updated) {
      return reply.code(404).send({ message: "Member not found" });
    }

    publishChoreEvent(services, {
      type: "chores-updated",
      reason: "member-updated",
      changedAt: new Date().toISOString(),
      memberId: updated.id,
    });

    return reply.send(choreMemberSchema.parse(updated));
  });

  app.delete("/chores/members/:id", async (request, reply) => {
    await app.authenticate(request, reply);
    if (reply.sent) {
      return;
    }

    const params = idParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: params.error.message });
    }

    const deleted = services.choresRepository.deleteMember(params.data.id);
    if (!deleted) {
      return reply.code(404).send({ message: "Member not found" });
    }

    publishChoreEvent(services, {
      type: "chores-updated",
      reason: "member-deleted",
      changedAt: new Date().toISOString(),
      memberId: params.data.id,
    });

    return reply.code(204).send();
  });

  app.get("/chores/items", async (request, reply) => {
    await app.authenticate(request, reply);
    if (reply.sent) {
      return;
    }

    const payoutConfig = services.settingsRepository.getChoresPayoutConfig();
    const chores = services.choresRepository.listChores(payoutConfig.siteTimezone);
    return reply.send(z.array(choreRecordSchema).parse(chores));
  });

  app.post("/chores/items", async (request, reply) => {
    await app.authenticate(request, reply);
    if (reply.sent) {
      return;
    }

    const body = createChoreRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ message: body.error.message });
    }

    const member = services.choresRepository.getMemberById(body.data.memberId);
    if (!member) {
      return reply.code(404).send({ message: "Member not found" });
    }

    const created = services.choresRepository.createChore({
      name: body.data.name,
      memberId: body.data.memberId,
      schedule: body.data.schedule,
      startsOn: body.data.startsOn,
      valueAmount: body.data.valueAmount ?? null,
      active: body.data.active,
      siteTimezone: services.settingsRepository.getChoresPayoutConfig().siteTimezone,
    });

    publishChoreEvent(services, {
      type: "chores-updated",
      reason: "chore-created",
      changedAt: new Date().toISOString(),
      choreId: created.id,
    });

    return reply.code(201).send(choreRecordSchema.parse(created));
  });

  app.put("/chores/items/:id", async (request, reply) => {
    await app.authenticate(request, reply);
    if (reply.sent) {
      return;
    }

    const params = idParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: params.error.message });
    }

    const body = updateChoreRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ message: body.error.message });
    }

    if (body.data.memberId !== undefined) {
      const member = services.choresRepository.getMemberById(body.data.memberId);
      if (!member) {
        return reply.code(404).send({ message: "Member not found" });
      }
    }

    const updated = services.choresRepository.updateChore(params.data.id, {
      name: body.data.name,
      memberId: body.data.memberId,
      schedule: body.data.schedule,
      startsOn: body.data.startsOn,
      valueAmount: body.data.valueAmount,
      active: body.data.active,
      siteTimezone: services.settingsRepository.getChoresPayoutConfig().siteTimezone,
    });

    if (!updated) {
      return reply.code(404).send({ message: "Chore not found" });
    }

    publishChoreEvent(services, {
      type: "chores-updated",
      reason: "chore-updated",
      changedAt: new Date().toISOString(),
      choreId: updated.id,
    });

    return reply.send(choreRecordSchema.parse(updated));
  });

  app.delete("/chores/items/:id", async (request, reply) => {
    await app.authenticate(request, reply);
    if (reply.sent) {
      return;
    }

    const params = idParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: params.error.message });
    }

    const deleted = services.choresRepository.deleteChore(params.data.id);
    if (!deleted) {
      return reply.code(404).send({ message: "Chore not found" });
    }

    publishChoreEvent(services, {
      type: "chores-updated",
      reason: "chore-deleted",
      changedAt: new Date().toISOString(),
      choreId: params.data.id,
    });

    return reply.code(204).send();
  });

  app.put("/chores/completions", async (request, reply) => {
    await app.authenticate(request, reply);
    if (reply.sent) {
      return;
    }

    const body = setChoreCompletionRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ message: body.error.message });
    }

    const payoutConfig = services.settingsRepository.getChoresPayoutConfig();
    const chore = services.choresRepository.getChoreById(
      body.data.choreId,
      payoutConfig.siteTimezone,
    );
    if (!chore) {
      return reply.code(404).send({ message: "Chore not found" });
    }

    try {
      services.choresRepository.setCompletion(body.data, payoutConfig.siteTimezone);
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : "Failed to update completion",
      });
    }

    publishChoreEvent(services, {
      type: "chores-updated",
      reason: "completion-updated",
      changedAt: new Date().toISOString(),
      choreId: body.data.choreId,
      date: body.data.date,
    });

    return reply.code(204).send();
  });
};
