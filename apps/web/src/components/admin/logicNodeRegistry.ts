import {
  createLayoutLogicRegistry,
  layoutLogicParamsSchema,
  type LayoutLogicContext,
  type LayoutLogicBranchTrigger,
  type LayoutLogicCanvasActionTypeDefinition,
  type LayoutLogicConditionTypeDefinition,
  type LayoutLogicRuleSummaryInput,
  type LayoutLogicParamFieldDefinition,
  type LayoutLogicParams,
  type LayoutLogicResolvedTarget,
  type LayoutLogicRuleActionTypeDefinition,
} from "@hearth/module-sdk";
import {
  BUILTIN_LAYOUT_LOGIC_CANVAS_ACTIONS,
  BUILTIN_LAYOUT_LOGIC_CONDITIONS,
  BUILTIN_LAYOUT_LOGIC_RULE_ACTIONS,
  DEFAULT_LANDSCAPE_LAYOUT_LOGIC_CONDITION_TYPE,
  DEFAULT_LAYOUT_LOGIC_ACTION_TYPE,
  DEFAULT_LAYOUT_LOGIC_PHOTO_ACTION_TYPE,
  DEFAULT_PORTRAIT_LAYOUT_LOGIC_CONDITION_TYPE,
  getDefaultLayoutLogicConditionTypeForTrigger,
  LOCAL_WARNING_CANVAS_ACTION_TYPE,
  LOCAL_WARNING_CONDITION_TYPE,
  localWarningConditionParamsSchema,
  renderBuiltinLayoutLogicRuleSummary,
  resolveBuiltinLayoutLogicAction,
  type LayoutLogicResolvedTarget as SharedLayoutLogicResolvedTarget,
  type AutoLayoutTarget,
} from "@hearth/shared";

export type LogicBranchTrigger = LayoutLogicBranchTrigger;
export type LogicConditionTypeDefinition = LayoutLogicConditionTypeDefinition;
export type LogicCanvasActionTypeDefinition = LayoutLogicCanvasActionTypeDefinition;
export type LogicActionTypeDefinition = LayoutLogicRuleActionTypeDefinition;
export type LogicActionFieldDefinition = LogicActionTypeDefinition["fields"][number];
export type LogicParamFieldDefinition = LayoutLogicParamFieldDefinition;
export type LogicParams = LayoutLogicParams;

const toSafeSeconds = (value: number | null | undefined): number => {
  if (!Number.isFinite(value)) {
    return 20;
  }
  return Math.max(3, Math.min(3600, Math.round(value ?? 20)));
};

const normalizeLogicParams = (input: unknown): LogicParams => {
  const parsed = layoutLogicParamsSchema.safeParse(input);
  if (parsed.success) {
    return parsed.data;
  }
  return layoutLogicParamsSchema.parse({});
};

const parseLogicParams = (
  schema: LogicActionTypeDefinition["paramsSchema"] | LogicConditionTypeDefinition["paramsSchema"],
  value: unknown,
): LogicParams => {
  if (!schema) {
    return normalizeLogicParams(value);
  }

  const parsed = schema.safeParse(value);
  if (parsed.success) {
    return normalizeLogicParams(parsed.data);
  }

  const defaults = schema.safeParse({});
  if (defaults.success) {
    return normalizeLogicParams(defaults.data);
  }

  return layoutLogicParamsSchema.parse({});
};

const DEFAULT_RULE_ACTION_FIELDS: LayoutLogicRuleActionTypeDefinition["fields"] = [
  {
    key: "layoutName",
    label: "Layout",
    kind: "layout-select",
  },
  {
    key: "cycleSeconds",
    label: "Show (sec)",
    kind: "number",
    min: 3,
    max: 3600,
    step: 1,
  },
];

const customConditionTypes: LayoutLogicConditionTypeDefinition[] = [
  {
    id: LOCAL_WARNING_CONDITION_TYPE,
    label: "Local warning is active",
    description: "Match when Emergency WA reports an active local warning for the chosen place.",
    trigger: "portrait-photo",
    paramsSchema: localWarningConditionParamsSchema,
    paramFields: [
      {
        key: "locationQuery",
        label: "Location",
        kind: "location-search",
        placeholder: "Perth, AU",
        latitudeKey: "latitude",
        longitudeKey: "longitude",
        searchPath: "/api/modules/weather/locations",
        allowDeviceLocation: true,
      },
    ],
  },
];
const customCanvasActionTypes: LayoutLogicCanvasActionTypeDefinition[] = [
  {
    id: LOCAL_WARNING_CANVAS_ACTION_TYPE,
    label: "Check local warnings",
    nodeLabel: "Local warning check",
    description:
      "Checks Emergency WA local warnings, then shows the automatic warning layout when active.",
  },
];
const customRuleActionTypes: LayoutLogicRuleActionTypeDefinition[] = [];

const toSdkResolvedTarget = (
  target: SharedLayoutLogicResolvedTarget,
): LayoutLogicResolvedTarget => ({
  layoutName: target.layoutName,
  cycleSeconds: toSafeSeconds(target.cycleSeconds),
  actionParams: normalizeLogicParams(target.actionParams),
});

// Add custom actions/conditions in the custom arrays above. Built-in ids come from @hearth/shared.
const layoutLogicRegistry = createLayoutLogicRegistry({
  conditions: [
    ...BUILTIN_LAYOUT_LOGIC_CONDITIONS.map(
      (condition): LayoutLogicConditionTypeDefinition => ({
        id: condition.id,
        label: condition.label,
        description: condition.description,
        trigger: condition.trigger,
        evaluate: (context: LayoutLogicContext, params: LayoutLogicParams) =>
          condition.evaluate({
            conditionType: condition.id,
            conditionParams: params,
            trigger: condition.trigger,
            orientation: context.orientation,
          }) ?? false,
      }),
    ),
    ...customConditionTypes,
  ],
  canvasActions: [
    ...BUILTIN_LAYOUT_LOGIC_CANVAS_ACTIONS.map((action) => ({
      ...action,
    })),
    ...customCanvasActionTypes,
  ],
  ruleActions: [
    ...BUILTIN_LAYOUT_LOGIC_RULE_ACTIONS.map(
      (action): LayoutLogicRuleActionTypeDefinition => ({
        id: action.id,
        label: action.label,
        description: action.description,
        fields: DEFAULT_RULE_ACTION_FIELDS,
        renderSummary: (rule: LayoutLogicRuleSummaryInput) =>
          renderBuiltinLayoutLogicRuleSummary({
            actionType: action.id,
            layoutName: rule.layoutName,
            cycleSeconds: toSafeSeconds(rule.cycleSeconds),
          }),
        resolveTargets: ({ layoutName, cycleSeconds, actionParams, context }) => {
          const resolved = resolveBuiltinLayoutLogicAction({
            actionType: action.id,
            actionParams,
            layoutName,
            cycleSeconds: toSafeSeconds(cycleSeconds),
            orientation: context.orientation,
          });
          if (Array.isArray(resolved)) {
            return resolved.map(toSdkResolvedTarget);
          }
          return resolved ? toSdkResolvedTarget(resolved) : null;
        },
      }),
    ),
    ...customRuleActionTypes,
  ],
});

export const LOGIC_CONDITION_TYPES: LogicConditionTypeDefinition[] = layoutLogicRegistry.conditions;
export const LOGIC_CANVAS_ACTION_TYPES: LogicCanvasActionTypeDefinition[] =
  layoutLogicRegistry.canvasActions;
export const LOGIC_ACTION_TYPES: LogicActionTypeDefinition[] = layoutLogicRegistry.ruleActions;

const DEFAULT_ACTION_TYPE = LOGIC_ACTION_TYPES[0]?.id ?? DEFAULT_LAYOUT_LOGIC_ACTION_TYPE;
const DEFAULT_CANVAS_ACTION_TYPE =
  LOGIC_CANVAS_ACTION_TYPES[0]?.id ?? DEFAULT_LAYOUT_LOGIC_PHOTO_ACTION_TYPE;
const DEFAULT_CONDITION_PORTRAIT =
  LOGIC_CONDITION_TYPES[0]?.id ?? DEFAULT_PORTRAIT_LAYOUT_LOGIC_CONDITION_TYPE;
const DEFAULT_CONDITION_LANDSCAPE =
  LOGIC_CONDITION_TYPES[1]?.id ?? DEFAULT_LANDSCAPE_LAYOUT_LOGIC_CONDITION_TYPE;

export const getDefaultConditionTypeForTrigger = (trigger: LogicBranchTrigger): string | null => {
  if (trigger === "always") {
    return null;
  }
  const fromRegistry = getDefaultLayoutLogicConditionTypeForTrigger(trigger);
  if (trigger === "portrait-photo") {
    return fromRegistry || DEFAULT_CONDITION_PORTRAIT;
  }
  if (trigger === "landscape-photo") {
    return fromRegistry || DEFAULT_CONDITION_LANDSCAPE;
  }
  return fromRegistry;
};

export const getDefaultActionTypeId = (): string => DEFAULT_ACTION_TYPE;
export const getDefaultCanvasActionTypeId = (): string => DEFAULT_CANVAS_ACTION_TYPE;
export const getDefaultConditionParamsForTrigger = (
  trigger: Exclude<LogicBranchTrigger, "always">,
): LogicParams => parseConditionParamsByType(getDefaultConditionTypeForTrigger(trigger), {});

export const getConditionTypeById = (
  id: string | null | undefined,
): LogicConditionTypeDefinition | null =>
  LOGIC_CONDITION_TYPES.find((entry) => entry.id === id) ?? null;

export const getCanvasActionTypeById = (
  id: string | null | undefined,
): LogicCanvasActionTypeDefinition =>
  LOGIC_CANVAS_ACTION_TYPES.find((entry) => entry.id === id) ?? LOGIC_CANVAS_ACTION_TYPES[0];

export const getActionTypeById = (id: string | null | undefined): LogicActionTypeDefinition =>
  LOGIC_ACTION_TYPES.find((entry) => entry.id === id) ?? LOGIC_ACTION_TYPES[0];

export const parseActionParamsByType = (
  actionTypeId: string | null | undefined,
  params: unknown,
): LogicParams => {
  const action = getActionTypeById(actionTypeId);
  return parseLogicParams(action.paramsSchema, params);
};

export const parseConditionParamsByType = (
  conditionTypeId: string | null | undefined,
  params: unknown,
): LogicParams => {
  const condition = getConditionTypeById(conditionTypeId);
  return parseLogicParams(condition?.paramsSchema, params);
};

export const getDefaultActionParams = (actionTypeId: string | null | undefined): LogicParams =>
  parseActionParamsByType(actionTypeId, {});

export const getDefaultConditionParams = (
  conditionTypeId: string | null | undefined,
): LogicParams => parseConditionParamsByType(conditionTypeId, {});

export const resolveRuleActionTargets = (input: {
  rule: AutoLayoutTarget;
  orientation: "portrait" | "landscape" | null;
}): Array<{ layoutName: string; cycleSeconds: number }> => {
  const action = getActionTypeById(input.rule.actionType);
  const actionParams = parseActionParamsByType(input.rule.actionType, input.rule.actionParams);
  const resolved = action.resolveTargets?.({
    layoutName: input.rule.layoutName,
    cycleSeconds: toSafeSeconds(input.rule.cycleSeconds),
    actionParams,
    context: {
      orientation: input.orientation,
    },
  });

  const baseTargets = Array.isArray(resolved)
    ? resolved
    : resolved
      ? [resolved]
      : [
          {
            layoutName: input.rule.layoutName,
            cycleSeconds: toSafeSeconds(input.rule.cycleSeconds),
          },
        ];

  return baseTargets
    .map((target) => ({
      layoutName: target.layoutName.trim(),
      cycleSeconds: toSafeSeconds(target.cycleSeconds),
    }))
    .filter((target) => target.layoutName.length > 0);
};

export const evaluateConditionById = (input: {
  conditionType: string | null | undefined;
  conditionParams?: unknown;
  trigger: Exclude<LogicBranchTrigger, "always">;
  orientation: "portrait" | "landscape" | null;
  now?: Date | string | number;
  siteTimeZone?: string | null;
}): boolean | null => {
  const condition =
    LOGIC_CONDITION_TYPES.find(
      (entry) => entry.id === input.conditionType && entry.trigger === input.trigger,
    ) ?? null;
  if (!condition?.evaluate) {
    return null;
  }
  return condition.evaluate(
    {
      orientation: input.orientation,
      now:
        input.now instanceof Date
          ? input.now
          : input.now
            ? new Date(input.now)
            : undefined,
      siteTimeZone: input.siteTimeZone ?? null,
    },
    parseConditionParamsByType(input.conditionType, input.conditionParams),
  );
};

export const getTriggerLabel = (trigger: LogicBranchTrigger): string => {
  if (trigger === "always") {
    return "Always";
  }
  if (trigger === "portrait-photo") {
    return "Portrait photo";
  }
  if (trigger === "landscape-photo") {
    return "Landscape photo";
  }
  return "Time window";
};
