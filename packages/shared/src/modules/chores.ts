import { z } from "zod";
import { ianaTimeZoneSchema } from "../time.js";
import { withModulePresentation } from "./presentation.js";

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const dayOfWeekSchema = z.number().int().min(0).max(6);
export const chorePayoutModeSchema = z.enum(["all-or-nothing", "proportional"]);

export const choresPayoutConfigSchema = z.object({
  mode: chorePayoutModeSchema.default("all-or-nothing"),
  oneOffBonusEnabled: z.boolean().default(true),
  paydayDayOfWeek: dayOfWeekSchema.default(6),
  siteTimezone: ianaTimeZoneSchema.default("UTC"),
});

export const choreScheduleSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("one-off"),
    date: isoDateSchema,
  }),
  z.object({
    type: z.literal("daily"),
  }),
  z.object({
    type: z.literal("weekly"),
    dayOfWeek: dayOfWeekSchema,
  }),
  z.object({
    type: z.literal("specific-days"),
    days: z.array(dayOfWeekSchema).min(1),
  }),
]);

export const choresModuleConfigSchema = withModulePresentation(
  z.object({
    enableMoneyTracking: z.boolean().default(true),
    showStats: z.boolean().default(true),
  }),
);

export const choreMemberSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  avatarUrl: z.string().nullable(),
  weeklyAllowance: z.number().min(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const choreRecordSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  memberId: z.number().int().positive(),
  schedule: choreScheduleSchema,
  startsOn: isoDateSchema,
  valueAmount: z.number().nullable(),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const choreCompletionSchema = z.object({
  id: z.number().int().positive(),
  choreId: z.number().int().positive(),
  date: isoDateSchema,
  valueAmount: z.number().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const choreBoardItemSchema = z.object({
  date: isoDateSchema,
  choreId: z.number().int().positive(),
  choreName: z.string().min(1),
  memberId: z.number().int().positive(),
  memberName: z.string().min(1),
  memberAvatarUrl: z.string().nullable(),
  schedule: choreScheduleSchema,
  valueAmount: z.number().nullable(),
  completed: z.boolean(),
});

export const choreBoardDaySchema = z.object({
  date: isoDateSchema,
  items: z.array(choreBoardItemSchema),
});

export const choreWeeklyMemberTotalSchema = z.object({
  memberId: z.number().int().positive(),
  memberName: z.string().min(1),
  memberAvatarUrl: z.string().nullable(),
  completedCount: z.number().int().min(0),
  totalValue: z.number().min(0),
  recurringScheduledCount: z.number().int().min(0),
  recurringCompletedCount: z.number().int().min(0),
  completionRatio: z.number().min(0).max(1),
  baseAllowance: z.number().min(0),
  basePayout: z.number().min(0),
  bonusPayout: z.number().min(0),
  payoutTotal: z.number().min(0),
});

export const choresStatsSchema = z.object({
  dailyCompletionRate: z.number().min(0).max(1),
  weeklyCompletedCount: z.number().int().min(0),
  weeklyTotalValue: z.number().min(0),
  weeklyByMember: z.array(choreWeeklyMemberTotalSchema),
});

export const choresBoardResponseSchema = z.object({
  generatedAt: z.string().datetime({ offset: true }),
  startDate: isoDateSchema,
  days: z.number().int().min(1),
  payoutConfig: choresPayoutConfigSchema,
  members: z.array(choreMemberSchema),
  chores: z.array(choreRecordSchema),
  board: z.array(choreBoardDaySchema),
  stats: choresStatsSchema,
});

export const choresBoardQuerySchema = z.object({
  startDate: isoDateSchema.optional(),
  days: z.coerce.number().int().min(1).max(31).default(7),
});

export const choresModuleSummaryQuerySchema = z.object({
  startDate: isoDateSchema.optional(),
});

export const createChoreMemberRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
  avatarUrl: z.string().trim().max(2048).nullable().optional(),
  weeklyAllowance: z.number().min(0).optional().default(0),
});

export const updateChoreMemberRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    avatarUrl: z.string().trim().max(2048).nullable().optional(),
    weeklyAllowance: z.number().min(0).optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.avatarUrl !== undefined ||
      value.weeklyAllowance !== undefined,
    {
      message: "At least one field is required",
    },
  );

export const createChoreRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  memberId: z.number().int().positive(),
  schedule: choreScheduleSchema,
  startsOn: isoDateSchema.optional(),
  valueAmount: z.number().min(0).nullable().optional(),
  active: z.boolean().optional().default(true),
});

export const updateChoreRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    memberId: z.number().int().positive().optional(),
    schedule: choreScheduleSchema.optional(),
    startsOn: isoDateSchema.optional(),
    valueAmount: z.number().min(0).nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.memberId !== undefined ||
      value.schedule !== undefined ||
      value.startsOn !== undefined ||
      value.valueAmount !== undefined ||
      value.active !== undefined,
    {
      message: "At least one field is required",
    },
  );

export const setChoreCompletionRequestSchema = z.object({
  choreId: z.number().int().positive(),
  date: isoDateSchema,
  completed: z.boolean(),
});

export const updateChoresPayoutConfigRequestSchema = choresPayoutConfigSchema;

export const choresModuleParamsSchema = z.object({
  instanceId: z.string().min(1),
});

export type ChoreSchedule = z.infer<typeof choreScheduleSchema>;
export type ChorePayoutMode = z.infer<typeof chorePayoutModeSchema>;
export type ChoresPayoutConfig = z.infer<typeof choresPayoutConfigSchema>;
export type ChoresModuleConfig = z.infer<typeof choresModuleConfigSchema>;
export type ChoreMember = z.infer<typeof choreMemberSchema>;
export type ChoreRecord = z.infer<typeof choreRecordSchema>;
export type ChoreCompletion = z.infer<typeof choreCompletionSchema>;
export type ChoreBoardItem = z.infer<typeof choreBoardItemSchema>;
export type ChoreBoardDay = z.infer<typeof choreBoardDaySchema>;
export type ChoresStats = z.infer<typeof choresStatsSchema>;
export type ChoresBoardResponse = z.infer<typeof choresBoardResponseSchema>;
export type ChoresBoardQuery = z.infer<typeof choresBoardQuerySchema>;
export type ChoresModuleSummaryQuery = z.infer<typeof choresModuleSummaryQuerySchema>;
export type CreateChoreMemberRequest = z.infer<typeof createChoreMemberRequestSchema>;
export type UpdateChoreMemberRequest = z.infer<typeof updateChoreMemberRequestSchema>;
export type CreateChoreRequest = z.infer<typeof createChoreRequestSchema>;
export type UpdateChoreRequest = z.infer<typeof updateChoreRequestSchema>;
export type SetChoreCompletionRequest = z.infer<typeof setChoreCompletionRequestSchema>;
export type UpdateChoresPayoutConfigRequest = z.infer<typeof updateChoresPayoutConfigRequestSchema>;
