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
    if (
      "smallRem" in record ||
      "bodyRem" in record ||
      "titleRem" in record ||
      "displayRem" in record
    ) {
      return record;
    }

    const legacy = legacyLayoutTypographySchema.safeParse(record);
    if (!legacy.success) {
      return record;
    }

    return {
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
  },
  z.object({
    smallRem: layoutTypographySizeSchema.default(0.75),
    bodyRem: layoutTypographySizeSchema.default(0.875),
    titleRem: layoutTypographySizeSchema.default(1.125),
    displayRem: layoutTypographySizeSchema.default(2.25),
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
