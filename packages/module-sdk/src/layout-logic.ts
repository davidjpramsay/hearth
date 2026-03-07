import { z } from "zod";

export type LayoutLogicBranchTrigger = "always" | "portrait-photo" | "landscape-photo";
export type LayoutLogicConditionTrigger = Exclude<LayoutLogicBranchTrigger, "always">;

export type LayoutLogicParamValue = string | number | boolean | null;
export type LayoutLogicParams = Record<string, LayoutLogicParamValue>;

export const layoutLogicParamsSchema = z
  .record(
    z.string().trim().min(1).max(64),
    z.union([z.string(), z.number().finite(), z.boolean(), z.null()]),
  )
  .default({});

export interface LayoutLogicRuleSummaryInput {
  layoutName: string;
  cycleSeconds: number;
  actionType?: string | null;
  actionParams?: LayoutLogicParams | null;
  conditionType?: string | null;
  conditionParams?: LayoutLogicParams | null;
}

export interface LayoutLogicContext {
  orientation: "portrait" | "landscape" | null;
}

export interface LayoutLogicResolvedTarget {
  layoutName: string;
  cycleSeconds?: number;
  actionParams?: LayoutLogicParams;
}

export type LayoutLogicParamFieldKind =
  | "text"
  | "number"
  | "boolean"
  | "select";

export interface LayoutLogicParamFieldOption {
  label: string;
  value: string;
}

export interface LayoutLogicParamFieldDefinition {
  key: string;
  label: string;
  kind: LayoutLogicParamFieldKind;
  description?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: LayoutLogicParamFieldOption[];
}

export interface LayoutLogicConditionTypeDefinition {
  id: string;
  label: string;
  description: string;
  trigger: LayoutLogicConditionTrigger;
  paramsSchema?: z.ZodTypeAny;
  paramFields?: LayoutLogicParamFieldDefinition[];
  evaluate?: (context: LayoutLogicContext, params: LayoutLogicParams) => boolean;
}

export interface LayoutLogicCanvasActionTypeDefinition {
  id: string;
  label: string;
  nodeLabel: string;
  description: string;
}

export type LayoutLogicActionFieldKind = "layout-select" | "number";

export interface LayoutLogicActionFieldDefinition {
  key: "layoutName" | "cycleSeconds";
  label: string;
  kind: LayoutLogicActionFieldKind;
  min?: number;
  max?: number;
  step?: number;
}

export interface LayoutLogicRuleActionTypeDefinition {
  id: string;
  label: string;
  description: string;
  fields: LayoutLogicActionFieldDefinition[];
  paramsSchema?: z.ZodTypeAny;
  paramFields?: LayoutLogicParamFieldDefinition[];
  renderSummary: (input: LayoutLogicRuleSummaryInput) => string;
  resolveTargets?: (input: {
    layoutName: string;
    cycleSeconds: number;
    actionParams: LayoutLogicParams;
    context: LayoutLogicContext;
  }) => LayoutLogicResolvedTarget | LayoutLogicResolvedTarget[] | null;
}

export interface LayoutLogicRegistryInput {
  conditions: LayoutLogicConditionTypeDefinition[];
  canvasActions: LayoutLogicCanvasActionTypeDefinition[];
  ruleActions: LayoutLogicRuleActionTypeDefinition[];
}

export interface LayoutLogicRegistry extends LayoutLogicRegistryInput {}

const normalizeId = (value: string): string => value.trim();

const assertUniqueIds = (
  type: string,
  entries: Array<{ id: string }>,
): void => {
  const seen = new Set<string>();
  for (const entry of entries) {
    const id = normalizeId(entry.id);
    if (!id) {
      throw new Error(`${type} id must be a non-empty string.`);
    }
    if (seen.has(id)) {
      throw new Error(`Duplicate ${type} id '${id}'.`);
    }
    seen.add(id);
  }
};

const assertNonEmptyLabel = (type: string, id: string, label: string): void => {
  if (!label.trim()) {
    throw new Error(`${type} '${id}' must define a non-empty label.`);
  }
};

const assertNonEmptyDescription = (
  type: string,
  id: string,
  description: string,
): void => {
  if (!description.trim()) {
    throw new Error(`${type} '${id}' must define a non-empty description.`);
  }
};

const normalizeParamFields = (
  ownerType: string,
  id: string,
  fields: LayoutLogicParamFieldDefinition[] | undefined,
): LayoutLogicParamFieldDefinition[] => {
  const normalized = (fields ?? []).map((field) => {
    const key = field.key.trim();
    if (!key) {
      throw new Error(`${ownerType} '${id}' has a param field with an empty key.`);
    }
    if (!field.label.trim()) {
      throw new Error(
        `${ownerType} '${id}' param field '${key}' must define a non-empty label.`,
      );
    }

    const normalizedField: LayoutLogicParamFieldDefinition = {
      ...field,
      key,
      label: field.label.trim(),
      description: field.description?.trim(),
    };

    if (normalizedField.kind === "select") {
      const options = normalizedField.options ?? [];
      if (options.length === 0) {
        throw new Error(
          `${ownerType} '${id}' param field '${key}' is select but has no options.`,
        );
      }

      normalizedField.options = options.map((option) => {
        if (!option.label.trim()) {
          throw new Error(
            `${ownerType} '${id}' param field '${key}' has an empty option label.`,
          );
        }
        if (!option.value.trim()) {
          throw new Error(
            `${ownerType} '${id}' param field '${key}' has an empty option value.`,
          );
        }
        return {
          label: option.label.trim(),
          value: option.value.trim(),
        };
      });
    }

    return normalizedField;
  });

  const seen = new Set<string>();
  for (const field of normalized) {
    if (seen.has(field.key)) {
      throw new Error(
        `${ownerType} '${id}' defines duplicate param field key '${field.key}'.`,
      );
    }
    seen.add(field.key);
  }

  return normalized;
};

const normalizeParamsSchema = (
  ownerType: string,
  id: string,
  schema: z.ZodTypeAny | undefined,
): z.ZodTypeAny | undefined => {
  if (!schema) {
    return undefined;
  }

  const defaults = schema.safeParse({});
  if (!defaults.success) {
    throw new Error(
      `${ownerType} '${id}' paramsSchema must accept empty input or define defaults.`,
    );
  }

  if (!defaults.data || typeof defaults.data !== "object" || Array.isArray(defaults.data)) {
    throw new Error(`${ownerType} '${id}' paramsSchema must parse to an object.`);
  }

  return schema;
};

const normalizeCondition = (
  input: LayoutLogicConditionTypeDefinition,
): LayoutLogicConditionTypeDefinition => {
  const id = normalizeId(input.id);
  assertNonEmptyLabel("Condition", id, input.label);
  assertNonEmptyDescription("Condition", id, input.description);
  const paramFields = normalizeParamFields("Condition", id, input.paramFields);
  const paramsSchema = normalizeParamsSchema("Condition", id, input.paramsSchema);

  return {
    ...input,
    id,
    label: input.label.trim(),
    description: input.description.trim(),
    paramFields,
    paramsSchema,
  };
};

const normalizeCanvasAction = (
  input: LayoutLogicCanvasActionTypeDefinition,
): LayoutLogicCanvasActionTypeDefinition => {
  const id = normalizeId(input.id);
  assertNonEmptyLabel("Canvas action", id, input.label);
  assertNonEmptyDescription("Canvas action", id, input.description);
  if (!input.nodeLabel.trim()) {
    throw new Error(`Canvas action '${id}' must define a non-empty nodeLabel.`);
  }
  return {
    ...input,
    id,
    label: input.label.trim(),
    nodeLabel: input.nodeLabel.trim(),
    description: input.description.trim(),
  };
};

const normalizeRuleAction = (
  input: LayoutLogicRuleActionTypeDefinition,
): LayoutLogicRuleActionTypeDefinition => {
  const id = normalizeId(input.id);
  assertNonEmptyLabel("Rule action", id, input.label);
  assertNonEmptyDescription("Rule action", id, input.description);
  if (typeof input.renderSummary !== "function") {
    throw new Error(`Rule action '${id}' must provide a renderSummary function.`);
  }
  const paramFields = normalizeParamFields("Rule action", id, input.paramFields);
  const paramsSchema = normalizeParamsSchema("Rule action", id, input.paramsSchema);

  return {
    ...input,
    id,
    label: input.label.trim(),
    description: input.description.trim(),
    paramFields,
    paramsSchema,
  };
};

export const createLayoutLogicRegistry = (
  input: LayoutLogicRegistryInput,
): LayoutLogicRegistry => {
  const conditions = input.conditions.map(normalizeCondition);
  const canvasActions = input.canvasActions.map(normalizeCanvasAction);
  const ruleActions = input.ruleActions.map(normalizeRuleAction);

  if (conditions.length === 0) {
    throw new Error("Layout logic registry must include at least one condition.");
  }
  if (canvasActions.length === 0) {
    throw new Error("Layout logic registry must include at least one canvas action.");
  }
  if (ruleActions.length === 0) {
    throw new Error("Layout logic registry must include at least one rule action.");
  }

  assertUniqueIds("condition", conditions);
  assertUniqueIds("canvas action", canvasActions);
  assertUniqueIds("rule action", ruleActions);

  return {
    conditions,
    canvasActions,
    ruleActions,
  };
};
