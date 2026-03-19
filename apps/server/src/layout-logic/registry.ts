import {
  LOCAL_WARNING_CONDITION_TYPE,
  resolveBuiltinLayoutLogicAction,
  resolveBuiltinLayoutLogicCondition,
  type LayoutLogicActionResolutionInput,
  type LayoutLogicConditionEvaluationInput,
  type LayoutLogicResolvedTarget,
} from "@hearth/shared";
import type { LocalWarningService } from "../services/local-warning-service.js";

type ConditionResolver = (input: LayoutLogicConditionEvaluationInput) => boolean | null;

type ActionResolver = (
  input: LayoutLogicActionResolutionInput,
) => LayoutLogicResolvedTarget | LayoutLogicResolvedTarget[] | null;

// Add custom condition/action handlers here to extend layout logic behavior.
let localWarningService: LocalWarningService | null = null;

const customConditionResolvers: Record<string, ConditionResolver> = {
  [LOCAL_WARNING_CONDITION_TYPE]: (input) =>
    localWarningService?.hasEscalatingWarning(input.conditionParams) ?? false,
};
const customActionResolvers: Record<string, ActionResolver> = {};

export const configureLayoutLogicRegistry = (input: {
  localWarningService: LocalWarningService | null;
}): void => {
  localWarningService = input.localWarningService;
};

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
