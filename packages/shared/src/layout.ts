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

export const layoutConfigSchema = z.object({
  cols: z.number().int().min(1).default(12),
  rows: z.number().int().min(1).default(20),
  rowHeight: z.number().int().min(10).default(30),
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
export type LayoutConfig = z.infer<typeof layoutConfigSchema>;
export type LayoutRecord = z.infer<typeof layoutRecordSchema>;
