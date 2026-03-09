import assert from "node:assert/strict";
import test from "node:test";
import {
  compileLayoutSetAuthoringToLogicGraph,
  createLayoutSetLogicGraphFromBranches,
  deriveLayoutSetAuthoringFromLogicGraph,
  getPrimaryPhotoRouterBlock,
  normalizeScreenProfileLayoutsConfig,
  resolveDisplaySequenceFromLogicGraph,
  setPrimaryPhotoRouterBlock,
  toAutoLayoutTargetsFromLogicGraph,
  type AutoLayoutTarget,
} from "@hearth/shared";

const toRule = (
  layoutName: string,
  trigger: AutoLayoutTarget["trigger"],
  overrides: Partial<AutoLayoutTarget> = {},
): AutoLayoutTarget => ({
  layoutName,
  trigger,
  cycleSeconds: overrides.cycleSeconds ?? 20,
  actionType: overrides.actionType ?? "layout.display",
  actionParams: overrides.actionParams ?? {},
  conditionType:
    overrides.conditionType ??
    (trigger === "portrait-photo"
      ? "photo.orientation.portrait"
      : trigger === "landscape-photo"
        ? "photo.orientation.landscape"
        : null),
  conditionParams: overrides.conditionParams ?? {},
});

test("photo-router authoring round-trips portrait and default layout graph rules", () => {
  const logicGraph = createLayoutSetLogicGraphFromBranches({
    alwaysRules: [toRule("Fallback layout", "always", { cycleSeconds: 30 })],
    portraitRules: [
      toRule("Portrait layout", "portrait-photo", {
        cycleSeconds: 12,
        actionType: "layout.display.priority",
        actionParams: {
          photoCollectionId: "family",
        },
      }),
    ],
    landscapeRules: [],
  });

  const authoring = deriveLayoutSetAuthoringFromLogicGraph({
    logicGraph,
    photoActionType: "photo.select-next",
    photoActionCollectionId: "family",
  });
  const block = getPrimaryPhotoRouterBlock(authoring);

  assert.equal(block.type, "photo-router");
  assert.equal(block.photoActionType, "photo.select-next");
  assert.equal(block.photoActionCollectionId, "family");
  assert.equal(block.portrait.enabled, true);
  assert.equal(block.fallback.steps[0]?.layoutName, "Fallback layout");
  assert.equal(block.portrait.steps[0]?.layoutName, "Portrait layout");
  assert.deepEqual(block.landscape.steps, []);

  const roundTrippedTargets = toAutoLayoutTargetsFromLogicGraph(
    compileLayoutSetAuthoringToLogicGraph(authoring),
  );
  assert.deepEqual(
    roundTrippedTargets,
    toAutoLayoutTargetsFromLogicGraph(logicGraph),
  );
});

test("legacy landscape-only branches collapse into the photo orientation default path", () => {
  const logicGraph = createLayoutSetLogicGraphFromBranches({
    alwaysRules: [],
    portraitRules: [toRule("Portrait layout", "portrait-photo")],
    landscapeRules: [toRule("Landscape layout", "landscape-photo", { cycleSeconds: 18 })],
  });

  const authoring = deriveLayoutSetAuthoringFromLogicGraph({
    logicGraph,
    photoActionType: "photo.select-next",
    photoActionCollectionId: null,
  });
  const block = getPrimaryPhotoRouterBlock(authoring);
  const compiled = compileLayoutSetAuthoringToLogicGraph(authoring);

  assert.deepEqual(
    block.fallback.steps.map((step) => step.layoutName),
    ["Landscape layout"],
  );
  assert.deepEqual(block.landscape.steps, []);
  assert.deepEqual(
    resolveDisplaySequenceFromLogicGraph({
      graph: compiled,
      orientation: "landscape",
    }).map((target) => target.layoutName),
    ["Landscape layout"],
  );
});

test("empty authored graph stays empty after normalization", () => {
  const authoring = setPrimaryPhotoRouterBlock({
    authoring: {
      version: 1,
      blocks: [],
    },
    block: {
      id: "photo-router",
      type: "photo-router",
      nodes: [],
      title: "Photo Orientation",
      photoActionType: "photo.select-next",
      photoActionCollectionId: null,
      layoutNodes: [],
      connections: [],
      nodePositions: {
        __start__: { x: 160, y: 32 },
        __end__: { x: 160, y: 280 },
      },
      fallback: {
        steps: [],
      },
      portrait: {
        enabled: false,
        conditionType: "photo.orientation.portrait",
        conditionParams: {},
        steps: [],
      },
      landscape: {
        enabled: false,
        conditionType: "photo.orientation.landscape",
        conditionParams: {},
        steps: [],
      },
    },
  });

  const block = getPrimaryPhotoRouterBlock(authoring);
  const compiled = compileLayoutSetAuthoringToLogicGraph(authoring);

  assert.deepEqual(block.nodes, []);
  assert.deepEqual(block.connections, []);
  assert.deepEqual(block.nodePositions["__start__"], { x: 160, y: 32 });
  assert.deepEqual(block.nodePositions["__end__"], { x: 160, y: 280 });
  assert.deepEqual(
    resolveDisplaySequenceFromLogicGraph({
      graph: compiled,
      orientation: "portrait",
    }),
    [],
  );
});

test("screen profile normalization migrates legacy set graphs into photo-router blocks", () => {
  const logicGraph = createLayoutSetLogicGraphFromBranches({
    alwaysRules: [toRule("Fallback layout", "always")],
    portraitRules: [toRule("Portrait layout", "portrait-photo")],
    landscapeRules: [],
  });

  const normalized = normalizeScreenProfileLayoutsConfig({
    input: {
      switchMode: "auto",
      autoCycleSeconds: 20,
      families: {
        "set-1": {
          name: "Family Set",
          staticLayoutName: "Fallback layout",
          defaultPhotoCollectionId: null,
          photoActionCollectionId: "family",
          photoActionType: "photo.select-next",
          logicBlocks: {
            version: 1,
            blocks: [],
          },
          logicGraph,
          logicNodePositions: {
            start: { x: 120, y: 40 },
          },
          logicEdgeOverrides: {
            "edge-portrait-yes": {
              source: "if-portrait",
              target: "display-fallback-0",
            },
          },
          logicDisconnectedEdgeIds: ["edge-photo-return"],
          autoLayoutTargets: [],
          portraitPhotoLayoutName: null,
          landscapePhotoLayoutName: null,
          portraitPhotoLayoutNames: [],
          landscapePhotoLayoutNames: [],
        },
      },
    },
    knownLayoutNames: ["Fallback layout", "Portrait layout"],
    fallbackStaticLayoutName: "Fallback layout",
  });

  const family = normalized.families["set-1"];
  assert.ok(family);

  const block = getPrimaryPhotoRouterBlock(family.logicBlocks);
  assert.equal(block.type, "photo-router");
  assert.equal(block.photoActionCollectionId, "family");
  assert.equal(block.portrait.enabled, true);
  assert.equal(family.logicNodePositions.start, undefined);
  assert.deepEqual(family.logicEdgeOverrides, {});
  assert.deepEqual(family.logicDisconnectedEdgeIds, []);
  assert.deepEqual(
    toAutoLayoutTargetsFromLogicGraph(family.logicGraph),
    toAutoLayoutTargetsFromLogicGraph(
      compileLayoutSetAuthoringToLogicGraph(family.logicBlocks),
    ),
  );
});

test("photo-router authoring preserves detached layout node chains without affecting runtime", () => {
  const logicGraph = createLayoutSetLogicGraphFromBranches({
    alwaysRules: [toRule("Fallback layout", "always")],
    portraitRules: [toRule("Portrait layout", "portrait-photo")],
    landscapeRules: [],
  });

  const authoring = deriveLayoutSetAuthoringFromLogicGraph({
    logicGraph,
    photoActionType: "photo.select-next",
    photoActionCollectionId: null,
  });
  const block = getPrimaryPhotoRouterBlock(authoring);

  const nextAuthoring = setPrimaryPhotoRouterBlock({
    authoring,
    block: {
      ...block,
      layoutNodes: [
        ...block.layoutNodes,
        {
          id: "draft-step-a",
          layoutName: "Fallback layout",
          cycleSeconds: 15,
          actionType: "layout.display",
          actionParams: {},
        },
        {
          id: "draft-step-b",
          layoutName: "Portrait layout",
          cycleSeconds: 10,
          actionType: "layout.display",
          actionParams: {},
        },
      ],
      connections: [
        ...block.connections,
        {
          id: "draft-step-a::next::draft-step-b",
          source: "draft-step-a",
          sourceHandle: "next",
          target: "draft-step-b",
        },
      ],
      nodePositions: {
        [block.id]: { x: 80, y: 220 },
        "draft-step-a": { x: 900, y: 160 },
        "draft-step-b": { x: 1200, y: 160 },
      },
    },
  });

  const normalizedBlock = getPrimaryPhotoRouterBlock(nextAuthoring);

  assert.equal(
    normalizedBlock.connections.some(
      (connection) =>
        connection.source === "draft-step-a" &&
        connection.target === "draft-step-b" &&
        connection.sourceHandle === "next",
    ),
    true,
  );
  assert.deepEqual(normalizedBlock.nodePositions["draft-step-a"], { x: 900, y: 160 });
  assert.deepEqual(
    normalizedBlock.fallback.steps.map((step) => step.layoutName),
    ["Fallback layout"],
  );
  assert.deepEqual(
    normalizedBlock.portrait.steps.map((step) => step.layoutName),
    ["Portrait layout"],
  );
  assert.deepEqual(
    toAutoLayoutTargetsFromLogicGraph(compileLayoutSetAuthoringToLogicGraph(nextAuthoring)),
    toAutoLayoutTargetsFromLogicGraph(logicGraph),
  );
});

test("photo-router graph connections become the runtime source of truth", () => {
  const nextAuthoring = setPrimaryPhotoRouterBlock({
    authoring: {
      version: 1,
      blocks: [],
    },
    block: {
      id: "photo-router",
      type: "photo-router",
      title: "Photo Orientation",
      photoActionType: "photo.select-next",
      photoActionCollectionId: null,
      layoutNodes: [
        {
          id: "fallback-step",
          layoutName: "Fallback layout",
          cycleSeconds: 20,
          actionType: "layout.display",
          actionParams: {},
        },
        {
          id: "follow-up-step",
          layoutName: "Follow up layout",
          cycleSeconds: 12,
          actionType: "layout.display",
          actionParams: {},
        },
      ],
      connections: [
        {
          id: "photo-router::fallback::fallback-step",
          source: "photo-router",
          sourceHandle: "fallback",
          target: "fallback-step",
        },
        {
          id: "fallback-step::next::follow-up-step",
          source: "fallback-step",
          sourceHandle: "next",
          target: "follow-up-step",
        },
      ],
      nodePositions: {},
      fallback: {
        steps: [],
      },
      portrait: {
        enabled: false,
        conditionType: "photo.orientation.portrait",
        conditionParams: {},
        steps: [
          {
            id: "stale-portrait",
            layoutName: "Portrait layout",
            cycleSeconds: 20,
            actionType: "layout.display",
            actionParams: {},
          },
        ],
      },
      landscape: {
        enabled: false,
        conditionType: "photo.orientation.landscape",
        conditionParams: {},
        steps: [],
      },
    },
  });

  const block = getPrimaryPhotoRouterBlock(nextAuthoring);

  assert.deepEqual(
    block.fallback.steps.map((step) => step.layoutName),
    ["Fallback layout", "Follow up layout"],
  );
  assert.deepEqual(block.portrait.steps, []);
});

test("multi-action graph paths can chain into another action node", () => {
  const authoring = setPrimaryPhotoRouterBlock({
    authoring: {
      version: 1,
      blocks: [],
    },
    block: {
      id: "photo-router",
      type: "photo-router",
      nodes: [
        {
          id: "action-a",
          nodeType: "photo-orientation",
          title: "Photo Orientation",
          photoActionType: "photo.select-next",
          photoActionCollectionId: "family",
          portrait: {
            enabled: true,
            conditionType: "photo.orientation.portrait",
            conditionParams: {},
          },
          landscape: {
            enabled: false,
            conditionType: "photo.orientation.landscape",
            conditionParams: {},
          },
        },
        {
          id: "action-b",
          nodeType: "photo-orientation",
          title: "Photo Orientation 2",
          photoActionType: "photo.select-next",
          photoActionCollectionId: "portraits",
          portrait: {
            enabled: false,
            conditionType: "photo.orientation.portrait",
            conditionParams: {},
          },
          landscape: {
            enabled: false,
            conditionType: "photo.orientation.landscape",
            conditionParams: {},
          },
        },
        {
          id: "layout-a",
          nodeType: "layout",
          layoutName: "Portrait layout",
          cycleSeconds: 12,
          actionType: "layout.display",
          actionParams: {},
        },
        {
          id: "layout-b",
          nodeType: "layout",
          layoutName: "Follow up layout",
          cycleSeconds: 18,
          actionType: "layout.display",
          actionParams: {},
        },
      ],
      title: "Photo Orientation",
      photoActionType: "photo.select-next",
      photoActionCollectionId: "family",
      layoutNodes: [],
      connections: [
        {
          id: "__start__::default::action-a",
          source: "__start__",
          sourceHandle: null,
          target: "action-a",
        },
        {
          id: "action-a::portrait::layout-a",
          source: "action-a",
          sourceHandle: "portrait",
          target: "layout-a",
        },
        {
          id: "action-a::fallback::layout-b",
          source: "action-a",
          sourceHandle: "fallback",
          target: "layout-b",
        },
        {
          id: "layout-a::next::action-b",
          source: "layout-a",
          sourceHandle: "next",
          target: "action-b",
        },
        {
          id: "action-b::fallback::layout-b",
          source: "action-b",
          sourceHandle: "fallback",
          target: "layout-b",
        },
        {
          id: "layout-b::next::__end__",
          source: "layout-b",
          sourceHandle: "next",
          target: "__end__",
        },
      ],
      nodePositions: {},
      fallback: {
        steps: [],
      },
      portrait: {
        enabled: true,
        conditionType: "photo.orientation.portrait",
        conditionParams: {},
        steps: [],
      },
      landscape: {
        enabled: false,
        conditionType: "photo.orientation.landscape",
        conditionParams: {},
        steps: [],
      },
    },
  });

  const logicGraph = compileLayoutSetAuthoringToLogicGraph(authoring);
  const portraitSequence = resolveDisplaySequenceFromLogicGraph({
    graph: logicGraph,
    orientation: "portrait",
    includeActivePhotoCollectionInActionParams: true,
  });
  const landscapeSequence = resolveDisplaySequenceFromLogicGraph({
    graph: logicGraph,
    orientation: "landscape",
    includeActivePhotoCollectionInActionParams: true,
  });

  assert.deepEqual(
    portraitSequence.map((target) => target.layoutName),
    ["Portrait layout", "Follow up layout"],
  );
  assert.equal(portraitSequence[0]?.actionParams.photoCollectionId, "family");
  assert.equal(portraitSequence[1]?.actionParams.photoCollectionId, "portraits");

  assert.deepEqual(
    landscapeSequence.map((target) => target.layoutName),
    ["Follow up layout"],
  );
  assert.equal(landscapeSequence[0]?.actionParams.photoCollectionId, "family");
});
