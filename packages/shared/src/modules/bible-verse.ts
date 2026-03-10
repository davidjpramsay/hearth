import { z } from "zod";
import { withModulePresentation } from "./presentation.js";

export const bibleVerseModuleConfigSchema = withModulePresentation(
  z.object({
    refreshIntervalSeconds: z.number().int().min(300).max(86_400).default(21_600),
    showReference: z.boolean().default(true),
    showSource: z.boolean().default(false),
  }),
);

export const bibleVerseModuleResponseSchema = z.object({
  generatedAt: z.string().datetime({ offset: true }),
  verse: z.string().min(1).nullable(),
  reference: z.string().min(1).nullable(),
  sourceLabel: z.string().min(1),
  warning: z.string().nullable().default(null),
});

export const bibleVerseModuleParamsSchema = z.object({
  instanceId: z.string().min(1),
});

export type BibleVerseModuleConfig = z.infer<typeof bibleVerseModuleConfigSchema>;
export type BibleVerseModuleResponse = z.infer<typeof bibleVerseModuleResponseSchema>;
export type BibleVerseModuleParams = z.infer<typeof bibleVerseModuleParamsSchema>;
