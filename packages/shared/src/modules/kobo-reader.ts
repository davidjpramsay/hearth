import { z } from "zod";
import { withModulePresentation } from "./presentation.js";

export const koboReaderModuleConfigSchema = withModulePresentation(
  z.object({
    userName: z.string().trim().min(1).max(64).default("admin"),
    showSpentReading: z.boolean().default(true),
    showRemainingReading: z.boolean().default(true),
  }),
);

export const koboReaderUsersQuerySchema = z.object({});

export const koboReaderCurrentQuerySchema = z.object({
  userName: z.string().trim().min(1).max(64),
});

export const koboReaderCoverParamsSchema = z.object({
  bookId: z.coerce.number().int().positive(),
});

export const koboReaderUserSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
});

export const koboReaderUsersResponseSchema = z.object({
  generatedAt: z.string().datetime({ offset: true }),
  users: z.array(koboReaderUserSchema).default([]),
  warning: z.string().nullable().default(null),
});

export const koboReaderBookSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1),
  authorLabel: z.string().min(1),
  coverImageUrl: z.string().min(1).nullable().default(null),
});

export const koboReaderCurrentResponseSchema = z.object({
  generatedAt: z.string().datetime({ offset: true }),
  userName: z.string().min(1),
  book: koboReaderBookSchema.nullable().default(null),
  progressPercent: z.number().min(0).max(100).nullable().default(null),
  locationType: z.string().nullable().default(null),
  locationValue: z.string().nullable().default(null),
  spentReadingMinutes: z.number().int().nonnegative().nullable().default(null),
  remainingReadingMinutes: z.number().int().nonnegative().nullable().default(null),
  warning: z.string().nullable().default(null),
});

export type KoboReaderModuleConfig = z.infer<typeof koboReaderModuleConfigSchema>;
export type KoboReaderUsersQuery = z.infer<typeof koboReaderUsersQuerySchema>;
export type KoboReaderCurrentQuery = z.infer<typeof koboReaderCurrentQuerySchema>;
export type KoboReaderCoverParams = z.infer<typeof koboReaderCoverParamsSchema>;
export type KoboReaderUser = z.infer<typeof koboReaderUserSchema>;
export type KoboReaderUsersResponse = z.infer<typeof koboReaderUsersResponseSchema>;
export type KoboReaderBook = z.infer<typeof koboReaderBookSchema>;
export type KoboReaderCurrentResponse = z.infer<typeof koboReaderCurrentResponseSchema>;
