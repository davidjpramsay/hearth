import { z } from "zod";
import type {
  AutoLayoutTargetTrigger,
  LayoutLogicActionResolutionInput,
  LayoutLogicConditionEvaluationInput,
  LayoutLogicResolvedTarget,
} from "./display.js";
import { photoCollectionIdSchema } from "./modules/photos.js";
import {
  clockTimeSchema,
  getMinutesSinceMidnightInTimeZone,
  getRuntimeTimeZone,
  parseClockTimeToMinutes,
} from "./time.js";

const DEFAULT_TARGET_CYCLE_SECONDS = 20;

export const DEFAULT_LAYOUT_LOGIC_ACTION_TYPE = "layout.display";
export const PRIORITY_LAYOUT_LOGIC_ACTION_TYPE = "layout.display.priority";
export const DEFAULT_LAYOUT_LOGIC_PHOTO_ACTION_TYPE = "photo.select-next";
export const PHOTO_COLLECTION_ACTION_PARAM_KEY = "photoCollectionId";
export const DEFAULT_PORTRAIT_LAYOUT_LOGIC_CONDITION_TYPE = "photo.orientation.portrait";
export const DEFAULT_LANDSCAPE_LAYOUT_LOGIC_CONDITION_TYPE = "photo.orientation.landscape";
export const SITE_TIME_WINDOW_LAYOUT_LOGIC_CONDITION_TYPE = "time.window.site-local";

export const siteTimeWindowConditionParamsSchema = z.object({
  startTime: clockTimeSchema.default("09:00"),
  endTime: clockTimeSchema.default("10:00"),
});

type LayoutLogicConditionTrigger = Exclude<AutoLayoutTargetTrigger, "always">;

export interface BuiltinLayoutLogicConditionDefinition {
  id: string;
  label: string;
  description: string;
  trigger: LayoutLogicConditionTrigger;
  evaluate: (input: LayoutLogicConditionEvaluationInput) => boolean | null;
}

export interface BuiltinLayoutLogicCanvasActionDefinition {
  id: string;
  label: string;
  nodeLabel: string;
  description: string;
}

export interface BuiltinLayoutLogicRuleActionDefinition {
  id: string;
  label: string;
  description: string;
  summaryPrefix?: string;
  resolveTargets: (
    input: LayoutLogicActionResolutionInput,
  ) => LayoutLogicResolvedTarget | LayoutLogicResolvedTarget[] | null;
}

const clampCycleSeconds = (value: number): number => Math.max(3, Math.min(3600, Math.round(value)));

export const BUILTIN_LAYOUT_LOGIC_CONDITIONS: BuiltinLayoutLogicConditionDefinition[] = [
  {
    id: DEFAULT_PORTRAIT_LAYOUT_LOGIC_CONDITION_TYPE,
    label: "Photo is portrait",
    description: "Run when the selected photo orientation is portrait.",
    trigger: "portrait-photo",
    evaluate: ({ orientation }) => orientation === "portrait",
  },
  {
    id: DEFAULT_LANDSCAPE_LAYOUT_LOGIC_CONDITION_TYPE,
    label: "Photo is landscape",
    description: "Run when the selected photo orientation is landscape.",
    trigger: "landscape-photo",
    evaluate: ({ orientation }) => orientation === "landscape",
  },
  {
    id: SITE_TIME_WINDOW_LAYOUT_LOGIC_CONDITION_TYPE,
    label: "Time is within window",
    description: "Run when the household timezone time falls within the configured window.",
    trigger: "time-window",
    evaluate: (input) => {
      const parsedParams = siteTimeWindowConditionParamsSchema.safeParse(input.conditionParams);
      if (!parsedParams.success) {
        return null;
      }

      const startMinutes = parseClockTimeToMinutes(parsedParams.data.startTime);
      const endMinutes = parseClockTimeToMinutes(parsedParams.data.endTime);
      if (endMinutes <= startMinutes) {
        return false;
      }

      const currentDate =
        input.now instanceof Date
          ? input.now
          : typeof input.now === "number"
            ? new Date(input.now)
            : typeof input.now === "string"
              ? new Date(input.now)
              : new Date();

      if (Number.isNaN(currentDate.getTime())) {
        return null;
      }

      const siteTimeZone = input.siteTimeZone?.trim() || getRuntimeTimeZone();
      const currentMinutes = getMinutesSinceMidnightInTimeZone(currentDate, siteTimeZone);
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    },
  },
];

export const BUILTIN_LAYOUT_LOGIC_CANVAS_ACTIONS: BuiltinLayoutLogicCanvasActionDefinition[] = [
  {
    id: DEFAULT_LAYOUT_LOGIC_PHOTO_ACTION_TYPE,
    label: "Select next photo",
    nodeLabel: "Select next photo from library",
    description: "Pick the next photo and determine its orientation before evaluating If branches.",
  },
];

const resolveDisplayLayoutAction = (
  input: LayoutLogicActionResolutionInput,
): LayoutLogicResolvedTarget => ({
  layoutName: input.layoutName,
  cycleSeconds: clampCycleSeconds(input.cycleSeconds ?? DEFAULT_TARGET_CYCLE_SECONDS),
  actionParams: input.actionParams,
});

export const BUILTIN_LAYOUT_LOGIC_RULE_ACTIONS: BuiltinLayoutLogicRuleActionDefinition[] = [
  {
    id: DEFAULT_LAYOUT_LOGIC_ACTION_TYPE,
    label: "Display layout",
    description: "Show a selected layout for a number of seconds.",
    resolveTargets: resolveDisplayLayoutAction,
  },
  {
    id: PRIORITY_LAYOUT_LOGIC_ACTION_TYPE,
    label: "Display layout (priority)",
    description: "Same as Display layout, but tagged as priority for future scheduler rules.",
    summaryPrefix: "Priority",
    resolveTargets: resolveDisplayLayoutAction,
  },
];

const conditionById = new Map(BUILTIN_LAYOUT_LOGIC_CONDITIONS.map((entry) => [entry.id, entry]));
const actionById = new Map(BUILTIN_LAYOUT_LOGIC_RULE_ACTIONS.map((entry) => [entry.id, entry]));

export const getDefaultLayoutLogicConditionTypeForTrigger = (
  trigger: LayoutLogicConditionTrigger,
): string =>
  trigger === "portrait-photo"
    ? DEFAULT_PORTRAIT_LAYOUT_LOGIC_CONDITION_TYPE
    : trigger === "landscape-photo"
      ? DEFAULT_LANDSCAPE_LAYOUT_LOGIC_CONDITION_TYPE
      : SITE_TIME_WINDOW_LAYOUT_LOGIC_CONDITION_TYPE;

export const resolveBuiltinLayoutLogicCondition = (
  input: LayoutLogicConditionEvaluationInput,
): boolean | null => {
  const conditionType = input.conditionType?.trim() ?? "";
  if (!conditionType) {
    return null;
  }

  const resolver = conditionById.get(conditionType);
  if (!resolver) {
    return null;
  }

  if (resolver.trigger !== input.trigger) {
    return null;
  }

  return resolver.evaluate(input);
};

export const resolveBuiltinLayoutLogicAction = (
  input: LayoutLogicActionResolutionInput,
): LayoutLogicResolvedTarget | LayoutLogicResolvedTarget[] | null => {
  const resolver = actionById.get(input.actionType);
  if (!resolver) {
    return resolveDisplayLayoutAction(input);
  }
  return resolver.resolveTargets(input);
};

export const renderBuiltinLayoutLogicRuleSummary = (input: {
  actionType: string;
  layoutName: string;
  cycleSeconds: number;
}): string => {
  const action = actionById.get(input.actionType);
  const safeCycleSeconds = clampCycleSeconds(input.cycleSeconds ?? DEFAULT_TARGET_CYCLE_SECONDS);
  const layoutName = input.layoutName || "No layout";

  if (action?.summaryPrefix) {
    return `${action.summaryPrefix}: ${layoutName} for ${safeCycleSeconds}s`;
  }

  return `${layoutName} for ${safeCycleSeconds}s`;
};

export const getPhotoCollectionIdFromActionParams = (
  params: Record<string, unknown> | null | undefined,
): string | null => {
  if (!params || typeof params !== "object") {
    return null;
  }
  const parsed = photoCollectionIdSchema.safeParse(params[PHOTO_COLLECTION_ACTION_PARAM_KEY]);
  return parsed.success ? parsed.data : null;
};
