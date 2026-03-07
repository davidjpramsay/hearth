import type { z, ZodTypeAny } from "zod";
import type { ModuleDefinition } from "./types.js";

export const validateSettings = <
  TSettingsSchema extends ZodTypeAny,
  TDataSchema extends ZodTypeAny | undefined,
>(
  definition: ModuleDefinition<TSettingsSchema, TDataSchema>,
  input: unknown,
): z.infer<TSettingsSchema> => definition.settingsSchema.parse(input);

export const validateData = <
  TSettingsSchema extends ZodTypeAny,
  TDataSchema extends ZodTypeAny | undefined,
>(
  definition: ModuleDefinition<TSettingsSchema, TDataSchema>,
  input: unknown,
): TDataSchema extends ZodTypeAny ? z.infer<TDataSchema> : unknown => {
  if (!definition.dataSchema) {
    return input as TDataSchema extends ZodTypeAny ? z.infer<TDataSchema> : unknown;
  }

  return definition.dataSchema.parse(input) as TDataSchema extends ZodTypeAny
    ? z.infer<TDataSchema>
    : unknown;
};
