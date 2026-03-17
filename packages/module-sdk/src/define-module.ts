import { z, type ZodTypeAny } from "zod";
import type { DefineModuleInput, ModuleDefinition } from "./types.js";

const kebabCaseIdRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const dataSourceSchema = z.object({
  id: z.string().trim().min(1),
  kind: z.enum(["local", "rest", "stream", "adapter", "composite"]),
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  pollMs: z.number().int().positive().optional(),
  topic: z.string().trim().min(1).optional(),
});

const moduleManifestSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .refine((value) => kebabCaseIdRegex.test(value), {
      message: "Module id must be kebab-case (example: server-status)",
    }),
  name: z.string().trim().min(1),
  version: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  icon: z.string().trim().min(1).optional(),
  defaultSize: z.object({
    w: z.number().int().min(1),
    h: z.number().int().min(1),
  }),
  placement: z.enum(["public", "internal"]).optional(),
  timeMode: z.enum(["device-local", "site-local", "source-local"]).optional(),
  categories: z.array(z.string().trim().min(1)).optional(),
  permissions: z.array(z.string().trim().min(1)).optional(),
  dataSources: z.array(dataSourceSchema).optional(),
});

export const defineModule = <
  TSettingsSchema extends ZodTypeAny,
  TDataSchema extends ZodTypeAny | undefined = undefined,
>(
  input: DefineModuleInput<TSettingsSchema, TDataSchema>,
): ModuleDefinition<TSettingsSchema, TDataSchema> => {
  const manifest = moduleManifestSchema.parse(input.manifest);
  if (typeof input.runtime !== "object" || input.runtime === null) {
    throw new Error("Module runtime must be an object.");
  }
  if (typeof input.runtime.Component !== "function") {
    throw new Error(`Module '${manifest.id}' must provide runtime.Component.`);
  }
  if (input.admin?.SettingsPanel && typeof input.admin.SettingsPanel !== "function") {
    throw new Error(`Module '${manifest.id}' admin.SettingsPanel must be a component.`);
  }

  return {
    manifest,
    settingsSchema: input.settingsSchema,
    dataSchema: input.dataSchema,
    admin: input.admin,
    runtime: input.runtime,
  };
};
