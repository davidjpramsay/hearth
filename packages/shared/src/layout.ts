import { z } from "zod";

export const gridItemSchema = z.object({
  i: z.string().min(1),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().min(1),
  h: z.number().int().min(1),
});

export const moduleInstanceSchema = z.object({
  id: z.string().min(1),
  moduleId: z.string().min(1),
  config: z.record(z.string(), z.unknown()),
});

const layoutTypographySizeSchema = z.number().min(0.5).max(4);
export const layoutTypographyModeSchema = z.enum(["auto", "custom"]);
export const layoutTypographyDensitySchema = z.enum(["compact", "standard", "comfortable"]);
const defaultLayoutTypographyValues = {
  smallRem: 0.75,
  bodyRem: 0.875,
  titleRem: 1.125,
  displayRem: 2.25,
} as const;
const fourRoleLayoutTypographySchema = z
  .object({
    smallRem: layoutTypographySizeSchema.optional(),
    bodyRem: layoutTypographySizeSchema.optional(),
    titleRem: layoutTypographySizeSchema.optional(),
    displayRem: layoutTypographySizeSchema.optional(),
  })
  .partial();
const legacyLayoutTypographySchema = z
  .object({
    labelRem: layoutTypographySizeSchema.optional(),
    metaRem: layoutTypographySizeSchema.optional(),
    bodyRem: layoutTypographySizeSchema.optional(),
    titleRem: layoutTypographySizeSchema.optional(),
    metricRem: layoutTypographySizeSchema.optional(),
    displayRem: layoutTypographySizeSchema.optional(),
  })
  .partial();

export const layoutTypographySchema = z.preprocess(
  (input) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return {};
    }

    const record = input as Record<string, unknown>;
    if ("mode" in record || "density" in record) {
      return record;
    }

    const hasLegacyTypographyKeys =
      "labelRem" in record || "metaRem" in record || "metricRem" in record;
    if (hasLegacyTypographyKeys) {
      const legacy = legacyLayoutTypographySchema.safeParse(record);
      if (!legacy.success) {
        return record;
      }

      return {
        mode: "custom",
        density: "standard",
        smallRem:
          legacy.data.metaRem ??
          (typeof legacy.data.labelRem === "number"
            ? legacy.data.labelRem / 0.9166666667
            : undefined),
        bodyRem: legacy.data.bodyRem,
        titleRem:
          legacy.data.titleRem ??
          (typeof legacy.data.metricRem === "number"
            ? legacy.data.metricRem / 1.1111111111
            : undefined),
        displayRem: legacy.data.displayRem,
      };
    }

    const hasFourRoleTypographyKeys =
      "smallRem" in record || "bodyRem" in record || "titleRem" in record || "displayRem" in record;
    if (hasFourRoleTypographyKeys) {
      const fourRole = fourRoleLayoutTypographySchema.safeParse(record);
      if (!fourRole.success) {
        return record;
      }

      const hasNonDefaultValue =
        (typeof fourRole.data.smallRem === "number" &&
          fourRole.data.smallRem !== defaultLayoutTypographyValues.smallRem) ||
        (typeof fourRole.data.bodyRem === "number" &&
          fourRole.data.bodyRem !== defaultLayoutTypographyValues.bodyRem) ||
        (typeof fourRole.data.titleRem === "number" &&
          fourRole.data.titleRem !== defaultLayoutTypographyValues.titleRem) ||
        (typeof fourRole.data.displayRem === "number" &&
          fourRole.data.displayRem !== defaultLayoutTypographyValues.displayRem);

      return {
        ...record,
        mode: hasNonDefaultValue ? "custom" : "auto",
        density: "standard",
      };
    }

    return record;
  },
  z.object({
    mode: layoutTypographyModeSchema.default("auto"),
    density: layoutTypographyDensitySchema.default("standard"),
    smallRem: layoutTypographySizeSchema.default(defaultLayoutTypographyValues.smallRem),
    bodyRem: layoutTypographySizeSchema.default(defaultLayoutTypographyValues.bodyRem),
    titleRem: layoutTypographySizeSchema.default(defaultLayoutTypographyValues.titleRem),
    displayRem: layoutTypographySizeSchema.default(defaultLayoutTypographyValues.displayRem),
  }),
);

export const layoutConfigSchema = z.object({
  cols: z.number().int().min(1).default(12),
  rows: z.number().int().min(1).default(20),
  rowHeight: z.number().int().min(10).default(30),
  typography: layoutTypographySchema.default({}),
  items: z.array(gridItemSchema).default([]),
  modules: z.array(moduleInstanceSchema).default([]),
});

export const layoutRecordSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  config: layoutConfigSchema,
  active: z.boolean(),
  version: z.number().int().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type GridItem = z.infer<typeof gridItemSchema>;
export type ModuleInstance = z.infer<typeof moduleInstanceSchema>;
export type LayoutTypography = z.infer<typeof layoutTypographySchema>;
export type LayoutConfig = z.infer<typeof layoutConfigSchema>;
export type LayoutRecord = z.infer<typeof layoutRecordSchema>;
