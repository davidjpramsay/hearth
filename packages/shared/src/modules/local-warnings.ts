import { z } from "zod";
import { withModulePresentation } from "./presentation.js";

const nullableCoordinateFromUnknown = z.preprocess((input) => {
  if (input === null || input === undefined || input === "") {
    return null;
  }

  if (typeof input === "number") {
    return Number.isFinite(input) ? input : null;
  }

  if (typeof input === "string") {
    const parsed = Number.parseFloat(input);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}, z.number().nullable());

export const localWarningServiceKindSchema = z.enum([
  "emergency-wa",
]);

export const localWarningsModuleConfigSchema = withModulePresentation(
  z.object({
    locationQuery: z.string().trim().max(120).default("Perth, AU"),
    latitude: z.number().min(-90).max(90).nullable().default(null),
    longitude: z.number().min(-180).max(180).nullable().default(null),
    refreshIntervalSeconds: z.number().int().min(60).max(3600).default(300),
  }),
);

export const localWarningsModuleCurrentQuerySchema = z.object({
  locationQuery: z.string().trim().max(120).default("Perth, AU"),
  latitude: nullableCoordinateFromUnknown.pipe(
    z.number().min(-90).max(90).nullable().default(null),
  ),
  longitude: nullableCoordinateFromUnknown.pipe(
    z.number().min(-180).max(180).nullable().default(null),
  ),
});

export const localWarningItemSchema = z.object({
  id: z.string().min(1),
  serviceKind: localWarningServiceKindSchema,
  serviceLabel: z.string().min(1),
  categoryLabel: z.string().nullable().default(null),
  alertLevel: z.string().nullable().default(null),
  headline: z.string().min(1),
  severity: z.string().nullable().default(null),
  urgency: z.string().nullable().default(null),
  eventLabel: z.string().nullable().default(null),
  areaLabels: z.array(z.string().min(1)).default([]),
  detailUrl: z.string().url().nullable().default(null),
});

export const localWarningsModuleCurrentResponseSchema = z.object({
  generatedAt: z.string().datetime({ offset: true }),
  locationLabel: z.string().min(1),
  warnings: z.array(localWarningItemSchema).default([]),
  warning: z.string().nullable().default(null),
});

export type LocalWarningsModuleConfig = z.infer<typeof localWarningsModuleConfigSchema>;
export type LocalWarningsModuleCurrentQuery = z.infer<
  typeof localWarningsModuleCurrentQuerySchema
>;
export type LocalWarningServiceKind = z.infer<typeof localWarningServiceKindSchema>;
export type LocalWarningItem = z.infer<typeof localWarningItemSchema>;
export type LocalWarningsModuleCurrentResponse = z.infer<
  typeof localWarningsModuleCurrentResponseSchema
>;
