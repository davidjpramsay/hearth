import { z } from "zod";
import { withModulePresentation } from "./presentation.js";
import { themeColorSlotValueSchema } from "../theme-palette.js";

export const plannerIsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const plannerTimeSchema = z.string().regex(/^([01]\d|2[0-3]):(00|15|30|45)$/);
export const plannerSlotMinutesSchema = z.union([z.literal(15), z.literal(30), z.literal(60)]);
export const plannerWeekdaySchema = z.number().int().min(0).max(6);
export const plannerRepeatDaysSchema = z.array(plannerWeekdaySchema).max(7).default([]);

export const plannerTimeToMinutes = (value: string): number => {
  const parsed = plannerTimeSchema.parse(value);
  const [hours, minutes] = parsed.split(":").map(Number);
  return hours * 60 + minutes;
};

export const plannerMinutesToTime = (value: number): string => {
  const safeValue = Math.max(0, Math.min(24 * 60 - 15, Math.round(value / 15) * 15));
  const hours = Math.floor(safeValue / 60);
  const minutes = safeValue % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

export const comparePlannerTimes = (left: string, right: string): number =>
  plannerTimeToMinutes(left) - plannerTimeToMinutes(right);

export const buildPlannerTimeSlots = (
  startTime: string,
  endTime: string,
  slotMinutes = 15,
): string[] => {
  const slots: string[] = [];
  const startMinutes = plannerTimeToMinutes(startTime);
  const endMinutes = plannerTimeToMinutes(endTime);
  const safeSlotMinutes = plannerSlotMinutesSchema.parse(slotMinutes);

  for (let current = startMinutes; current < endMinutes; current += safeSlotMinutes) {
    slots.push(plannerMinutesToTime(current));
  }

  return slots;
};

export const plannerDayWindowConfigSchema = z
  .object({
    startTime: plannerTimeSchema.default("08:00"),
    endTime: plannerTimeSchema.default("15:00"),
    slotMinutes: plannerSlotMinutesSchema.default(15),
  })
  .refine((value) => comparePlannerTimes(value.startTime, value.endTime) < 0, {
    message: "Planner day window end must be after start",
    path: ["endTime"],
  });

export const plannerUserSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1).max(80),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const plannerTemplateSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1).max(120),
  repeatDays: plannerRepeatDaysSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

const plannerActivityBlockDraftBaseSchema = z.object({
  userId: z.number().int().positive(),
  name: z.string().trim().min(1).max(120),
  colour: themeColorSlotValueSchema,
  notes: z.string().trim().max(2000).nullable().optional().default(null),
  startTime: plannerTimeSchema,
  endTime: plannerTimeSchema,
});

const plannerActivityBlockCoreSchema = plannerActivityBlockDraftBaseSchema.extend({
  id: z.number().int().positive(),
  templateId: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const plannerActivityBlockDraftSchema = plannerActivityBlockDraftBaseSchema.refine(
  (value) => comparePlannerTimes(value.startTime, value.endTime) < 0,
  {
    message: "Activity end time must be after start time",
    path: ["endTime"],
  },
);

export const plannerActivityBlockSchema = plannerActivityBlockCoreSchema.refine(
  (value) => comparePlannerTimes(value.startTime, value.endTime) < 0,
  {
    message: "Activity end time must be after start time",
    path: ["endTime"],
  },
);

export const plannerTemplateDetailSchema = plannerTemplateSchema.extend({
  blocks: z.array(plannerActivityBlockSchema),
});

export const plannerActivityCompletionSchema = z.object({
  blockId: z.number().int().positive(),
  date: plannerIsoDateSchema,
  completedAt: z.string(),
});

export const plannerDateAssignmentSchema = z.object({
  date: plannerIsoDateSchema,
  templateId: z.number().int().positive(),
  templateName: z.string().trim().min(1).max(120).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const plannerDashboardResponseSchema = z.object({
  siteToday: plannerIsoDateSchema,
  dayWindow: plannerDayWindowConfigSchema,
  users: z.array(plannerUserSchema),
  templates: z.array(plannerTemplateDetailSchema),
  assignments: z.array(plannerDateAssignmentSchema),
});

export const plannerTodayResponseSchema = z.object({
  generatedAt: z.string().datetime({ offset: true }),
  siteDate: plannerIsoDateSchema,
  dayWindow: plannerDayWindowConfigSchema,
  users: z.array(plannerUserSchema),
  template: plannerTemplateSchema.nullable(),
  blocks: z.array(plannerActivityBlockSchema),
  completions: z.array(plannerActivityCompletionSchema),
});

export const plannerWeeklyBlockSummarySchema = plannerActivityBlockCoreSchema.extend({
  completed: z.boolean(),
});

export const plannerWeekDaySummarySchema = z.object({
  date: plannerIsoDateSchema,
  template: plannerTemplateSchema.nullable(),
  blocks: z.array(plannerWeeklyBlockSummarySchema),
});

export const plannerWeekSummaryResponseSchema = z.object({
  generatedAt: z.string().datetime({ offset: true }),
  startDate: plannerIsoDateSchema,
  endDate: plannerIsoDateSchema,
  dayWindow: plannerDayWindowConfigSchema,
  users: z.array(plannerUserSchema),
  days: z.array(plannerWeekDaySummarySchema),
});

export const plannerModuleConfigSchema = withModulePresentation(z.object({}));

export const plannerModuleParamsSchema = z.object({
  instanceId: z.string().trim().min(1),
});

export const createPlannerUserRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const updatePlannerUserRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const createPlannerTemplateRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  repeatDays: plannerRepeatDaysSchema.optional().default([]),
});

export const updatePlannerTemplateRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    repeatDays: plannerRepeatDaysSchema.optional(),
  })
  .refine((value) => value.name !== undefined || value.repeatDays !== undefined, {
    message: "At least one field is required",
  });

export const duplicatePlannerTemplateRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const replacePlannerTemplateBlocksRequestSchema = z.object({
  blocks: z.array(plannerActivityBlockDraftSchema).default([]),
});

export const upsertPlannerDateAssignmentRequestSchema = z.object({
  date: plannerIsoDateSchema,
  templateId: z.number().int().positive(),
});

export const deletePlannerDateAssignmentParamsSchema = z.object({
  date: plannerIsoDateSchema,
});

export const plannerSummaryQuerySchema = z.object({
  startDate: plannerIsoDateSchema.optional(),
  days: z.coerce.number().int().min(1).max(31).default(7),
});

export const setPlannerActivityCompletionRequestSchema = z.object({
  blockId: z.number().int().positive(),
  date: plannerIsoDateSchema,
  completed: z.boolean(),
});

export interface PlannerBlockConflict {
  userId: number;
  startTime: string;
  endTime: string;
  conflictingWithStartTime: string;
  conflictingWithEndTime: string;
}

export const findPlannerBlockConflict = (
  blocks: Array<z.infer<typeof plannerActivityBlockDraftSchema>>,
): PlannerBlockConflict | null => {
  const blocksByUser = new Map<number, Array<z.infer<typeof plannerActivityBlockDraftSchema>>>();

  for (const block of blocks) {
    const parsed = plannerActivityBlockDraftSchema.parse(block);
    const existing = blocksByUser.get(parsed.userId) ?? [];
    existing.push(parsed);
    blocksByUser.set(parsed.userId, existing);
  }

  for (const [userId, userBlocks] of blocksByUser) {
    const sorted = [...userBlocks].sort((left, right) =>
      comparePlannerTimes(left.startTime, right.startTime),
    );

    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      if (comparePlannerTimes(current.startTime, previous.endTime) < 0) {
        return {
          userId,
          startTime: current.startTime,
          endTime: current.endTime,
          conflictingWithStartTime: previous.startTime,
          conflictingWithEndTime: previous.endTime,
        };
      }
    }
  }

  return null;
};

export const plannerBlocksFitDayWindow = (
  blocks: Array<z.infer<typeof plannerActivityBlockDraftSchema>>,
  dayWindow: z.infer<typeof plannerDayWindowConfigSchema>,
): boolean =>
  blocks.every((block) => {
    const parsed = plannerActivityBlockDraftSchema.parse(block);
    return (
      comparePlannerTimes(dayWindow.startTime, parsed.startTime) <= 0 &&
      comparePlannerTimes(parsed.endTime, dayWindow.endTime) <= 0
    );
  });

export const normalizePlannerRepeatDays = (repeatDays: number[]): number[] =>
  Array.from(new Set(plannerRepeatDaysSchema.parse(repeatDays))).sort(
    (left, right) => left - right,
  );

export const plannerDateToDayOfWeek = (siteDate: string): number =>
  new Date(`${plannerIsoDateSchema.parse(siteDate)}T00:00:00.000Z`).getUTCDay();

export const addPlannerUtcDays = (siteDate: string, days: number): string => {
  const date = new Date(`${plannerIsoDateSchema.parse(siteDate)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export const getPlannerWeekStartDate = (siteDate: string): string => {
  const dayOfWeek = plannerDateToDayOfWeek(siteDate);
  const distanceFromMonday = (dayOfWeek + 6) % 7;
  return addPlannerUtcDays(siteDate, -distanceFromMonday);
};

export const getPlannerWeekEndDate = (siteDate: string): string =>
  addPlannerUtcDays(getPlannerWeekStartDate(siteDate), 6);

export const getPreviousPlannerWeekStartDate = (siteDate: string): string =>
  addPlannerUtcDays(getPlannerWeekStartDate(siteDate), -7);

export const plannerSummaryArchiveSchema = z.object({
  weekStartDate: plannerIsoDateSchema,
  weekEndDate: plannerIsoDateSchema,
  generatedAt: z.string().datetime({ offset: true }),
  pdfAvailable: z.boolean(),
});

export const plannerSummaryArchiveListResponseSchema = z.object({
  archives: z.array(plannerSummaryArchiveSchema),
});

export type PlannerDayWindowConfig = z.infer<typeof plannerDayWindowConfigSchema>;
export type PlannerUser = z.infer<typeof plannerUserSchema>;
export type PlannerTemplate = z.infer<typeof plannerTemplateSchema>;
export type PlannerActivityBlock = z.infer<typeof plannerActivityBlockSchema>;
export type PlannerActivityBlockDraft = z.infer<typeof plannerActivityBlockDraftSchema>;
export type PlannerTemplateDetail = z.infer<typeof plannerTemplateDetailSchema>;
export type PlannerActivityCompletion = z.infer<typeof plannerActivityCompletionSchema>;
export type PlannerDateAssignment = z.infer<typeof plannerDateAssignmentSchema>;
export type PlannerDashboardResponse = z.infer<typeof plannerDashboardResponseSchema>;
export type PlannerTodayResponse = z.infer<typeof plannerTodayResponseSchema>;
export type PlannerWeeklyBlockSummary = z.infer<typeof plannerWeeklyBlockSummarySchema>;
export type PlannerWeekDaySummary = z.infer<typeof plannerWeekDaySummarySchema>;
export type PlannerWeekSummaryResponse = z.infer<typeof plannerWeekSummaryResponseSchema>;
export type PlannerSummaryArchive = z.infer<typeof plannerSummaryArchiveSchema>;
export type PlannerSummaryArchiveListResponse = z.infer<
  typeof plannerSummaryArchiveListResponseSchema
>;
export type PlannerModuleConfig = z.infer<typeof plannerModuleConfigSchema>;
export type CreatePlannerUserRequest = z.infer<typeof createPlannerUserRequestSchema>;
export type UpdatePlannerUserRequest = z.infer<typeof updatePlannerUserRequestSchema>;
export type CreatePlannerTemplateRequest = z.infer<typeof createPlannerTemplateRequestSchema>;
export type UpdatePlannerTemplateRequest = z.infer<typeof updatePlannerTemplateRequestSchema>;
export type DuplicatePlannerTemplateRequest = z.infer<typeof duplicatePlannerTemplateRequestSchema>;
export type ReplacePlannerTemplateBlocksRequest = z.infer<
  typeof replacePlannerTemplateBlocksRequestSchema
>;
export type UpsertPlannerDateAssignmentRequest = z.infer<
  typeof upsertPlannerDateAssignmentRequestSchema
>;
export type PlannerSummaryQuery = z.infer<typeof plannerSummaryQuerySchema>;
export type SetPlannerActivityCompletionRequest = z.infer<
  typeof setPlannerActivityCompletionRequestSchema
>;
