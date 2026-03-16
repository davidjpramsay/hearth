import { z } from "zod";

export const LOCAL_WARNING_CANVAS_ACTION_TYPE = "warning.check-local";
export const LOCAL_WARNING_CONDITION_TYPE = "warning.local.active";
export const LOCAL_WARNING_AUTO_LAYOUT_NAME = "__local-warnings-auto__";
export const LOCAL_WARNING_AUTO_LAYOUT_LABEL = "Local Warnings";
export const LOCAL_WARNING_MODULE_ID = "local-warnings";

export const localWarningConditionParamsSchema = z.object({
  locationQuery: z.string().trim().max(120).default("Perth, AU"),
  latitude: z.number().min(-90).max(90).nullable().default(null),
  longitude: z.number().min(-180).max(180).nullable().default(null),
});

export type LocalWarningConditionParams = z.infer<
  typeof localWarningConditionParamsSchema
>;

export const parseLocalWarningConditionParams = (
  input: unknown,
): LocalWarningConditionParams =>
  localWarningConditionParamsSchema.safeParse(input).success
    ? localWarningConditionParamsSchema.parse(input)
    : localWarningConditionParamsSchema.parse({});
