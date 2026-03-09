import {
  createLayoutSetLogicGraphFromBranches,
  createLayoutSetLogicGraphFromTargets,
  compileLayoutSetAuthoringToLogicGraph,
  deriveLayoutSetAuthoringFromLogicGraph,
  getDefaultLayoutSetAuthoring,
  getLayoutSetLogicBranches,
  getPrimaryPhotoRouterBlock,
  isDefaultLayoutSetLogicGraph,
  normalizeLayoutSetAuthoring,
  normalizeLayoutSetLogicGraph,
  screenProfileLayoutsSchema,
  toAutoLayoutTargetsFromLogicGraph,
  type AutoLayoutTarget,
  type ScreenProfileLayouts,
} from "./display.js";
import {
  DEFAULT_LANDSCAPE_LAYOUT_LOGIC_CONDITION_TYPE,
  DEFAULT_LAYOUT_LOGIC_ACTION_TYPE,
  DEFAULT_LAYOUT_LOGIC_PHOTO_ACTION_TYPE,
  DEFAULT_PORTRAIT_LAYOUT_LOGIC_CONDITION_TYPE,
} from "./layout-logic-registry.js";

const DEFAULT_TARGET_CYCLE_SECONDS = 20;
const DEFAULT_SET_ID = "set-1";
const DEFAULT_SET_NAME = "Layout set 1";

const clampCycleSeconds = (value: number): number =>
  Math.max(3, Math.min(3600, Math.round(value)));

const normalizeSetId = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length > 0) {
    return trimmed.slice(0, 80);
  }
  return DEFAULT_SET_ID;
};

const isValidLayoutName = (
  layoutName: string | null | undefined,
  knownLayoutNames: Set<string>,
): layoutName is string =>
  typeof layoutName === "string" && knownLayoutNames.has(layoutName);

const uniqueLayoutNames = (
  values: Array<string | null | undefined>,
  knownLayoutNames: Set<string>,
): string[] => {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    if (!isValidLayoutName(value, knownLayoutNames) || seen.has(value)) {
      continue;
    }
    seen.add(value);
    output.push(value);
  }

  return output;
};

const toRule = (
  layoutName: string,
  trigger: AutoLayoutTarget["trigger"],
  cycleSeconds = DEFAULT_TARGET_CYCLE_SECONDS,
): AutoLayoutTarget => ({
  layoutName,
  trigger,
  cycleSeconds: clampCycleSeconds(cycleSeconds),
  actionType: DEFAULT_LAYOUT_LOGIC_ACTION_TYPE,
  actionParams: {},
  conditionType:
    trigger === "portrait-photo"
      ? DEFAULT_PORTRAIT_LAYOUT_LOGIC_CONDITION_TYPE
      : trigger === "landscape-photo"
        ? DEFAULT_LANDSCAPE_LAYOUT_LOGIC_CONDITION_TYPE
        : null,
  conditionParams: {},
});

export interface NormalizeScreenProfileLayoutsInput {
  input: ScreenProfileLayouts;
  knownLayoutNames: Iterable<string>;
  fallbackStaticLayoutName?: string | null;
  resolveSetId?: (input: {
    sourceSetId: string;
    index: number;
    usedSetIds: Set<string>;
  }) => string;
  resolveSetName?: (input: {
    sourceName: string;
    sourceSetId: string;
    setId: string;
    index: number;
  }) => string;
  defaultSetId?: string;
  defaultSetName?: string;
  defaultPhotoActionType?: string;
}

export const normalizeScreenProfileLayoutsConfig = (
  input: NormalizeScreenProfileLayoutsInput,
): ScreenProfileLayouts => {
  const parsed = screenProfileLayoutsSchema.parse(input.input);
  const knownLayoutNames = new Set(input.knownLayoutNames);
  const defaultSetId = normalizeSetId(input.defaultSetId ?? DEFAULT_SET_ID);
  const defaultSetName =
    input.defaultSetName?.trim().slice(0, 80) || DEFAULT_SET_NAME;
  const defaultPhotoActionType =
    input.defaultPhotoActionType ?? DEFAULT_LAYOUT_LOGIC_PHOTO_ACTION_TYPE;

  const fallbackStaticLayoutName = isValidLayoutName(
    input.fallbackStaticLayoutName,
    knownLayoutNames,
  )
    ? input.fallbackStaticLayoutName
    : null;

  const sourceFamilies = Object.entries(parsed.families);
  const families: ScreenProfileLayouts["families"] = {};
  const usedSetIds = new Set<string>();

  for (const [entryIndex, [sourceSetId, source]] of sourceFamilies.entries()) {
    const setId =
      input.resolveSetId?.({
        sourceSetId,
        index: entryIndex + 1,
        usedSetIds,
      }) ?? normalizeSetId(sourceSetId);

    usedSetIds.add(setId);

    const staticLayoutName = isValidLayoutName(
      source.staticLayoutName,
      knownLayoutNames,
    )
      ? source.staticLayoutName
      : null;

    const legacyPortraitTargets = uniqueLayoutNames(
      source.portraitPhotoLayoutNames.length > 0
        ? source.portraitPhotoLayoutNames
        : [source.portraitPhotoLayoutName],
      knownLayoutNames,
    );

    const legacyLandscapeTargets = uniqueLayoutNames(
      source.landscapePhotoLayoutNames.length > 0
        ? source.landscapePhotoLayoutNames
        : [source.landscapePhotoLayoutName],
      knownLayoutNames,
    );

    const sourceTargets =
      source.autoLayoutTargets.length > 0
        ? source.autoLayoutTargets
        : [
            ...(staticLayoutName
              ? [toRule(staticLayoutName, "always")]
              : []),
            ...legacyPortraitTargets.map((layoutName) =>
              toRule(layoutName, "portrait-photo"),
            ),
            ...legacyLandscapeTargets.map((layoutName) =>
              toRule(layoutName, "landscape-photo"),
            ),
          ];

    const shouldMigrateLegacyTargets = isDefaultLayoutSetLogicGraph(
      source.logicGraph,
    );
    const initialGraph =
      shouldMigrateLegacyTargets && sourceTargets.length > 0
        ? createLayoutSetLogicGraphFromTargets(sourceTargets)
        : source.logicGraph;

    const logicBlocks = normalizeLayoutSetAuthoring({
      authoring:
        source.logicBlocks.blocks.length > 0
          ? source.logicBlocks
          : deriveLayoutSetAuthoringFromLogicGraph({
              logicGraph: initialGraph,
              photoActionType: source.photoActionType ?? defaultPhotoActionType,
              photoActionCollectionId: source.photoActionCollectionId ?? null,
            }),
      knownLayoutNames,
    });
    const primaryPhotoRouter = getPrimaryPhotoRouterBlock(logicBlocks);

    const logicGraph = normalizeLayoutSetLogicGraph({
      graph: compileLayoutSetAuthoringToLogicGraph(logicBlocks),
      knownLayoutNames,
    });

    const autoLayoutTargets = toAutoLayoutTargetsFromLogicGraph(logicGraph);
    const branches = getLayoutSetLogicBranches(logicGraph);

    const resolvedStaticLayoutName =
      staticLayoutName ?? autoLayoutTargets[0]?.layoutName ?? null;

    const portraitPhotoLayoutNames = uniqueLayoutNames(
      [...branches.alwaysRules, ...branches.portraitRules].map(
        (target) => target.layoutName,
      ),
      knownLayoutNames,
    );

    const landscapePhotoLayoutNames = uniqueLayoutNames(
      [...branches.alwaysRules, ...branches.landscapeRules].map(
        (target) => target.layoutName,
      ),
      knownLayoutNames,
    );

    const resolvedName =
      input.resolveSetName?.({
        sourceName: source.name,
        sourceSetId,
        setId,
        index: entryIndex + 1,
      }) ??
      (source.name?.trim().length
        ? source.name.trim().slice(0, 80)
        : `Set ${setId}`.slice(0, 80));

    families[setId] = {
      name: resolvedName,
      staticLayoutName: resolvedStaticLayoutName,
      defaultPhotoCollectionId: source.defaultPhotoCollectionId ?? null,
      photoActionCollectionId: primaryPhotoRouter.photoActionCollectionId ?? null,
      photoActionType: primaryPhotoRouter.photoActionType ?? defaultPhotoActionType,
      logicBlocks,
      logicGraph,
      logicNodePositions: {},
      logicEdgeOverrides: {},
      logicDisconnectedEdgeIds: [],
      autoLayoutTargets,
      portraitPhotoLayoutName: portraitPhotoLayoutNames[0] ?? null,
      landscapePhotoLayoutName: landscapePhotoLayoutNames[0] ?? null,
      portraitPhotoLayoutNames,
      landscapePhotoLayoutNames,
    };
  }

  if (Object.keys(families).length === 0) {
    const fallbackAuthoring = getDefaultLayoutSetAuthoring({
      fallbackLayoutName: fallbackStaticLayoutName,
      photoActionType: defaultPhotoActionType,
      photoActionCollectionId: null,
    });
    const fallbackGraph = compileLayoutSetAuthoringToLogicGraph(fallbackAuthoring);

    const fallbackTargets = toAutoLayoutTargetsFromLogicGraph(fallbackGraph);

    families[defaultSetId] = {
      name: defaultSetName,
      staticLayoutName: fallbackStaticLayoutName,
      defaultPhotoCollectionId: null,
      photoActionCollectionId: null,
      photoActionType: defaultPhotoActionType,
      logicBlocks: fallbackAuthoring,
      logicGraph: fallbackGraph,
      logicNodePositions: {},
      logicEdgeOverrides: {},
      logicDisconnectedEdgeIds: [],
      autoLayoutTargets: fallbackTargets,
      portraitPhotoLayoutName: fallbackStaticLayoutName,
      landscapePhotoLayoutName: fallbackStaticLayoutName,
      portraitPhotoLayoutNames: fallbackStaticLayoutName
        ? [fallbackStaticLayoutName]
        : [],
      landscapePhotoLayoutNames: fallbackStaticLayoutName
        ? [fallbackStaticLayoutName]
        : [],
    };
  }

  return screenProfileLayoutsSchema.parse({
    switchMode: "auto",
    autoCycleSeconds: parsed.autoCycleSeconds,
    families,
  });
};
