import { z } from "zod";
import {
  createPlannerTemplateRequestSchema,
  deletePlannerDateAssignmentParamsSchema,
  duplicatePlannerTemplateRequestSchema,
  plannerDashboardResponseSchema,
  plannerDateAssignmentSchema,
  plannerDayWindowConfigSchema,
  plannerIsoDateSchema,
  plannerSummaryArchiveListResponseSchema,
  plannerTemplateDetailSchema,
  plannerTemplateSchema,
  plannerWeekSummaryResponseSchema,
  replacePlannerTemplateBlocksRequestSchema,
  updatePlannerTemplateRequestSchema,
  upsertPlannerDateAssignmentRequestSchema,
  toCalendarDateInTimeZone,
} from "@hearth/shared";
import type { FastifyInstance } from "fastify";
import type { AppServices } from "../types.js";

const numericIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const publishPlannerEvent = (
  services: AppServices,
  payload: Parameters<AppServices["layoutEventBus"]["publish"]>[0],
): void => {
  services.layoutEventBus.publish(payload);
};

const freezeElapsedPlannerDays = (services: AppServices): void => {
  const siteTimezone = services.settingsRepository.getSiteTimeConfig().siteTimezone;
  const siteToday = toCalendarDateInTimeZone(new Date(), siteTimezone);
  const dayWindow = services.settingsRepository.getPlannerDayWindow();
  services.plannerRepository.freezeCompletedWeeksThrough({
    siteDate: siteToday,
    dayWindow,
  });
  services.plannerRepository.freezeElapsedDatesThrough({
    siteDate: siteToday,
    dayWindow,
  });
};

export const registerPlannerRoutes = (app: FastifyInstance, services: AppServices): void => {
  app.get("/planner/dashboard", async (request, reply) => {
    await app.authenticate(request, reply);
    if (reply.sent) {
      return;
    }

    const siteTimezone = services.settingsRepository.getSiteTimeConfig().siteTimezone;
    const siteToday = toCalendarDateInTimeZone(new Date(), siteTimezone);
    return reply.send(
      plannerDashboardResponseSchema.parse(
        services.plannerRepository.getDashboard({
          siteToday,
          dayWindow: services.settingsRepository.getPlannerDayWindow(),
        }),
      ),
    );
  });

  app.get("/planner/summary", async (request, reply) => {
    await app.authenticate(request, reply);
    if (reply.sent) {
      return;
    }

    const siteTimezone = services.settingsRepository.getSiteTimeConfig().siteTimezone;
    const siteToday = toCalendarDateInTimeZone(new Date(), siteTimezone);
    freezeElapsedPlannerDays(services);
    const summary = services.plannerRepository.getLatestWeekSummary({
      siteToday,
      dayWindow: services.settingsRepository.getPlannerDayWindow(),
    });
    await services.plannerSummaryArchiveService.ensurePdfForSummary(summary);
    return reply.send(plannerWeekSummaryResponseSchema.parse(summary));
  });

  app.get("/planner/summary/archives", async (request, reply) => {
    await app.authenticate(request, reply);
    if (reply.sent) {
      return;
    }

    const siteTimezone = services.settingsRepository.getSiteTimeConfig().siteTimezone;
    const siteToday = toCalendarDateInTimeZone(new Date(), siteTimezone);
    const dayWindow = services.settingsRepository.getPlannerDayWindow();
    const archives = services.plannerRepository.freezeCompletedWeeksThrough({
      siteDate: siteToday,
      dayWindow,
    });
    const latestArchive = archives.archives[0];
    if (latestArchive && !latestArchive.pdfAvailable) {
      await services.plannerSummaryArchiveService.ensurePdfForWeekStart(
        latestArchive.weekStartDate,
        dayWindow,
      );
      return reply.send(
        plannerSummaryArchiveListResponseSchema.parse(
          services.plannerRepository.listSummaryArchives(),
        ),
      );
    }

    return reply.send(plannerSummaryArchiveListResponseSchema.parse(archives));
  });

  app.get("/planner/summary/archives/:weekStartDate/pdf", async (request, reply) => {
    await app.authenticate(request, reply);
    if (reply.sent) {
      return;
    }

    const weekStartDate = plannerIsoDateSchema.safeParse(
      (request.params as { weekStartDate?: string } | undefined)?.weekStartDate,
    );
    if (!weekStartDate.success) {
      return reply.code(400).send({ message: weekStartDate.error.message });
    }

    const archive = services.plannerRepository.getSummaryArchive(weekStartDate.data);
    if (!archive) {
      return reply.code(404).send({ message: "School summary archive not found" });
    }

    const pdfBuffer = await services.plannerSummaryArchiveService.readPdf(
      weekStartDate.data,
      services.settingsRepository.getPlannerDayWindow(),
    );
    reply.header("content-type", "application/pdf");
    reply.header(
      "content-disposition",
      `attachment; filename="hearth-school-summary-${archive.weekStartDate}-to-${archive.weekEndDate}.pdf"`,
    );
    return reply.send(pdfBuffer);
  });

  app.get("/planner/day-window", async (request, reply) => {
    await app.authenticate(request, reply);
    if (reply.sent) {
      return;
    }

    return reply.send(
      plannerDayWindowConfigSchema.parse(services.settingsRepository.getPlannerDayWindow()),
    );
  });

  app.put("/planner/day-window", async (request, reply) => {
    await app.authenticate(request, reply);
    if (reply.sent) {
      return;
    }

    const body = plannerDayWindowConfigSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ message: body.error.message });
    }

    const hasOutOfRangeBlocks = services.plannerRepository
      .listTemplateDetails()
      .some((template) =>
        template.blocks.some(
          (block) => block.startTime < body.data.startTime || block.endTime > body.data.endTime,
        ),
      );
    if (hasOutOfRangeBlocks) {
      return reply.code(400).send({
        message:
          "Planner day window cannot hide existing activities. Move or resize those blocks first.",
      });
    }

    services.settingsRepository.setPlannerDayWindow(body.data);
    publishPlannerEvent(services, {
      type: "planner-updated",
      changedAt: new Date().toISOString(),
      reason: "day-window-updated",
    });

    return reply.send(
      plannerDayWindowConfigSchema.parse(services.settingsRepository.getPlannerDayWindow()),
    );
  });

  app.get("/planner/templates", async (request, reply) => {
    await app.authenticate(request, reply);
    if (reply.sent) {
      return;
    }

    return reply.send(
      z.array(plannerTemplateDetailSchema).parse(services.plannerRepository.listTemplateDetails()),
    );
  });

  app.post("/planner/templates", async (request, reply) => {
    await app.authenticate(request, reply);
    if (reply.sent) {
      return;
    }

    const body = createPlannerTemplateRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ message: body.error.message });
    }

    try {
      const created = services.plannerRepository.createTemplate(body.data);
      publishPlannerEvent(services, {
        type: "planner-updated",
        changedAt: new Date().toISOString(),
        reason: "template-created",
        templateId: created.id,
      });

      return reply.code(201).send(plannerTemplateSchema.parse(created));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create planner template";
      return reply.code(400).send({ message });
    }
  });

  app.put("/planner/templates/:id", async (request, reply) => {
    await app.authenticate(request, reply);
    if (reply.sent) {
      return;
    }

    const params = numericIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: params.error.message });
    }

    const body = updatePlannerTemplateRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ message: body.error.message });
    }

    try {
      freezeElapsedPlannerDays(services);
      const updated = services.plannerRepository.updateTemplate(params.data.id, body.data);
      if (!updated) {
        return reply.code(404).send({ message: "Planner template not found" });
      }

      publishPlannerEvent(services, {
        type: "planner-updated",
        changedAt: new Date().toISOString(),
        reason: "template-updated",
        templateId: updated.id,
      });

      return reply.send(plannerTemplateSchema.parse(updated));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update planner template";
      return reply.code(400).send({ message });
    }
  });

  app.post("/planner/templates/:id/duplicate", async (request, reply) => {
    await app.authenticate(request, reply);
    if (reply.sent) {
      return;
    }

    const params = numericIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: params.error.message });
    }

    const body = duplicatePlannerTemplateRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ message: body.error.message });
    }

    freezeElapsedPlannerDays(services);
    const duplicated = services.plannerRepository.duplicateTemplate(params.data.id, body.data);
    if (!duplicated) {
      return reply.code(404).send({ message: "Planner template not found" });
    }

    publishPlannerEvent(services, {
      type: "planner-updated",
      changedAt: new Date().toISOString(),
      reason: "template-duplicated",
      templateId: duplicated.id,
    });

    return reply.code(201).send(plannerTemplateSchema.parse(duplicated));
  });

  app.delete("/planner/templates/:id", async (request, reply) => {
    await app.authenticate(request, reply);
    if (reply.sent) {
      return;
    }

    const params = numericIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: params.error.message });
    }

    freezeElapsedPlannerDays(services);
    const deleted = services.plannerRepository.deleteTemplate(params.data.id);
    if (!deleted) {
      return reply.code(404).send({ message: "Planner template not found" });
    }

    publishPlannerEvent(services, {
      type: "planner-updated",
      changedAt: new Date().toISOString(),
      reason: "template-deleted",
      templateId: params.data.id,
    });

    return reply.code(204).send();
  });

  app.put("/planner/templates/:id/blocks", async (request, reply) => {
    await app.authenticate(request, reply);
    if (reply.sent) {
      return;
    }

    const params = numericIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: params.error.message });
    }

    const body = replacePlannerTemplateBlocksRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ message: body.error.message });
    }

    try {
      freezeElapsedPlannerDays(services);
      const blocks = services.plannerRepository.replaceTemplateBlocks(params.data.id, {
        blocks: body.data.blocks,
        dayWindow: services.settingsRepository.getPlannerDayWindow(),
      });

      publishPlannerEvent(services, {
        type: "planner-updated",
        changedAt: new Date().toISOString(),
        reason: "template-blocks-updated",
        templateId: params.data.id,
      });

      return reply.send(z.array(plannerTemplateDetailSchema.shape.blocks.element).parse(blocks));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update planner blocks";
      if (message === "Planner template not found") {
        return reply.code(404).send({ message });
      }

      return reply.code(400).send({ message });
    }
  });

  app.get("/planner/assignments", async (request, reply) => {
    await app.authenticate(request, reply);
    if (reply.sent) {
      return;
    }

    return reply.send(
      z.array(plannerDateAssignmentSchema).parse(services.plannerRepository.listAssignments()),
    );
  });

  app.put("/planner/assignments", async (request, reply) => {
    await app.authenticate(request, reply);
    if (reply.sent) {
      return;
    }

    const body = upsertPlannerDateAssignmentRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ message: body.error.message });
    }

    try {
      freezeElapsedPlannerDays(services);
      const assignment = services.plannerRepository.upsertAssignment(body.data);
      publishPlannerEvent(services, {
        type: "planner-updated",
        changedAt: new Date().toISOString(),
        reason: "assignment-updated",
        templateId: assignment.templateId,
        date: assignment.date,
      });

      return reply.send(plannerDateAssignmentSchema.parse(assignment));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save planner assignment";
      return reply.code(message === "Planner template not found" ? 404 : 400).send({ message });
    }
  });

  app.delete("/planner/assignments/:date", async (request, reply) => {
    await app.authenticate(request, reply);
    if (reply.sent) {
      return;
    }

    const params = deletePlannerDateAssignmentParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: params.error.message });
    }

    freezeElapsedPlannerDays(services);
    const deleted = services.plannerRepository.deleteAssignment(params.data.date);
    if (!deleted) {
      return reply.code(404).send({ message: "Planner assignment not found" });
    }

    publishPlannerEvent(services, {
      type: "planner-updated",
      changedAt: new Date().toISOString(),
      reason: "assignment-deleted",
      date: params.data.date,
    });

    return reply.code(204).send();
  });
};
