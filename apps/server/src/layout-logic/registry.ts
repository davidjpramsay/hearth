import {
  resolveBuiltinLayoutLogicAction,
  resolveBuiltinLayoutLogicCondition,
  type LayoutLogicActionResolutionInput,
  type LayoutLogicConditionEvaluationInput,
  type LayoutLogicResolvedTarget,
} from "@hearth/shared";

type ConditionResolver = (
  input: LayoutLogicConditionEvaluationInput,
) => boolean | null;

type ActionResolver = (
  input: LayoutLogicActionResolutionInput,
) => LayoutLogicResolvedTarget | LayoutLogicResolvedTarget[] | null;

// Add custom condition/action handlers here to extend layout logic behavior.
const customConditionResolvers: Record<string, ConditionResolver> = {};
const customActionResolvers: Record<string, ActionResolver> = {};

export const resolveLayoutLogicCondition = (
  input: LayoutLogicConditionEvaluationInput,
): boolean | null => {
  const conditionType = input.conditionType?.trim() ?? "";
  if (!conditionType) {
    return null;
  }

  const custom = customConditionResolvers[conditionType];
  if (custom) {
    return custom(input);
  }

  return resolveBuiltinLayoutLogicCondition(input);
};

export const resolveLayoutLogicAction = (
  input: LayoutLogicActionResolutionInput,
): LayoutLogicResolvedTarget | LayoutLogicResolvedTarget[] | null => {
  const actionType = input.actionType?.trim() ?? "";
  if (!actionType) {
    return resolveBuiltinLayoutLogicAction(input);
  }

  const custom = customActionResolvers[actionType];
  if (custom) {
    return custom(input);
  }

  return resolveBuiltinLayoutLogicAction({
    ...input,
    actionType,
  });
};
