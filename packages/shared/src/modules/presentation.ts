import { z } from "zod";

export const MODULE_PRESENTATION_SCALE_MIN = 0.85;
export const MODULE_PRESENTATION_SCALE_MAX = 1.25;
export const MODULE_PRESENTATION_SCALE_STEP = 0.05;

export const defaultModulePresentationSettings = {
  headingScale: 1,
  primaryScale: 1,
  supportingScale: 1,
} as const;

const modulePresentationScaleSchema = z
  .number()
  .min(MODULE_PRESENTATION_SCALE_MIN)
  .max(MODULE_PRESENTATION_SCALE_MAX);

export const clampModulePresentationScale = (value: number, fallback: number = 1): number => {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  const clamped = Math.max(
    MODULE_PRESENTATION_SCALE_MIN,
    Math.min(MODULE_PRESENTATION_SCALE_MAX, value),
  );
  return Math.round(clamped / MODULE_PRESENTATION_SCALE_STEP) * MODULE_PRESENTATION_SCALE_STEP;
};

export const modulePresentationSettingsSchema = z.object({
  headingScale: modulePresentationScaleSchema.default(
    defaultModulePresentationSettings.headingScale,
  ),
  primaryScale: modulePresentationScaleSchema.default(
    defaultModulePresentationSettings.primaryScale,
  ),
  supportingScale: modulePresentationScaleSchema.default(
    defaultModulePresentationSettings.supportingScale,
  ),
});

export const modulePresentationSettingsField: z.ZodDefault<
  typeof modulePresentationSettingsSchema
> = modulePresentationSettingsSchema.default(defaultModulePresentationSettings);

export const withModulePresentation = <
  TShape extends z.ZodRawShape,
  TUnknownKeys extends z.UnknownKeysParam,
  TCatchall extends z.ZodTypeAny,
>(
  schema: z.ZodObject<TShape, TUnknownKeys, TCatchall>,
) =>
  schema.extend({
    presentation: modulePresentationSettingsField,
  });

export type ModulePresentationSettings = z.infer<typeof modulePresentationSettingsSchema>;
