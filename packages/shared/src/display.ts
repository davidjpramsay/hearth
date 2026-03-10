import { z } from "zod";
import { layoutRecordSchema } from "./layout.js";
import {
  photoCollectionIdSchema,
  photosOrientationSchema,
} from "./modules/photos.js";

const DEFAULT_TARGET_CYCLE_SECONDS = 20;
const DEFAULT_ACTION_TYPE = "layout.display";
const DEFAULT_PHOTO_ACTION_TYPE = "photo.select-next";
const DEFAULT_PHOTO_ROUTER_BLOCK_ID = "photo-router";
const LEGACY_PHOTO_ROUTER_BLOCK_TITLE = "Photo Router";
const DEFAULT_PHOTO_ROUTER_BLOCK_TITLE = "Photo Orientation";
const PHOTO_ROUTER_START_NODE_ID = "__start__";
const PHOTO_ROUTER_END_NODE_ID = "__end__";
const PHOTO_COLLECTION_ACTION_PARAM_KEY = "photoCollectionId";
const PORTRAIT_CONDITION_TYPE = "photo.orientation.portrait";
const LANDSCAPE_CONDITION_TYPE = "photo.orientation.landscape";

const layoutNameSchema = z.string().trim().min(1).max(80);
const screenSetIdSchema = z.string().trim().min(1).max(80);
const screenSetNameSchema = z.string().trim().min(1).max(80);
const autoPhotoOrientationSchema = z.enum(["portrait", "landscape"]);
const logicNodeIdSchema = z.string().trim().min(1).max(64);
const logicEdgeIdSchema = z.string().trim().min(1).max(96);
const logicHandleIdSchema = z.string().trim().min(1).max(64);
const actionTypeSchema = z.string().trim().min(1).max(120);
const conditionTypeSchema = z.string().trim().min(1).max(120);
export const layoutLogicParamsSchema = z
  .record(z.string().trim().min(1).max(64), z.unknown())
  .default({});

const clampCycleSeconds = (value: number): number =>
  Math.max(3, Math.min(3600, Math.round(value)));

export const autoLayoutTargetTriggerSchema = z.enum([
  "always",
  "portrait-photo",
  "landscape-photo",
]);

export const autoLayoutTargetSchema = z.object({
  layoutName: layoutNameSchema,
  trigger: autoLayoutTargetTriggerSchema.default("always"),
  cycleSeconds: z.number().int().min(3).max(3600).default(20),
  actionType: actionTypeSchema.default(DEFAULT_ACTION_TYPE),
  actionParams: layoutLogicParamsSchema.default({}),
  conditionType: conditionTypeSchema.nullable().default(null),
  conditionParams: layoutLogicParamsSchema.default({}),
});

export const layoutSetLogicNodeTypeSchema = z.enum([
  "start",
  "select-photo",
  "if-portrait",
  "if-landscape",
  "else",
  "display",
  "return",
]);

export const layoutSetLogicEdgeWhenSchema = z.enum(["always", "yes", "no"]);

export const layoutSetLogicNodeSchema = z.object({
  id: logicNodeIdSchema,
  type: layoutSetLogicNodeTypeSchema,
  layoutName: layoutNameSchema.nullable().optional(),
  cycleSeconds: z.number().int().min(3).max(3600).nullable().optional(),
  actionType: actionTypeSchema.nullable().optional(),
  actionParams: layoutLogicParamsSchema.nullable().optional(),
  conditionType: conditionTypeSchema.nullable().optional(),
  conditionParams: layoutLogicParamsSchema.nullable().optional(),
});

export const layoutSetLogicEdgeSchema = z.object({
  id: logicEdgeIdSchema,
  from: logicNodeIdSchema,
  to: logicNodeIdSchema,
  when: layoutSetLogicEdgeWhenSchema.default("always"),
});

export const layoutSetLogicEdgeOverrideSchema = z.object({
  source: logicNodeIdSchema,
  target: logicNodeIdSchema,
  sourceHandle: logicHandleIdSchema.nullable().optional(),
  targetHandle: logicHandleIdSchema.nullable().optional(),
});

export const layoutSetLogicEdgeOverridesSchema = z
  .record(logicEdgeIdSchema, layoutSetLogicEdgeOverrideSchema)
  .default({});

export const layoutSetLogicNodePositionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export const layoutSetLogicNodePositionsSchema = z
  .record(logicNodeIdSchema, layoutSetLogicNodePositionSchema)
  .default({});

export const layoutSetLogicDisconnectedEdgeIdsSchema = z
  .array(logicEdgeIdSchema)
  .max(512)
  .default([]);

export const photoRouterStepSchema = z.object({
  id: logicNodeIdSchema,
  layoutName: layoutNameSchema,
  cycleSeconds: z.number().int().min(3).max(3600).default(DEFAULT_TARGET_CYCLE_SECONDS),
  actionType: actionTypeSchema.default(DEFAULT_ACTION_TYPE),
  actionParams: layoutLogicParamsSchema.default({}),
});

export const photoRouterConnectionSchema = z.object({
  id: logicEdgeIdSchema,
  source: logicNodeIdSchema,
  target: logicNodeIdSchema,
  sourceHandle: logicHandleIdSchema.nullable().default(null),
});

export const photoRouterFallbackBranchSchema = z.object({
  steps: z.array(photoRouterStepSchema).max(24).default([]),
});

export const photoRouterConditionalBranchSchema = z.object({
  enabled: z.boolean().default(false),
  conditionType: conditionTypeSchema.nullable().default(null),
  conditionParams: layoutLogicParamsSchema.default({}),
  steps: z.array(photoRouterStepSchema).max(24).default([]),
});

export const photoRouterActionRouteSchema = z.object({
  enabled: z.boolean().default(false),
  conditionType: conditionTypeSchema.nullable().default(null),
  conditionParams: layoutLogicParamsSchema.default({}),
});

export const photoRouterLayoutNodeSchema = z.object({
  id: logicNodeIdSchema,
  nodeType: z.literal("layout"),
  layoutName: layoutNameSchema,
  cycleSeconds: z.number().int().min(3).max(3600).default(DEFAULT_TARGET_CYCLE_SECONDS),
  actionType: actionTypeSchema.default(DEFAULT_ACTION_TYPE),
  actionParams: layoutLogicParamsSchema.default({}),
});

export const photoRouterPhotoOrientationNodeSchema = z.object({
  id: logicNodeIdSchema,
  nodeType: z.literal("photo-orientation"),
  title: screenSetNameSchema.default(DEFAULT_PHOTO_ROUTER_BLOCK_TITLE),
  photoActionType: actionTypeSchema.default(DEFAULT_PHOTO_ACTION_TYPE),
  photoActionCollectionId: photoCollectionIdSchema.nullable().default(null),
  portrait: photoRouterActionRouteSchema.default({
    enabled: false,
    conditionType: PORTRAIT_CONDITION_TYPE,
    conditionParams: {},
  }),
  landscape: photoRouterActionRouteSchema.default({
    enabled: false,
    conditionType: LANDSCAPE_CONDITION_TYPE,
    conditionParams: {},
  }),
});

export const photoRouterGraphNodeSchema = z.discriminatedUnion("nodeType", [
  photoRouterLayoutNodeSchema,
  photoRouterPhotoOrientationNodeSchema,
]);

export const photoRouterBlockSchema = z.object({
  id: logicNodeIdSchema.default(DEFAULT_PHOTO_ROUTER_BLOCK_ID),
  type: z.literal("photo-router"),
  nodes: z.array(photoRouterGraphNodeSchema).max(64).default([]),
  title: screenSetNameSchema.default(DEFAULT_PHOTO_ROUTER_BLOCK_TITLE),
  photoActionType: actionTypeSchema.default(DEFAULT_PHOTO_ACTION_TYPE),
  photoActionCollectionId: photoCollectionIdSchema.nullable().default(null),
  layoutNodes: z.array(photoRouterStepSchema).max(48).default([]),
  connections: z.array(photoRouterConnectionSchema).max(256).default([]),
  nodePositions: layoutSetLogicNodePositionsSchema.default({}),
  fallback: photoRouterFallbackBranchSchema.default({}),
  portrait: photoRouterConditionalBranchSchema.default({
    enabled: false,
    conditionType: PORTRAIT_CONDITION_TYPE,
    conditionParams: {},
    steps: [],
  }),
  landscape: photoRouterConditionalBranchSchema.default({
    enabled: false,
    conditionType: LANDSCAPE_CONDITION_TYPE,
    conditionParams: {},
    steps: [],
  }),
});

export const layoutSetLogicBlockSchema = z.discriminatedUnion("type", [
  photoRouterBlockSchema,
]);

export const layoutSetAuthoringSchema = z.object({
  version: z.literal(1).default(1),
  blocks: z.array(layoutSetLogicBlockSchema).max(16).default([]),
});

const createDefaultLayoutSetLogicGraphInput = () => ({
  version: 1 as const,
  entryNodeId: "start",
  nodes: [
    {
      id: "start",
      type: "start" as const,
    },
    {
      id: "return",
      type: "return" as const,
    },
  ],
  edges: [
    {
      id: "edge-start-return",
      from: "start",
      to: "return",
      when: "always" as const,
    },
  ],
});

export const layoutSetLogicGraphSchema = z.object({
  version: z.literal(1).default(1),
  entryNodeId: logicNodeIdSchema.default("start"),
  nodes: z.array(layoutSetLogicNodeSchema).max(256).default([]),
  edges: z.array(layoutSetLogicEdgeSchema).max(512).default([]),
});

export type LayoutSetLogicGraph = z.infer<typeof layoutSetLogicGraphSchema>;
export type LayoutSetLogicNode = z.infer<typeof layoutSetLogicNodeSchema>;
export type LayoutSetLogicEdge = z.infer<typeof layoutSetLogicEdgeSchema>;
export type LayoutSetLogicNodePosition = z.infer<typeof layoutSetLogicNodePositionSchema>;
export type LayoutSetLogicEdgeOverride = z.infer<
  typeof layoutSetLogicEdgeOverrideSchema
>;
export type PhotoRouterStep = z.infer<typeof photoRouterStepSchema>;
export type PhotoRouterFallbackBranch = z.infer<typeof photoRouterFallbackBranchSchema>;
export type PhotoRouterConditionalBranch = z.infer<
  typeof photoRouterConditionalBranchSchema
>;
export type PhotoRouterActionRoute = z.infer<typeof photoRouterActionRouteSchema>;
export type PhotoRouterLayoutNode = z.infer<typeof photoRouterLayoutNodeSchema>;
export type PhotoRouterPhotoOrientationNode = z.infer<
  typeof photoRouterPhotoOrientationNodeSchema
>;
export type PhotoRouterGraphNode = z.infer<typeof photoRouterGraphNodeSchema>;
export type PhotoRouterConnection = z.infer<typeof photoRouterConnectionSchema>;
export type PhotoRouterBlock = z.infer<typeof photoRouterBlockSchema>;
export type LayoutSetLogicBlock = z.infer<typeof layoutSetLogicBlockSchema>;
export type LayoutSetAuthoring = z.infer<typeof layoutSetAuthoringSchema>;

export const getDefaultLayoutSetLogicGraph = (): LayoutSetLogicGraph =>
  layoutSetLogicGraphSchema.parse(createDefaultLayoutSetLogicGraphInput());

const toPhotoRouterStepId = (
  branch: "fallback" | "portrait" | "landscape",
  index: number,
): string => `${branch}-step-${index}`;

const normalizePhotoRouterStep = (input: PhotoRouterStep): PhotoRouterStep => ({
  id: input.id.trim(),
  layoutName: input.layoutName.trim(),
  cycleSeconds: clampCycleSeconds(input.cycleSeconds),
  actionType: input.actionType.trim() || DEFAULT_ACTION_TYPE,
  actionParams: toLogicParams(input.actionParams),
});

const normalizePhotoRouterConditionalBranch = (input: {
  branch: PhotoRouterConditionalBranch;
  defaultConditionType: string;
}): PhotoRouterConditionalBranch =>
  photoRouterConditionalBranchSchema.parse({
    enabled: input.branch.enabled,
    conditionType:
      input.branch.conditionType?.trim() || input.defaultConditionType,
    conditionParams: toLogicParams(input.branch.conditionParams),
    steps: input.branch.steps.map(normalizePhotoRouterStep),
  });

const normalizePhotoRouterFallbackBranch = (
  input: PhotoRouterFallbackBranch,
): PhotoRouterFallbackBranch =>
  photoRouterFallbackBranchSchema.parse({
  steps: input.steps.map(normalizePhotoRouterStep),
  });

const PHOTO_ROUTER_BRANCH_KEYS = ["fallback", "portrait", "landscape"] as const;
type PhotoRouterBranchKey = (typeof PHOTO_ROUTER_BRANCH_KEYS)[number];

const PHOTO_ROUTER_NEXT_HANDLE = "next";

const toPhotoRouterConnectionId = (input: {
  source: string;
  sourceHandle?: string | null;
  target: string;
}): string =>
  [input.source.trim(), input.sourceHandle?.trim() || "default", input.target.trim()].join(
    "::",
  );

const isPhotoRouterBranchKey = (value: string | null | undefined): value is PhotoRouterBranchKey =>
  value === "fallback" || value === "portrait" || value === "landscape";

const buildPhotoRouterLayoutNodesFromBranches = (input: {
  fallback: PhotoRouterFallbackBranch;
  portrait: PhotoRouterConditionalBranch;
  landscape: PhotoRouterConditionalBranch;
}): PhotoRouterStep[] => {
  const seen = new Set<string>();
  const result: PhotoRouterStep[] = [];
  const defaultSteps =
    input.fallback.steps.length > 0 ? input.fallback.steps : input.landscape.steps;

  for (const step of [...defaultSteps, ...input.portrait.steps]) {
    const normalized = normalizePhotoRouterStep(step);
    if (seen.has(normalized.id)) {
      continue;
    }
    seen.add(normalized.id);
    result.push(normalized);
  }

  return result;
};

const buildPhotoRouterConnectionsFromBranchSteps = (input: {
  routerId: string;
  fallback: PhotoRouterFallbackBranch;
  portrait: PhotoRouterConditionalBranch;
  landscape: PhotoRouterConditionalBranch;
}): PhotoRouterConnection[] => {
  const result: PhotoRouterConnection[] = [];
  const defaultSteps =
    input.fallback.steps.length > 0 ? input.fallback.steps : input.landscape.steps;

  const appendBranch = (
    branchKey: PhotoRouterBranchKey,
    steps:
      | PhotoRouterFallbackBranch["steps"]
      | PhotoRouterConditionalBranch["steps"],
  ) => {
    if (steps.length === 0) {
      return;
    }

    const firstStep = normalizePhotoRouterStep(steps[0]);
    result.push(
      photoRouterConnectionSchema.parse({
        id: toPhotoRouterConnectionId({
          source: input.routerId,
          sourceHandle: branchKey,
          target: firstStep.id,
        }),
        source: input.routerId,
        sourceHandle: branchKey,
        target: firstStep.id,
      }),
    );

    for (let index = 0; index < steps.length - 1; index += 1) {
      const current = normalizePhotoRouterStep(steps[index]);
      const next = normalizePhotoRouterStep(steps[index + 1]);
      result.push(
        photoRouterConnectionSchema.parse({
          id: toPhotoRouterConnectionId({
            source: current.id,
            sourceHandle: PHOTO_ROUTER_NEXT_HANDLE,
            target: next.id,
          }),
          source: current.id,
          sourceHandle: PHOTO_ROUTER_NEXT_HANDLE,
          target: next.id,
        }),
      );
    }
  };

  appendBranch("portrait", input.portrait.steps);
  appendBranch("fallback", defaultSteps);

  return result;
};

const normalizePhotoRouterNodePositions = (input: {
  nodePositions: Record<string, { x: number; y: number }>;
  routerId: string;
  knownStepIds: Set<string>;
}) =>
  layoutSetLogicNodePositionsSchema.parse(
    Object.fromEntries(
      Object.entries(input.nodePositions).filter(([nodeId]) =>
        nodeId === input.routerId ||
        nodeId === PHOTO_ROUTER_START_NODE_ID ||
        nodeId === PHOTO_ROUTER_END_NODE_ID
          ? true
          : input.knownStepIds.has(nodeId),
      ),
    ),
  );

const sanitizePhotoRouterConnections = (input: {
  connections: PhotoRouterConnection[];
  routerId: string;
  knownStepIds: Set<string>;
}): PhotoRouterConnection[] => {
  const usedIncoming = new Set<string>();
  const usedStepOutgoing = new Set<string>();
  const usedRouterHandles = new Set<PhotoRouterBranchKey>();
  const result: PhotoRouterConnection[] = [];

  for (const rawConnection of input.connections) {
    const source = rawConnection.source.trim();
    const target = rawConnection.target.trim();
    const sourceHandle = rawConnection.sourceHandle?.trim() || null;

    if (!input.knownStepIds.has(target) || source === target) {
      continue;
    }

    if (source === input.routerId) {
      if (!isPhotoRouterBranchKey(sourceHandle) || usedRouterHandles.has(sourceHandle)) {
        continue;
      }
      if (usedIncoming.has(target)) {
        continue;
      }
      usedRouterHandles.add(sourceHandle);
      usedIncoming.add(target);
      result.push(
        photoRouterConnectionSchema.parse({
          id: toPhotoRouterConnectionId({
            source,
            sourceHandle,
            target,
          }),
          source,
          sourceHandle,
          target,
        }),
      );
      continue;
    }

    if (!input.knownStepIds.has(source) || usedStepOutgoing.has(source) || usedIncoming.has(target)) {
      continue;
    }

    if (sourceHandle !== null && sourceHandle !== PHOTO_ROUTER_NEXT_HANDLE) {
      continue;
    }

    usedStepOutgoing.add(source);
    usedIncoming.add(target);
    result.push(
      photoRouterConnectionSchema.parse({
        id: toPhotoRouterConnectionId({
          source,
          sourceHandle: PHOTO_ROUTER_NEXT_HANDLE,
          target,
        }),
        source,
        sourceHandle: PHOTO_ROUTER_NEXT_HANDLE,
        target,
      }),
    );
  }

  return result;
};

const derivePhotoRouterBranchesFromConnections = (input: {
  routerId: string;
  fallback: PhotoRouterFallbackBranch;
  portrait: PhotoRouterConditionalBranch;
  landscape: PhotoRouterConditionalBranch;
  layoutNodes: PhotoRouterStep[];
  connections: PhotoRouterConnection[];
}): Pick<PhotoRouterBlock, "fallback" | "portrait" | "landscape"> => {
  const stepById = new Map(input.layoutNodes.map((step) => [step.id, step] as const));
  const branchHeads: Partial<Record<PhotoRouterBranchKey, string>> = {};
  const nextBySource = new Map<string, string>();

  for (const connection of input.connections) {
    if (connection.source === input.routerId && isPhotoRouterBranchKey(connection.sourceHandle)) {
      branchHeads[connection.sourceHandle] = connection.target;
      continue;
    }

    if (stepById.has(connection.source)) {
      nextBySource.set(connection.source, connection.target);
    }
  }

  const visited = new Set<string>();

  const readBranch = (branchKey: PhotoRouterBranchKey): PhotoRouterStep[] => {
    const result: PhotoRouterStep[] = [];
    const chainVisited = new Set<string>();
    let currentId = branchHeads[branchKey] ?? null;

    while (currentId && stepById.has(currentId) && !chainVisited.has(currentId)) {
      if (visited.has(currentId)) {
        break;
      }
      const step = stepById.get(currentId);
      if (!step) {
        break;
      }
      result.push(step);
      visited.add(currentId);
      chainVisited.add(currentId);
      currentId = nextBySource.get(currentId) ?? null;
    }

    return result;
  };

  return {
    fallback: photoRouterFallbackBranchSchema.parse({
      steps: readBranch("fallback"),
    }),
    portrait: photoRouterConditionalBranchSchema.parse({
      enabled: input.portrait.enabled,
      conditionType: input.portrait.conditionType?.trim() || PORTRAIT_CONDITION_TYPE,
      conditionParams: toLogicParams(input.portrait.conditionParams),
      steps: readBranch("portrait"),
    }),
    landscape: photoRouterConditionalBranchSchema.parse({
      enabled: input.landscape.enabled,
      conditionType: input.landscape.conditionType?.trim() || LANDSCAPE_CONDITION_TYPE,
      conditionParams: toLogicParams(input.landscape.conditionParams),
      steps: readBranch("landscape"),
    }),
  };
};

const normalizePhotoRouterBlock = (input: {
  block: PhotoRouterBlock;
  knownLayoutNames?: Set<string> | null;
}): PhotoRouterBlock => {
  return buildNormalizedPhotoRouterGraph({
    block: photoRouterBlockSchema.parse(input.block),
    knownLayoutNames: input.knownLayoutNames ?? null,
  });
};

export const getDefaultLayoutSetAuthoring = (input?: {
  fallbackLayoutName?: string | null;
  photoActionType?: string | null;
  photoActionCollectionId?: string | null;
}): LayoutSetAuthoring => {
  return layoutSetAuthoringSchema.parse({
    version: 1,
    blocks: [
      createDefaultPhotoRouterGraphBlock(input),
    ],
  });
};

export const getPrimaryPhotoRouterBlock = (
  input: LayoutSetAuthoring | null | undefined,
): PhotoRouterBlock => {
  const parsed = layoutSetAuthoringSchema.parse(input ?? {});
  const existing = parsed.blocks.find(
    (block): block is PhotoRouterBlock => block.type === "photo-router",
  );

  if (existing) {
    const normalizedTitle = existing.title?.trim();
    return normalizePhotoRouterBlock({
      block: photoRouterBlockSchema.parse({
        ...existing,
        title:
          !normalizedTitle || normalizedTitle === LEGACY_PHOTO_ROUTER_BLOCK_TITLE
            ? DEFAULT_PHOTO_ROUTER_BLOCK_TITLE
            : normalizedTitle,
        photoActionType: existing.photoActionType?.trim() || DEFAULT_PHOTO_ACTION_TYPE,
      }),
    });
  }

  return photoRouterBlockSchema.parse(getDefaultLayoutSetAuthoring().blocks[0]);
};

export const setPrimaryPhotoRouterBlock = (input: {
  authoring: LayoutSetAuthoring;
  block: PhotoRouterBlock;
}): LayoutSetAuthoring => {
  const parsed = layoutSetAuthoringSchema.parse(input.authoring);
  const nextBlock = normalizePhotoRouterBlock({
    block: photoRouterBlockSchema.parse(input.block),
  });
  const remaining = parsed.blocks.filter((block) => block.type !== "photo-router");

  return layoutSetAuthoringSchema.parse({
    version: 1,
    blocks: [nextBlock, ...remaining],
  });
};

export const normalizeLayoutSetAuthoring = (input: {
  authoring: LayoutSetAuthoring;
  knownLayoutNames?: Iterable<string>;
}): LayoutSetAuthoring => {
  const parsed = layoutSetAuthoringSchema.parse(input.authoring);
  const knownLayoutNames = input.knownLayoutNames
    ? new Set(input.knownLayoutNames)
    : null;
  const photoRouterBlock = normalizePhotoRouterBlock({
    block: getPrimaryPhotoRouterBlock(parsed),
    knownLayoutNames,
  });

  return layoutSetAuthoringSchema.parse({
    version: 1,
    blocks: [photoRouterBlock],
  });
};

function isPhotoRouterLayoutGraphNode(
  node: PhotoRouterGraphNode,
): node is PhotoRouterLayoutNode {
  return node.nodeType === "layout";
}

function isPhotoRouterPhotoOrientationNode(
  node: PhotoRouterGraphNode,
): node is PhotoRouterPhotoOrientationNode {
  return node.nodeType === "photo-orientation";
}

function normalizePhotoRouterActionRoute(input: {
  route: PhotoRouterActionRoute;
  defaultConditionType: string;
}): PhotoRouterActionRoute {
  return photoRouterActionRouteSchema.parse({
    enabled: input.route.enabled,
    conditionType: input.route.conditionType?.trim() || input.defaultConditionType,
    conditionParams: toLogicParams(input.route.conditionParams),
  });
}

function normalizePhotoRouterLayoutGraphNode(
  input: PhotoRouterLayoutNode,
): PhotoRouterLayoutNode {
  return photoRouterLayoutNodeSchema.parse({
    ...input,
    id: input.id.trim(),
    layoutName: input.layoutName.trim(),
    cycleSeconds: clampCycleSeconds(input.cycleSeconds),
    actionType: input.actionType.trim() || DEFAULT_ACTION_TYPE,
    actionParams: toLogicParams(input.actionParams),
  });
}

function normalizePhotoRouterPhotoOrientationGraphNode(
  input: PhotoRouterPhotoOrientationNode,
): PhotoRouterPhotoOrientationNode {
  return photoRouterPhotoOrientationNodeSchema.parse({
    ...input,
    id: input.id.trim(),
    title: input.title?.trim() || DEFAULT_PHOTO_ROUTER_BLOCK_TITLE,
    photoActionType: input.photoActionType?.trim() || DEFAULT_PHOTO_ACTION_TYPE,
    photoActionCollectionId: input.photoActionCollectionId ?? null,
    portrait: normalizePhotoRouterActionRoute({
      route: {
        ...input.portrait,
        enabled: true,
      },
      defaultConditionType: PORTRAIT_CONDITION_TYPE,
    }),
    landscape: normalizePhotoRouterActionRoute({
      route: input.landscape,
      defaultConditionType: LANDSCAPE_CONDITION_TYPE,
    }),
  });
}

function normalizePhotoRouterGraphNode(
  input: PhotoRouterGraphNode,
): PhotoRouterGraphNode {
  return isPhotoRouterLayoutGraphNode(input)
    ? normalizePhotoRouterLayoutGraphNode(input)
    : normalizePhotoRouterPhotoOrientationGraphNode(input);
}

function toPhotoRouterLayoutGraphNode(input: PhotoRouterStep): PhotoRouterLayoutNode {
  return photoRouterLayoutNodeSchema.parse({
    id: input.id,
    nodeType: "layout",
    layoutName: input.layoutName,
    cycleSeconds: input.cycleSeconds,
    actionType: input.actionType,
    actionParams: input.actionParams,
  });
}

function toPhotoRouterStepFromLayoutGraphNode(
  input: PhotoRouterLayoutNode,
): PhotoRouterStep {
  return photoRouterStepSchema.parse({
    id: input.id,
    layoutName: input.layoutName,
    cycleSeconds: input.cycleSeconds,
    actionType: input.actionType,
    actionParams: input.actionParams,
  });
}

function createPhotoOrientationActionNode(input: {
  id: string;
  title: string;
  photoActionType: string;
  photoActionCollectionId: string | null;
  portrait: PhotoRouterConditionalBranch;
  landscape: PhotoRouterConditionalBranch;
}): PhotoRouterPhotoOrientationNode {
  return photoRouterPhotoOrientationNodeSchema.parse({
    id: input.id,
    nodeType: "photo-orientation",
    title: input.title,
    photoActionType: input.photoActionType,
    photoActionCollectionId: input.photoActionCollectionId,
    portrait: {
      enabled: input.portrait.enabled,
      conditionType: input.portrait.conditionType,
      conditionParams: input.portrait.conditionParams,
    },
    landscape: {
      enabled: input.landscape.enabled,
      conditionType: input.landscape.conditionType,
      conditionParams: input.landscape.conditionParams,
    },
  });
}

function getPhotoRouterSourceHandles(node: PhotoRouterGraphNode): string[] {
  if (isPhotoRouterLayoutGraphNode(node)) {
    return [PHOTO_ROUTER_NEXT_HANDLE];
  }

  if (isPhotoRouterPhotoOrientationNode(node)) {
    return ["portrait", "fallback"];
  }

  return [];
}

function normalizePhotoRouterGraphNodePositions(input: {
  nodePositions: Record<string, { x: number; y: number }>;
  knownNodeIds: Set<string>;
}) {
  return layoutSetLogicNodePositionsSchema.parse(
    Object.fromEntries(
      Object.entries(input.nodePositions).filter(([nodeId]) =>
        nodeId === PHOTO_ROUTER_START_NODE_ID ||
        nodeId === PHOTO_ROUTER_END_NODE_ID ||
        input.knownNodeIds.has(nodeId),
      ),
    ),
  );
}

function wouldCreatePhotoRouterGraphCycle(input: {
  connections: PhotoRouterConnection[];
  source: string;
  target: string;
}): boolean {
  if (
    input.source === PHOTO_ROUTER_START_NODE_ID ||
    input.target === PHOTO_ROUTER_END_NODE_ID
  ) {
    return false;
  }

  const adjacency = new Map<string, string[]>();
  for (const connection of input.connections) {
    if (
      connection.source === PHOTO_ROUTER_START_NODE_ID ||
      connection.target === PHOTO_ROUTER_END_NODE_ID
    ) {
      continue;
    }
    const current = adjacency.get(connection.source) ?? [];
    current.push(connection.target);
    adjacency.set(connection.source, current);
  }

  const queue = [input.target];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) {
      continue;
    }
    if (current === input.source) {
      return true;
    }
    visited.add(current);
    for (const next of adjacency.get(current) ?? []) {
      if (!visited.has(next)) {
        queue.push(next);
      }
    }
  }

  return false;
}

function sanitizePhotoRouterGraphConnections(input: {
  connections: PhotoRouterConnection[];
  nodesById: Map<string, PhotoRouterGraphNode>;
}): PhotoRouterConnection[] {
  const result: PhotoRouterConnection[] = [];
  const usedOutgoing = new Set<string>();
  const sortedConnections = [...input.connections].sort((left, right) => {
    const toPriority = (connection: PhotoRouterConnection): number => {
      if (connection.source === PHOTO_ROUTER_START_NODE_ID) {
        return 0;
      }
      if (connection.sourceHandle === "portrait") {
        return 1;
      }
      if (connection.sourceHandle === "fallback") {
        return 2;
      }
      if (connection.sourceHandle === "landscape") {
        return 3;
      }
      return 4;
    };
    return toPriority(left) - toPriority(right);
  });

  for (const rawConnection of sortedConnections) {
    const source = rawConnection.source.trim();
    const target = rawConnection.target.trim();
    const sourceNode = input.nodesById.get(source);
    const sourceHandle =
      sourceNode && isPhotoRouterPhotoOrientationNode(sourceNode)
        ? rawConnection.sourceHandle?.trim() === "landscape"
          ? "fallback"
          : rawConnection.sourceHandle?.trim() || null
        : rawConnection.sourceHandle?.trim() || null;

    if (!source || !target || source === target) {
      continue;
    }
    if (source === PHOTO_ROUTER_END_NODE_ID || target === PHOTO_ROUTER_START_NODE_ID) {
      continue;
    }

    if (source === PHOTO_ROUTER_START_NODE_ID) {
      if (!input.nodesById.has(target)) {
        continue;
      }
      const outgoingKey = `${PHOTO_ROUTER_START_NODE_ID}::default`;
      if (usedOutgoing.has(outgoingKey)) {
        continue;
      }
      usedOutgoing.add(outgoingKey);
      result.push(
        photoRouterConnectionSchema.parse({
          id: toPhotoRouterConnectionId({
            source,
            target,
          }),
          source,
          sourceHandle: null,
          target,
        }),
      );
      continue;
    }

    if (!sourceNode) {
      continue;
    }

    if (target !== PHOTO_ROUTER_END_NODE_ID && !input.nodesById.has(target)) {
      continue;
    }

    const allowedHandles = getPhotoRouterSourceHandles(sourceNode);
    const normalizedHandle = allowedHandles.includes(sourceHandle ?? "")
      ? sourceHandle
      : allowedHandles.length === 1
        ? allowedHandles[0]!
        : null;
    if (!normalizedHandle) {
      continue;
    }

    const outgoingKey = `${source}::${normalizedHandle}`;
    if (usedOutgoing.has(outgoingKey)) {
      continue;
    }

    if (
      target !== PHOTO_ROUTER_END_NODE_ID &&
      wouldCreatePhotoRouterGraphCycle({
        connections: result,
        source,
        target,
      })
    ) {
      continue;
    }

    usedOutgoing.add(outgoingKey);
    result.push(
      photoRouterConnectionSchema.parse({
        id: toPhotoRouterConnectionId({
          source,
          sourceHandle: normalizedHandle,
          target,
        }),
        source,
        sourceHandle: normalizedHandle,
        target,
      }),
    );
  }

  return result;
}

function addLegacyBoundaryConnections(input: {
  routerId: string;
  layoutNodes: PhotoRouterLayoutNode[];
  connections: PhotoRouterConnection[];
}): PhotoRouterConnection[] {
  const result: PhotoRouterConnection[] = [
    photoRouterConnectionSchema.parse({
      id: toPhotoRouterConnectionId({
        source: PHOTO_ROUTER_START_NODE_ID,
        target: input.routerId,
      }),
      source: PHOTO_ROUTER_START_NODE_ID,
      sourceHandle: null,
      target: input.routerId,
    }),
    ...input.connections,
  ];

  const connectedTargets = new Set(input.connections.map((connection) => connection.target));
  const connectedSources = new Set(input.connections.map((connection) => connection.source));

  for (const node of input.layoutNodes) {
    if (!connectedTargets.has(node.id) || connectedSources.has(node.id)) {
      continue;
    }
    result.push(
      photoRouterConnectionSchema.parse({
        id: toPhotoRouterConnectionId({
          source: node.id,
          sourceHandle: PHOTO_ROUTER_NEXT_HANDLE,
          target: PHOTO_ROUTER_END_NODE_ID,
        }),
        source: node.id,
        sourceHandle: PHOTO_ROUTER_NEXT_HANDLE,
        target: PHOTO_ROUTER_END_NODE_ID,
      }),
    );
  }

  return result;
}

function buildLegacyPhotoRouterGraphState(input: {
  block: PhotoRouterBlock;
  routerId: string;
  fallback: PhotoRouterFallbackBranch;
  portrait: PhotoRouterConditionalBranch;
  landscape: PhotoRouterConditionalBranch;
}): {
  nodes: PhotoRouterGraphNode[];
  connections: PhotoRouterConnection[];
} {
  const hasLegacyExplicitGraphState =
    input.block.layoutNodes.length > 0 ||
    input.block.connections.length > 0 ||
    Object.keys(input.block.nodePositions).length > 0;

  const layoutSteps = (
    hasLegacyExplicitGraphState
      ? input.block.layoutNodes.map(normalizePhotoRouterStep)
      : buildPhotoRouterLayoutNodesFromBranches({
          fallback: input.fallback,
          portrait: input.portrait,
          landscape: input.landscape,
        })
  ).map(toPhotoRouterLayoutGraphNode);

  const actionNode = createPhotoOrientationActionNode({
    id: input.routerId,
    title: input.block.title?.trim() || DEFAULT_PHOTO_ROUTER_BLOCK_TITLE,
    photoActionType:
      input.block.photoActionType?.trim() || DEFAULT_PHOTO_ACTION_TYPE,
    photoActionCollectionId: input.block.photoActionCollectionId ?? null,
    portrait: input.portrait,
    landscape: input.landscape,
  });

  const legacyConnections =
    hasLegacyExplicitGraphState && input.block.connections.length > 0
      ? input.block.connections
      : buildPhotoRouterConnectionsFromBranchSteps({
          routerId: input.routerId,
          fallback: input.fallback,
          portrait: input.portrait,
          landscape: input.landscape,
        });

  return {
    nodes: [actionNode, ...layoutSteps],
    connections: addLegacyBoundaryConnections({
      routerId: input.routerId,
      layoutNodes: layoutSteps,
      connections: legacyConnections,
    }),
  };
}

function getPrimaryPhotoOrientationNodeFromGraph(input: {
  nodes: PhotoRouterGraphNode[];
  connections: PhotoRouterConnection[];
}): PhotoRouterPhotoOrientationNode | null {
  const nodeById = new Map(input.nodes.map((node) => [node.id, node] as const));
  const startTarget = input.connections.find(
    (connection) => connection.source === PHOTO_ROUTER_START_NODE_ID,
  )?.target;
  if (startTarget) {
    const startNode = nodeById.get(startTarget);
    if (startNode && isPhotoRouterPhotoOrientationNode(startNode)) {
      return startNode;
    }
  }

  return (
    input.nodes.find((node): node is PhotoRouterPhotoOrientationNode =>
      isPhotoRouterPhotoOrientationNode(node),
    ) ?? null
  );
}

function deriveLegacyBranchesFromPrimaryAction(input: {
  nodesById: Map<string, PhotoRouterGraphNode>;
  connections: PhotoRouterConnection[];
  actionNode: PhotoRouterPhotoOrientationNode | null;
}): Pick<PhotoRouterBlock, "fallback" | "portrait" | "landscape"> {
  const nextBySourceHandle = new Map<string, string>();
  for (const connection of input.connections) {
    nextBySourceHandle.set(
      `${connection.source}::${connection.sourceHandle?.trim() || "default"}`,
      connection.target,
    );
  }

  const readBranch = (headId: string | null | undefined): PhotoRouterStep[] => {
    const result: PhotoRouterStep[] = [];
    const visited = new Set<string>();
    let currentId = headId ?? null;

    while (currentId && currentId !== PHOTO_ROUTER_END_NODE_ID && !visited.has(currentId)) {
      const currentNode = input.nodesById.get(currentId);
      if (!currentNode || !isPhotoRouterLayoutGraphNode(currentNode)) {
        break;
      }
      result.push(toPhotoRouterStepFromLayoutGraphNode(currentNode));
      visited.add(currentId);
      currentId =
        nextBySourceHandle.get(`${currentId}::${PHOTO_ROUTER_NEXT_HANDLE}`) ?? null;
    }

    return result;
  };

  return {
    fallback: photoRouterFallbackBranchSchema.parse({
      steps:
        readBranch(
          input.actionNode
            ? nextBySourceHandle.get(`${input.actionNode.id}::fallback`)
            : null,
        ).length > 0
          ? readBranch(
              input.actionNode
                ? nextBySourceHandle.get(`${input.actionNode.id}::fallback`)
                : null,
            )
          : readBranch(
              input.actionNode
                ? nextBySourceHandle.get(`${input.actionNode.id}::landscape`)
                : null,
            ),
    }),
    portrait: photoRouterConditionalBranchSchema.parse({
      enabled: input.actionNode ? true : false,
      conditionType:
        input.actionNode?.portrait.conditionType?.trim() || PORTRAIT_CONDITION_TYPE,
      conditionParams: toLogicParams(input.actionNode?.portrait.conditionParams),
      steps: readBranch(
        input.actionNode
          ? nextBySourceHandle.get(`${input.actionNode.id}::portrait`)
          : null,
      ),
    }),
    landscape: photoRouterConditionalBranchSchema.parse({
      enabled: false,
      conditionType: LANDSCAPE_CONDITION_TYPE,
      conditionParams: {},
      steps: [],
    }),
  };
}

function buildNormalizedPhotoRouterGraph(input: {
  block: PhotoRouterBlock;
  knownLayoutNames: Set<string> | null;
}): PhotoRouterBlock {
  const routerId = input.block.id.trim() || DEFAULT_PHOTO_ROUTER_BLOCK_ID;
  const fallback = normalizePhotoRouterFallbackBranch(input.block.fallback);
  const portrait = normalizePhotoRouterConditionalBranch({
    branch: input.block.portrait,
    defaultConditionType: PORTRAIT_CONDITION_TYPE,
  });
  const landscape = normalizePhotoRouterConditionalBranch({
    branch: input.block.landscape,
    defaultConditionType: LANDSCAPE_CONDITION_TYPE,
  });
  const hasNoLegacySteps =
    input.block.layoutNodes.length === 0 &&
    fallback.steps.length === 0 &&
    portrait.steps.length === 0 &&
    landscape.steps.length === 0;
  const hasNoExplicitConnections = input.block.connections.length === 0;
  const hasOnlyBoundaryPositions = Object.keys(input.block.nodePositions).every(
    (nodeId) =>
      nodeId === PHOTO_ROUTER_START_NODE_ID || nodeId === PHOTO_ROUTER_END_NODE_ID,
  );
  const isExplicitEmptyGraphState =
    input.block.nodes.length === 0 &&
    hasNoLegacySteps &&
    hasNoExplicitConnections &&
    hasOnlyBoundaryPositions;

  if (isExplicitEmptyGraphState) {
    return photoRouterBlockSchema.parse({
      ...input.block,
      id: routerId,
      nodes: [],
      layoutNodes: [],
      connections: [],
      nodePositions: normalizePhotoRouterGraphNodePositions({
        nodePositions: input.block.nodePositions,
        knownNodeIds: new Set<string>(),
      }),
      fallback: {
        steps: [],
      },
      portrait: {
        ...portrait,
        steps: [],
      },
      landscape: {
        enabled: false,
        conditionType: LANDSCAPE_CONDITION_TYPE,
        conditionParams: {},
        steps: [],
      },
    });
  }

  const explicitNodeIds = new Set(input.block.nodes.map((node) => node.id));
  const hasGraphState =
    input.block.nodes.length > 0 &&
    input.block.layoutNodes.every((step) => explicitNodeIds.has(step.id)) &&
    input.block.connections.every((connection) => {
      const sourceValid =
        connection.source === PHOTO_ROUTER_START_NODE_ID ||
        explicitNodeIds.has(connection.source);
      const targetValid =
        connection.target === PHOTO_ROUTER_END_NODE_ID ||
        explicitNodeIds.has(connection.target);
      return sourceValid && targetValid;
    });

  const legacyGraphState = buildLegacyPhotoRouterGraphState({
    block: input.block,
    routerId,
    fallback,
    portrait,
    landscape,
  });

  const rawNodes = (hasGraphState ? input.block.nodes : legacyGraphState.nodes)
    .map(normalizePhotoRouterGraphNode)
    .filter((node) =>
      isPhotoRouterLayoutGraphNode(node) && input.knownLayoutNames
        ? input.knownLayoutNames.has(node.layoutName)
        : true,
    );

  const seenNodeIds = new Set<string>();
  const nodes = rawNodes.filter((node) => {
    if (seenNodeIds.has(node.id)) {
      return false;
    }
    seenNodeIds.add(node.id);
    return true;
  });

  const nodesById = new Map(nodes.map((node) => [node.id, node] as const));
  const connections = sanitizePhotoRouterGraphConnections({
    connections: hasGraphState ? input.block.connections : legacyGraphState.connections,
    nodesById,
  });
  const nodePositions = normalizePhotoRouterGraphNodePositions({
    nodePositions: input.block.nodePositions,
    knownNodeIds: new Set(nodes.map((node) => node.id)),
  });
  const primaryActionNode = getPrimaryPhotoOrientationNodeFromGraph({
    nodes,
    connections,
  });
  const legacyBranches = deriveLegacyBranchesFromPrimaryAction({
    nodesById,
    connections,
    actionNode: primaryActionNode,
  });
  const layoutNodes = nodes
    .filter((node): node is PhotoRouterLayoutNode => isPhotoRouterLayoutGraphNode(node))
    .map(toPhotoRouterStepFromLayoutGraphNode);

  return photoRouterBlockSchema.parse({
    ...input.block,
    id: routerId,
    nodes,
    title:
      primaryActionNode?.title?.trim() ||
      input.block.title?.trim() ||
      DEFAULT_PHOTO_ROUTER_BLOCK_TITLE,
    photoActionType:
      primaryActionNode?.photoActionType?.trim() ||
      input.block.photoActionType?.trim() ||
      DEFAULT_PHOTO_ACTION_TYPE,
    photoActionCollectionId:
      primaryActionNode?.photoActionCollectionId ?? input.block.photoActionCollectionId ?? null,
    layoutNodes,
    connections,
    nodePositions,
    fallback: legacyBranches.fallback,
    portrait: legacyBranches.portrait,
    landscape: legacyBranches.landscape,
  });
}

function createDefaultPhotoRouterGraphBlock(input?: {
  fallbackLayoutName?: string | null;
  photoActionType?: string | null;
  photoActionCollectionId?: string | null;
}): PhotoRouterBlock {
  const fallbackLayoutName = input?.fallbackLayoutName?.trim() ?? "";
  const fallbackStep =
    fallbackLayoutName.length > 0
      ? photoRouterStepSchema.parse({
          id: toPhotoRouterStepId("fallback", 0),
          layoutName: fallbackLayoutName,
          cycleSeconds: DEFAULT_TARGET_CYCLE_SECONDS,
          actionType: DEFAULT_ACTION_TYPE,
          actionParams: {},
        })
      : null;
  const actionNode = createPhotoOrientationActionNode({
    id: DEFAULT_PHOTO_ROUTER_BLOCK_ID,
    title: DEFAULT_PHOTO_ROUTER_BLOCK_TITLE,
    photoActionType: input?.photoActionType?.trim() || DEFAULT_PHOTO_ACTION_TYPE,
    photoActionCollectionId: input?.photoActionCollectionId ?? null,
    portrait: photoRouterConditionalBranchSchema.parse({
      enabled: false,
      conditionType: PORTRAIT_CONDITION_TYPE,
      conditionParams: {},
      steps: [],
    }),
    landscape: photoRouterConditionalBranchSchema.parse({
      enabled: false,
      conditionType: LANDSCAPE_CONDITION_TYPE,
      conditionParams: {},
      steps: [],
    }),
  });

  const nodes: PhotoRouterGraphNode[] = [
    actionNode,
    ...(fallbackStep ? [toPhotoRouterLayoutGraphNode(fallbackStep)] : []),
  ];
  const connections: PhotoRouterConnection[] = [
    photoRouterConnectionSchema.parse({
      id: toPhotoRouterConnectionId({
        source: PHOTO_ROUTER_START_NODE_ID,
        target: actionNode.id,
      }),
      source: PHOTO_ROUTER_START_NODE_ID,
      sourceHandle: null,
      target: actionNode.id,
    }),
    ...(fallbackStep
      ? [
          photoRouterConnectionSchema.parse({
            id: toPhotoRouterConnectionId({
              source: actionNode.id,
              sourceHandle: "fallback",
              target: fallbackStep.id,
            }),
            source: actionNode.id,
            sourceHandle: "fallback",
            target: fallbackStep.id,
          }),
          photoRouterConnectionSchema.parse({
            id: toPhotoRouterConnectionId({
              source: fallbackStep.id,
              sourceHandle: PHOTO_ROUTER_NEXT_HANDLE,
              target: PHOTO_ROUTER_END_NODE_ID,
            }),
            source: fallbackStep.id,
            sourceHandle: PHOTO_ROUTER_NEXT_HANDLE,
            target: PHOTO_ROUTER_END_NODE_ID,
          }),
        ]
      : []),
  ];

  return buildNormalizedPhotoRouterGraph({
    block: photoRouterBlockSchema.parse({
      id: DEFAULT_PHOTO_ROUTER_BLOCK_ID,
      type: "photo-router",
      nodes,
      title: DEFAULT_PHOTO_ROUTER_BLOCK_TITLE,
      photoActionType: actionNode.photoActionType,
      photoActionCollectionId: actionNode.photoActionCollectionId,
      layoutNodes: fallbackStep ? [fallbackStep] : [],
      connections,
      nodePositions: {},
      fallback: {
        steps: fallbackStep ? [fallbackStep] : [],
      },
      portrait: {
        enabled: false,
        conditionType: PORTRAIT_CONDITION_TYPE,
        conditionParams: {},
        steps: [],
      },
      landscape: {
        enabled: false,
        conditionType: LANDSCAPE_CONDITION_TYPE,
        conditionParams: {},
        steps: [],
      },
    }),
    knownLayoutNames: null,
  });
}

const toAutoTargetFromPhotoRouterStep = (input: {
  step: PhotoRouterStep;
  trigger: AutoLayoutTargetTrigger;
  conditionType?: string | null;
  conditionParams?: Record<string, unknown>;
}): AutoLayoutTarget => ({
  layoutName: input.step.layoutName,
  trigger: input.trigger,
  cycleSeconds: clampCycleSeconds(input.step.cycleSeconds),
  actionType: input.step.actionType,
  actionParams: toLogicParams(input.step.actionParams),
  conditionType:
    input.trigger === "always"
      ? null
      : input.conditionType?.trim() ||
        (input.trigger === "portrait-photo"
          ? PORTRAIT_CONDITION_TYPE
          : LANDSCAPE_CONDITION_TYPE),
  conditionParams: input.trigger === "always" ? {} : toLogicParams(input.conditionParams),
});

function toPhotoCollectionActionParams(
  collectionId: string | null | undefined,
): Record<string, unknown> {
  return collectionId ? { [PHOTO_COLLECTION_ACTION_PARAM_KEY]: collectionId } : {};
}

function getPhotoCollectionIdFromLogicParams(
  params: Record<string, unknown> | null | undefined,
): string | null {
  if (!params || typeof params !== "object") {
    return null;
  }
  const parsed = photoCollectionIdSchema.safeParse(
    params[PHOTO_COLLECTION_ACTION_PARAM_KEY],
  );
  return parsed.success ? parsed.data : null;
}

function getPhotoRouterConnectionTarget(input: {
  connectionsBySourceHandle: Map<string, string>;
  source: string;
  sourceHandle?: string | null;
}): string | null {
  return (
    input.connectionsBySourceHandle.get(
      `${input.source}::${input.sourceHandle?.trim() || "default"}`,
    ) ?? null
  );
}

function compilePhotoRouterGraphToLogicGraph(input: PhotoRouterBlock): LayoutSetLogicGraph {
  const block = normalizePhotoRouterBlock({
    block: photoRouterBlockSchema.parse(input),
  });
  const nodeById = new Map(block.nodes.map((node) => [node.id, node] as const));
  const connectionsBySourceHandle = new Map<string, string>();
  for (const connection of block.connections) {
    connectionsBySourceHandle.set(
      `${connection.source}::${connection.sourceHandle?.trim() || "default"}`,
      connection.target,
    );
  }

  const nodes: LayoutSetLogicNode[] = [
    {
      id: "start",
      type: "start",
    },
    {
      id: "return",
      type: "return",
    },
  ];
  const edges: LayoutSetLogicEdge[] = [];
  const runtimeNodeIds = new Set(nodes.map((node) => node.id));
  const runtimeEdgeIds = new Set<string>();
  const compiledEntries = new Map<string, string>();
  const compilingNodeIds = new Set<string>();

  const appendNode = (node: LayoutSetLogicNode) => {
    if (runtimeNodeIds.has(node.id)) {
      return;
    }
    runtimeNodeIds.add(node.id);
    nodes.push(node);
  };

  const appendEdge = (edge: LayoutSetLogicEdge) => {
    if (runtimeEdgeIds.has(edge.id)) {
      return;
    }
    runtimeEdgeIds.add(edge.id);
    edges.push(edge);
  };

  const compileTarget = (targetId: string | null | undefined): string => {
    if (!targetId || targetId === PHOTO_ROUTER_END_NODE_ID) {
      return "return";
    }
    return compileNode(targetId);
  };

  const compileNode = (graphNodeId: string): string => {
    const cached = compiledEntries.get(graphNodeId);
    if (cached) {
      return cached;
    }
    if (compilingNodeIds.has(graphNodeId)) {
      return "return";
    }

    const graphNode = nodeById.get(graphNodeId);
    if (!graphNode) {
      return "return";
    }

    compilingNodeIds.add(graphNodeId);

    if (isPhotoRouterLayoutGraphNode(graphNode)) {
      const runtimeId = `display:${graphNode.id}`;
      appendNode(
        toDisplayNode({
          id: runtimeId,
          layoutName: graphNode.layoutName,
          cycleSeconds: graphNode.cycleSeconds,
          actionType: graphNode.actionType,
          actionParams: toLogicParams(graphNode.actionParams),
          conditionType: null,
          conditionParams: {},
        }),
      );

      appendEdge(
        toEdge({
          id: `edge-${runtimeId}-next`,
          from: runtimeId,
          to: compileTarget(
            getPhotoRouterConnectionTarget({
              connectionsBySourceHandle,
              source: graphNode.id,
              sourceHandle: PHOTO_ROUTER_NEXT_HANDLE,
            }),
          ),
        }),
      );

      compiledEntries.set(graphNodeId, runtimeId);
      compilingNodeIds.delete(graphNodeId);
      return runtimeId;
    }

    const selectId = `select-photo:${graphNode.id}`;
    appendNode({
      id: selectId,
      type: "select-photo",
      actionType: graphNode.photoActionType,
      actionParams: toPhotoCollectionActionParams(graphNode.photoActionCollectionId),
    });

    const defaultTarget = compileTarget(
      getPhotoRouterConnectionTarget({
        connectionsBySourceHandle,
        source: graphNode.id,
        sourceHandle: "fallback",
      }),
    );

    const conditionTrigger =
      resolveConditionTrigger("if-portrait", graphNode.portrait.conditionType) ??
      "portrait-photo";
    const conditionNodeType =
      conditionTrigger === "landscape-photo" ? "if-landscape" : "if-portrait";
    const conditionNodeId = `${conditionNodeType}:${graphNode.id}`;
    appendNode({
      id: conditionNodeId,
      type: conditionNodeType,
      conditionType:
        graphNode.portrait.conditionType?.trim() ||
        (conditionTrigger === "landscape-photo"
          ? LANDSCAPE_CONDITION_TYPE
          : PORTRAIT_CONDITION_TYPE),
      conditionParams: toLogicParams(graphNode.portrait.conditionParams),
    });
    appendEdge(
      toEdge({
        id: `edge-${selectId}-condition`,
        from: selectId,
        to: conditionNodeId,
      }),
    );
    const portraitTargetId = getPhotoRouterConnectionTarget({
      connectionsBySourceHandle,
      source: graphNode.id,
      sourceHandle: "portrait",
    });
    appendEdge(
      toEdge({
        id: `edge-${conditionNodeId}-yes`,
        from: conditionNodeId,
        to: portraitTargetId ? compileTarget(portraitTargetId) : defaultTarget,
        when: "yes",
      }),
    );
    appendEdge(
      toEdge({
        id: `edge-${conditionNodeId}-no`,
        from: conditionNodeId,
        to: defaultTarget,
        when: "no",
      }),
    );

    compiledEntries.set(graphNodeId, selectId);
    compilingNodeIds.delete(graphNodeId);
    return selectId;
  };

  const startTarget = getPhotoRouterConnectionTarget({
    connectionsBySourceHandle,
    source: PHOTO_ROUTER_START_NODE_ID,
  });
  appendEdge(
    toEdge({
      id: "edge-start-entry",
      from: "start",
      to: compileTarget(startTarget),
    }),
  );

  return layoutSetLogicGraphSchema.parse({
    version: 1,
    entryNodeId: "start",
    nodes,
    edges,
  });
}

export const compilePhotoRouterBlockToLogicGraph = (
  input: PhotoRouterBlock,
): LayoutSetLogicGraph => {
  return compilePhotoRouterGraphToLogicGraph(input);
};

export const compileLayoutSetAuthoringToLogicGraph = (
  input: LayoutSetAuthoring | null | undefined,
): LayoutSetLogicGraph =>
  compilePhotoRouterBlockToLogicGraph(getPrimaryPhotoRouterBlock(input));

export const deriveLayoutSetAuthoringFromLogicGraph = (input: {
  logicGraph: LayoutSetLogicGraph;
  photoActionType?: string | null;
  photoActionCollectionId?: string | null;
}): LayoutSetAuthoring => {
  const branches = getLayoutSetLogicBranches(input.logicGraph);
  const defaultRules =
    branches.alwaysRules.length > 0
      ? branches.alwaysRules
      : branches.landscapeRules;

  const toStep = (
    step: AutoLayoutTarget,
    branch: "fallback" | "portrait" | "landscape",
    index: number,
  ): PhotoRouterStep =>
    photoRouterStepSchema.parse({
      id: toPhotoRouterStepId(branch, index),
      layoutName: step.layoutName,
      cycleSeconds: clampCycleSeconds(step.cycleSeconds),
      actionType: step.actionType ?? DEFAULT_ACTION_TYPE,
      actionParams: toLogicParams(step.actionParams),
    });

  return layoutSetAuthoringSchema.parse({
    version: 1,
    blocks: [
      buildNormalizedPhotoRouterGraph({
        block: photoRouterBlockSchema.parse({
          id: DEFAULT_PHOTO_ROUTER_BLOCK_ID,
          type: "photo-router",
          nodes: [],
          title: DEFAULT_PHOTO_ROUTER_BLOCK_TITLE,
          photoActionType: input.photoActionType?.trim() || DEFAULT_PHOTO_ACTION_TYPE,
          photoActionCollectionId: input.photoActionCollectionId ?? null,
          layoutNodes: buildPhotoRouterLayoutNodesFromBranches({
            fallback: {
              steps: defaultRules.map((rule, index) =>
                toStep(rule, "fallback", index),
              ),
            },
            portrait: {
              enabled: branches.portraitRules.length > 0,
              conditionType:
                branches.portraitRules[0]?.conditionType?.trim() ||
                PORTRAIT_CONDITION_TYPE,
              conditionParams: toLogicParams(branches.portraitRules[0]?.conditionParams),
              steps: branches.portraitRules.map((rule, index) =>
                toStep(rule, "portrait", index),
              ),
            },
            landscape: {
              enabled: false,
              conditionType: LANDSCAPE_CONDITION_TYPE,
              conditionParams: {},
              steps: [],
            },
          }),
          connections: buildPhotoRouterConnectionsFromBranchSteps({
            routerId: DEFAULT_PHOTO_ROUTER_BLOCK_ID,
            fallback: {
              steps: defaultRules.map((rule, index) =>
                toStep(rule, "fallback", index),
              ),
            },
            portrait: {
              enabled: branches.portraitRules.length > 0,
              conditionType:
                branches.portraitRules[0]?.conditionType?.trim() ||
                PORTRAIT_CONDITION_TYPE,
              conditionParams: toLogicParams(branches.portraitRules[0]?.conditionParams),
              steps: branches.portraitRules.map((rule, index) =>
                toStep(rule, "portrait", index),
              ),
            },
            landscape: {
              enabled: false,
              conditionType: LANDSCAPE_CONDITION_TYPE,
              conditionParams: {},
              steps: [],
            },
          }),
          nodePositions: {},
          fallback: {
            steps: defaultRules.map((rule, index) =>
              toStep(rule, "fallback", index),
            ),
          },
          portrait: {
            enabled: branches.portraitRules.length > 0,
            conditionType:
              branches.portraitRules[0]?.conditionType?.trim() ||
              PORTRAIT_CONDITION_TYPE,
            conditionParams: toLogicParams(branches.portraitRules[0]?.conditionParams),
            steps: branches.portraitRules.map((rule, index) =>
              toStep(rule, "portrait", index),
            ),
          },
          landscape: {
            enabled: false,
            conditionType: LANDSCAPE_CONDITION_TYPE,
            conditionParams: {},
            steps: [],
          },
        }),
        knownLayoutNames: null,
      }),
    ],
  });
};

export const isDefaultLayoutSetLogicGraph = (
  input: LayoutSetLogicGraph,
): boolean => {
  const graph = layoutSetLogicGraphSchema.parse(input);
  if (graph.entryNodeId !== "start") {
    return false;
  }
  if (graph.nodes.length !== 2 || graph.edges.length !== 1) {
    return false;
  }

  const nodeTypes = new Map(graph.nodes.map((node) => [node.id, node.type]));
  if (nodeTypes.get("start") !== "start" || nodeTypes.get("return") !== "return") {
    return false;
  }

  const edge = graph.edges[0];
  return edge.from === "start" && edge.to === "return" && edge.when === "always";
};

export interface LayoutSetLogicBranches {
  alwaysRules: AutoLayoutTarget[];
  portraitRules: AutoLayoutTarget[];
  landscapeRules: AutoLayoutTarget[];
}

const toLogicParams = (input: unknown): Record<string, unknown> => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return layoutLogicParamsSchema.parse({});
  }

  return layoutLogicParamsSchema.parse(input);
};

const toCanonicalRule = (
  input: AutoLayoutTarget,
  expectedTrigger: AutoLayoutTargetTrigger,
): AutoLayoutTarget | null => {
  const layoutName = input.layoutName.trim();
  if (!layoutName) {
    return null;
  }

  const actionType = (input.actionType ?? DEFAULT_ACTION_TYPE).trim();
  const actionParams = toLogicParams(input.actionParams);
  const explicitConditionType =
    typeof input.conditionType === "string" ? input.conditionType.trim() : null;
  const conditionParams = toLogicParams(input.conditionParams);
  const defaultConditionType =
    expectedTrigger === "portrait-photo"
      ? PORTRAIT_CONDITION_TYPE
      : expectedTrigger === "landscape-photo"
        ? LANDSCAPE_CONDITION_TYPE
        : null;

  return {
    layoutName,
    trigger: expectedTrigger,
    cycleSeconds: clampCycleSeconds(
      input.cycleSeconds ?? DEFAULT_TARGET_CYCLE_SECONDS,
    ),
    actionType: actionType.length > 0 ? actionType : DEFAULT_ACTION_TYPE,
    actionParams,
    conditionType:
      expectedTrigger === "always"
        ? null
        : (explicitConditionType && explicitConditionType.length > 0
            ? explicitConditionType
            : defaultConditionType),
    conditionParams: expectedTrigger === "always" ? {} : conditionParams,
  };
};

const normalizeBranchRules = (
  rules: AutoLayoutTarget[],
  expectedTrigger: AutoLayoutTargetTrigger,
): AutoLayoutTarget[] => {
  const normalized: AutoLayoutTarget[] = [];
  for (const rule of rules) {
    const next = toCanonicalRule(rule, expectedTrigger);
    if (next) {
      normalized.push(next);
    }
  }
  return normalized;
};

const parseNodeIndex = (nodeId: string, prefix: string): number => {
  const raw = nodeId.slice(prefix.length);
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
};

const extractRulesFromPrefix = (
  graph: LayoutSetLogicGraph,
  prefix: string,
  trigger: AutoLayoutTargetTrigger,
): AutoLayoutTarget[] => {
  return [...graph.nodes]
    .filter((node) => node.type === "display" && node.id.startsWith(prefix))
    .sort(
      (left, right) =>
        parseNodeIndex(left.id, prefix) - parseNodeIndex(right.id, prefix),
    )
    .map((node) => ({
      layoutName: node.layoutName?.trim() ?? "",
      trigger,
      cycleSeconds: clampCycleSeconds(
        node.cycleSeconds ?? DEFAULT_TARGET_CYCLE_SECONDS,
      ),
      actionType: node.actionType?.trim() || DEFAULT_ACTION_TYPE,
      actionParams: toLogicParams(node.actionParams),
      conditionType:
        trigger === "always"
          ? null
          : node.conditionType?.trim() ||
            (trigger === "portrait-photo"
              ? PORTRAIT_CONDITION_TYPE
              : LANDSCAPE_CONDITION_TYPE),
      conditionParams: trigger === "always" ? {} : toLogicParams(node.conditionParams),
    }))
    .filter((rule) => rule.layoutName.length > 0);
};

export const getLayoutSetLogicBranches = (
  input: LayoutSetLogicGraph,
): LayoutSetLogicBranches => {
  const graph = layoutSetLogicGraphSchema.parse(input);
  const toTriggeredRules = (
    sequence: AutoLayoutTarget[],
    trigger: AutoLayoutTargetTrigger,
  ): AutoLayoutTarget[] =>
    normalizeBranchRules(
      sequence.map((target) => ({
        ...target,
        trigger,
      })),
      trigger,
    );

  return {
    alwaysRules: toTriggeredRules(
      resolveDisplaySequenceFromLogicGraph({
        graph,
        orientation: null,
      }),
      "always",
    ),
    portraitRules: toTriggeredRules(
      resolveDisplaySequenceFromLogicGraph({
        graph,
        orientation: "portrait",
      }),
      "portrait-photo",
    ),
    landscapeRules: toTriggeredRules(
      resolveDisplaySequenceFromLogicGraph({
        graph,
        orientation: "landscape",
      }),
      "landscape-photo",
    ),
  };
};

const toDisplayNode = (input: {
  id: string;
  layoutName: string;
  cycleSeconds: number;
  actionType: string;
  actionParams: Record<string, unknown>;
  conditionType: string | null;
  conditionParams: Record<string, unknown>;
}): LayoutSetLogicNode => ({
  id: input.id,
  type: "display",
  layoutName: input.layoutName,
  cycleSeconds: clampCycleSeconds(input.cycleSeconds),
  actionType: input.actionType,
  actionParams: input.actionParams,
  conditionType: input.conditionType,
  conditionParams: input.conditionParams,
});

const toEdge = (input: {
  id: string;
  from: string;
  to: string;
  when?: "always" | "yes" | "no";
}): LayoutSetLogicEdge => ({
  id: input.id,
  from: input.from,
  to: input.to,
  when: input.when ?? "always",
});

export const createLayoutSetLogicGraphFromBranches = (
  input: LayoutSetLogicBranches,
): LayoutSetLogicGraph => {
  const alwaysRules = normalizeBranchRules(input.alwaysRules, "always");
  const portraitRules = normalizeBranchRules(
    input.portraitRules,
    "portrait-photo",
  );
  const landscapeRules = normalizeBranchRules(
    input.landscapeRules,
    "landscape-photo",
  );

  const hasPortrait = portraitRules.length > 0;
  const hasLandscape = landscapeRules.length > 0;
  const hasFallback = alwaysRules.length > 0;

  const nodes: LayoutSetLogicNode[] = [
    {
      id: "start",
      type: "start",
    },
    {
      id: "select-photo",
      type: "select-photo",
    },
    {
      id: "return",
      type: "return",
    },
  ];
  const edges: LayoutSetLogicEdge[] = [
    toEdge({
      id: "edge-start-photo",
      from: "start",
      to: "select-photo",
    }),
  ];

  if (hasPortrait) {
    nodes.push({
      id: "if-portrait",
      type: "if-portrait",
      conditionType:
        portraitRules[0]?.conditionType ?? PORTRAIT_CONDITION_TYPE,
      conditionParams: portraitRules[0]?.conditionParams ?? {},
    });
  }

  if (hasLandscape) {
    nodes.push({
      id: "if-landscape",
      type: "if-landscape",
      conditionType:
        landscapeRules[0]?.conditionType ?? LANDSCAPE_CONDITION_TYPE,
      conditionParams: landscapeRules[0]?.conditionParams ?? {},
    });
  }

  if (hasFallback) {
    nodes.push({
      id: "if-else",
      type: "else",
    });
  }

  const addRuleNodes = (branchInput: {
    prefix: string;
    rules: AutoLayoutTarget[];
  }): string[] => {
    const ids: string[] = [];
    for (let index = 0; index < branchInput.rules.length; index += 1) {
      const rule = branchInput.rules[index];
      const id = `${branchInput.prefix}${index}`;
      ids.push(id);
      nodes.push(
        toDisplayNode({
          id,
          layoutName: rule.layoutName,
          cycleSeconds: rule.cycleSeconds,
          actionType: rule.actionType ?? DEFAULT_ACTION_TYPE,
          actionParams: rule.actionParams ?? {},
          conditionType:
            rule.conditionType ??
            (rule.trigger === "portrait-photo"
              ? PORTRAIT_CONDITION_TYPE
              : rule.trigger === "landscape-photo"
                ? LANDSCAPE_CONDITION_TYPE
                : null),
          conditionParams: rule.conditionParams ?? {},
        }),
      );
    }
    return ids;
  };

  const portraitNodeIds = addRuleNodes({
    prefix: "display-portrait-",
    rules: portraitRules,
  });
  const landscapeNodeIds = addRuleNodes({
    prefix: "display-landscape-",
    rules: landscapeRules,
  });
  const fallbackNodeIds = addRuleNodes({
    prefix: "display-fallback-",
    rules: alwaysRules,
  });

  const fallbackEntryNode = hasFallback ? "if-else" : "return";
  const landscapeEntryNode = hasLandscape ? "if-landscape" : fallbackEntryNode;

  if (hasPortrait) {
    edges.push(
      toEdge({
        id: "edge-photo-portrait",
        from: "select-photo",
        to: "if-portrait",
      }),
      toEdge({
        id: "edge-portrait-yes",
        from: "if-portrait",
        to: portraitNodeIds[0] ?? landscapeEntryNode,
        when: "yes",
      }),
      toEdge({
        id: "edge-portrait-no",
        from: "if-portrait",
        to: landscapeEntryNode,
        when: "no",
      }),
    );
  } else if (hasLandscape) {
    edges.push(
      toEdge({
        id: "edge-photo-landscape",
        from: "select-photo",
        to: "if-landscape",
      }),
    );
  } else if (hasFallback) {
    edges.push(
      toEdge({
        id: "edge-photo-else",
        from: "select-photo",
        to: "if-else",
      }),
    );
  } else {
    edges.push(
      toEdge({
        id: "edge-photo-return",
        from: "select-photo",
        to: "return",
      }),
    );
  }

  if (hasLandscape) {
    edges.push(
      toEdge({
        id: "edge-landscape-yes",
        from: "if-landscape",
        to: landscapeNodeIds[0] ?? fallbackEntryNode,
        when: "yes",
      }),
      toEdge({
        id: "edge-landscape-no",
        from: "if-landscape",
        to: fallbackEntryNode,
        when: "no",
      }),
    );
  }

  if (hasFallback) {
    edges.push(
      toEdge({
        id: "edge-else-fallback",
        from: "if-else",
        to: fallbackNodeIds[0] ?? "return",
      }),
    );
  }

  const connectChain = (nodeIds: string[], prefix: string) => {
    if (nodeIds.length === 0) {
      return;
    }

    for (let index = 0; index < nodeIds.length - 1; index += 1) {
      edges.push(
        toEdge({
          id: `${prefix}-chain-${index}`,
          from: nodeIds[index],
          to: nodeIds[index + 1],
        }),
      );
    }

    edges.push(
      toEdge({
        id: `${prefix}-return`,
        from: nodeIds[nodeIds.length - 1],
        to: "return",
      }),
    );
  };

  connectChain(portraitNodeIds, "portrait");
  connectChain(landscapeNodeIds, "landscape");
  connectChain(fallbackNodeIds, "fallback");

  return layoutSetLogicGraphSchema.parse({
    version: 1,
    entryNodeId: "start",
    nodes,
    edges,
  });
};

export const createLayoutSetLogicGraphFromTargets = (
  targets: AutoLayoutTarget[],
): LayoutSetLogicGraph => {
  const alwaysRules = normalizeBranchRules(
    targets.filter((target) => target.trigger === "always"),
    "always",
  );
  const portraitRules = normalizeBranchRules(
    targets.filter((target) => target.trigger === "portrait-photo"),
    "portrait-photo",
  );
  const landscapeRules = normalizeBranchRules(
    targets.filter((target) => target.trigger === "landscape-photo"),
    "landscape-photo",
  );

  return createLayoutSetLogicGraphFromBranches({
    alwaysRules,
    portraitRules,
    landscapeRules,
  });
};

export const toAutoLayoutTargetsFromLogicGraph = (
  input: LayoutSetLogicGraph,
): AutoLayoutTarget[] => {
  const { alwaysRules, portraitRules, landscapeRules } =
    getLayoutSetLogicBranches(input);

  return [...alwaysRules, ...portraitRules, ...landscapeRules];
};

const getOutgoingEdges = (
  graph: LayoutSetLogicGraph,
): Map<string, LayoutSetLogicEdge[]> => {
  const grouped = new Map<string, LayoutSetLogicEdge[]>();
  for (const edge of graph.edges) {
    const current = grouped.get(edge.from);
    if (current) {
      current.push(edge);
      continue;
    }
    grouped.set(edge.from, [edge]);
  }
  return grouped;
};

export interface LayoutSetLogicEdgeState {
  edgeOverrides: Record<string, LayoutSetLogicEdgeOverride>;
  disconnectedEdgeIds: string[];
}

export const normalizeLayoutSetLogicEdgeState = (input: {
  graph: LayoutSetLogicGraph;
  edgeOverrides?: Record<string, LayoutSetLogicEdgeOverride> | null;
  disconnectedEdgeIds?: string[] | null;
}): LayoutSetLogicEdgeState => {
  const graph = layoutSetLogicGraphSchema.parse(input.graph);
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const edgeIds = new Set(graph.edges.map((edge) => edge.id));

  const edgeOverrides: Record<string, LayoutSetLogicEdgeOverride> = {};
  for (const [edgeId, overrideInput] of Object.entries(input.edgeOverrides ?? {})) {
    if (!edgeIds.has(edgeId)) {
      continue;
    }
    const parsedOverride = layoutSetLogicEdgeOverrideSchema.safeParse(overrideInput);
    if (!parsedOverride.success) {
      continue;
    }
    const override = parsedOverride.data;
    if (!nodeIds.has(override.source) || !nodeIds.has(override.target)) {
      continue;
    }
    edgeOverrides[edgeId] = override;
  }

  const disconnectedEdgeIds: string[] = [];
  const seenDisconnectedIds = new Set<string>();
  for (const edgeId of input.disconnectedEdgeIds ?? []) {
    const parsedEdgeId = logicEdgeIdSchema.safeParse(edgeId);
    if (!parsedEdgeId.success) {
      continue;
    }
    const normalizedEdgeId = parsedEdgeId.data;
    if (!edgeIds.has(normalizedEdgeId) || seenDisconnectedIds.has(normalizedEdgeId)) {
      continue;
    }
    seenDisconnectedIds.add(normalizedEdgeId);
    disconnectedEdgeIds.push(normalizedEdgeId);
  }

  return {
    edgeOverrides,
    disconnectedEdgeIds,
  };
};

export const applyLayoutSetLogicEdgeState = (input: {
  graph: LayoutSetLogicGraph;
  edgeOverrides?: Record<string, LayoutSetLogicEdgeOverride> | null;
  disconnectedEdgeIds?: string[] | null;
}): LayoutSetLogicGraph => {
  const graph = layoutSetLogicGraphSchema.parse(input.graph);
  const normalizedEdgeState = normalizeLayoutSetLogicEdgeState({
    graph,
    edgeOverrides: input.edgeOverrides,
    disconnectedEdgeIds: input.disconnectedEdgeIds,
  });
  const disconnectedEdgeIds = new Set(normalizedEdgeState.disconnectedEdgeIds);

  const edges = graph.edges
    .filter((edge) => !disconnectedEdgeIds.has(edge.id))
    .map((edge) => {
      const override = normalizedEdgeState.edgeOverrides[edge.id];
      if (!override) {
        return edge;
      }
      return {
        ...edge,
        from: override.source,
        to: override.target,
      };
    });

  return layoutSetLogicGraphSchema.parse({
    ...graph,
    edges,
  });
};

export interface LayoutLogicConditionEvaluationInput {
  conditionType: string | null;
  conditionParams: Record<string, unknown>;
  trigger: Exclude<AutoLayoutTargetTrigger, "always">;
  orientation: "portrait" | "landscape" | null;
}

export interface LayoutLogicActionResolutionInput {
  actionType: string;
  actionParams: Record<string, unknown>;
  layoutName: string;
  cycleSeconds: number;
  orientation: "portrait" | "landscape" | null;
}

export interface LayoutLogicResolvedTarget {
  layoutName: string;
  cycleSeconds: number;
  actionParams?: Record<string, unknown>;
}

const resolveConditionTrigger = (
  nodeType: LayoutSetLogicNode["type"],
  conditionType?: string | null,
): Exclude<AutoLayoutTargetTrigger, "always"> | null => {
  const normalizedConditionType = conditionType?.trim() ?? "";

  if (normalizedConditionType === PORTRAIT_CONDITION_TYPE) {
    return "portrait-photo";
  }
  if (normalizedConditionType === LANDSCAPE_CONDITION_TYPE) {
    return "landscape-photo";
  }
  if (nodeType === "if-portrait") {
    return "portrait-photo";
  }
  if (nodeType === "if-landscape") {
    return "landscape-photo";
  }
  return null;
};

const chooseNextEdge = (input: {
  node: LayoutSetLogicNode;
  outgoing: LayoutSetLogicEdge[];
  orientation: "portrait" | "landscape" | null;
  evaluateCondition?: (
    input: LayoutLogicConditionEvaluationInput,
  ) => boolean | null | undefined;
}): LayoutSetLogicEdge | null => {
  if (input.outgoing.length === 0) {
    return null;
  }

  if (input.node.type === "if-portrait" || input.node.type === "if-landscape") {
    const trigger = resolveConditionTrigger(input.node.type, input.node.conditionType);
    const fallbackExpected =
      trigger === "landscape-photo"
        ? input.orientation === "landscape"
        : input.orientation === "portrait";
    const defaultConditionType =
      trigger === "landscape-photo"
        ? LANDSCAPE_CONDITION_TYPE
        : PORTRAIT_CONDITION_TYPE;
    const evaluated =
      trigger && input.evaluateCondition
        ? input.evaluateCondition({
            conditionType:
              input.node.conditionType?.trim() || defaultConditionType,
            conditionParams: toLogicParams(input.node.conditionParams),
            trigger,
            orientation: input.orientation,
          })
        : null;
    const expected =
      typeof evaluated === "boolean" ? (evaluated ? "yes" : "no") : fallbackExpected ? "yes" : "no";
    return (
      input.outgoing.find((edge) => edge.when === expected) ??
      input.outgoing.find((edge) => edge.when === "always") ??
      input.outgoing[0] ??
      null
    );
  }

  return (
    input.outgoing.find((edge) => edge.when === "always") ??
    input.outgoing[0] ??
    null
  );
};

const normalizeResolvedTarget = (
  input: LayoutLogicResolvedTarget,
):
  | {
      layoutName: string;
      cycleSeconds: number;
      actionParams: Record<string, unknown>;
    }
  | null => {
  const layoutName = input.layoutName.trim();
  if (layoutName.length === 0) {
    return null;
  }

  return {
    layoutName,
    cycleSeconds: clampCycleSeconds(input.cycleSeconds),
    actionParams: toLogicParams(input.actionParams),
  };
};

export const resolveDisplaySequenceFromLogicGraph = (input: {
  graph: LayoutSetLogicGraph;
  orientation: "portrait" | "landscape" | null;
  includeActivePhotoCollectionInActionParams?: boolean;
  evaluateCondition?: (
    input: LayoutLogicConditionEvaluationInput,
  ) => boolean | null | undefined;
  resolveAction?: (
    input: LayoutLogicActionResolutionInput,
  ) => LayoutLogicResolvedTarget | LayoutLogicResolvedTarget[] | null | undefined;
}): AutoLayoutTarget[] => {
  const graph = layoutSetLogicGraphSchema.parse(input.graph);
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));
  const outgoingByNode = getOutgoingEdges(graph);
  const sequence: AutoLayoutTarget[] = [];
  const visitedPerNode = new Map<string, number>();
  let currentPhotoCollectionId: string | null = null;
  let currentNodeId = graph.entryNodeId;

  for (let safety = 0; safety < 512; safety += 1) {
    const currentNode = nodeMap.get(currentNodeId);
    if (!currentNode) {
      break;
    }

    const visitCount = (visitedPerNode.get(currentNodeId) ?? 0) + 1;
    if (visitCount > 8) {
      break;
    }
    visitedPerNode.set(currentNodeId, visitCount);

    if (currentNode.type === "select-photo") {
      currentPhotoCollectionId = getPhotoCollectionIdFromLogicParams(
        toLogicParams(currentNode.actionParams),
      );
    }

    if (currentNode.type === "display") {
      const layoutName = currentNode.layoutName?.trim() ?? "";
      if (layoutName.length > 0) {
        const actionType =
          currentNode.actionType?.trim() || DEFAULT_ACTION_TYPE;
        const baseActionParams = toLogicParams(currentNode.actionParams);
        const actionParams =
          input.includeActivePhotoCollectionInActionParams &&
          currentPhotoCollectionId &&
          !getPhotoCollectionIdFromLogicParams(baseActionParams)
            ? {
                ...baseActionParams,
                [PHOTO_COLLECTION_ACTION_PARAM_KEY]: currentPhotoCollectionId,
              }
            : baseActionParams;
        const cycleSeconds = clampCycleSeconds(
          currentNode.cycleSeconds ?? DEFAULT_TARGET_CYCLE_SECONDS,
        );
        const resolved = input.resolveAction?.({
          actionType,
          actionParams,
          layoutName,
          cycleSeconds,
          orientation: input.orientation,
        });

        const resolvedTargets = Array.isArray(resolved)
          ? resolved
          : resolved
            ? [resolved]
            : [
                {
                  layoutName,
                  cycleSeconds,
                  actionParams,
                },
              ];

        for (const target of resolvedTargets) {
          const normalized = normalizeResolvedTarget(target);
          if (normalized) {
            sequence.push({
              ...normalized,
              trigger: "always",
              actionType,
              conditionType: null,
              conditionParams: {},
            });
          }
        }
      }
    }

    if (currentNode.type === "return") {
      break;
    }

    const nextEdge = chooseNextEdge({
      node: currentNode,
      outgoing: outgoingByNode.get(currentNodeId) ?? [],
      orientation: input.orientation,
      evaluateCondition: input.evaluateCondition,
    });
    if (!nextEdge) {
      break;
    }

    currentNodeId = nextEdge.to;
  }

  return sequence;
};

export const normalizeLayoutSetLogicGraph = (input: {
  graph: LayoutSetLogicGraph;
  knownLayoutNames: Set<string>;
}): LayoutSetLogicGraph => {
  const parsed = layoutSetLogicGraphSchema.parse(input.graph);
  const nodes = parsed.nodes.filter((node) =>
    node.type === "display"
      ? input.knownLayoutNames.has(node.layoutName?.trim() ?? "")
      : true,
  );
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = parsed.edges.filter(
    (edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to),
  );
  const entryNodeId = nodeIds.has(parsed.entryNodeId)
    ? parsed.entryNodeId
    : nodeIds.has("start")
      ? "start"
      : nodes[0]?.id ?? "start";

  return layoutSetLogicGraphSchema.parse({
    ...parsed,
    entryNodeId,
    nodes,
    edges,
  });
};

export const screenFamilySchema = screenSetIdSchema;
export const displayLayoutSwitchModeSchema = z.enum(["manual", "auto"]);

export const screenFamilyLayoutTargetSchema = z.object({
  name: screenSetNameSchema.default("Layout set"),
  staticLayoutName: layoutNameSchema.nullable().default(null),
  defaultPhotoCollectionId: photoCollectionIdSchema.nullable().default(null),
  photoActionCollectionId: photoCollectionIdSchema.nullable().default(null),
  photoActionType: actionTypeSchema.default("photo.select-next"),
  logicBlocks: layoutSetAuthoringSchema.default(getDefaultLayoutSetAuthoring()),
  logicGraph: layoutSetLogicGraphSchema.default(getDefaultLayoutSetLogicGraph()),
  logicNodePositions: layoutSetLogicNodePositionsSchema.default({}),
  logicEdgeOverrides: layoutSetLogicEdgeOverridesSchema.default({}),
  logicDisconnectedEdgeIds: layoutSetLogicDisconnectedEdgeIdsSchema.default([]),
  // Legacy fields kept for migration compatibility.
  autoLayoutTargets: z.array(autoLayoutTargetSchema).max(24).default([]),
  portraitPhotoLayoutName: layoutNameSchema.nullable().default(null),
  landscapePhotoLayoutName: layoutNameSchema.nullable().default(null),
  portraitPhotoLayoutNames: z.array(layoutNameSchema).max(24).default([]),
  landscapePhotoLayoutNames: z.array(layoutNameSchema).max(24).default([]),
});

export const screenFamilyLayoutTargetsSchema = z
  .record(screenFamilySchema, screenFamilyLayoutTargetSchema)
  .default({});

export const screenProfileLayoutsSchema = z.object({
  switchMode: displayLayoutSwitchModeSchema.default("auto"),
  autoCycleSeconds: z.number().int().min(3).max(3600).default(20),
  families: screenFamilyLayoutTargetsSchema.default({}),
});

export const reportScreenTargetSelectionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("set"),
    setId: screenFamilySchema.nullable().default(null),
  }),
  z.object({
    kind: z.literal("layout"),
    layoutName: layoutNameSchema.nullable().default(null),
  }),
]);

export const displayThemeIdSchema = z.enum([
  "default",
  "nord",
  "solarized",
  "monokai",
]);

export const displayDeviceIdSchema = z.string().trim().min(1).max(128);
export const displayDeviceNameSchema = z.string().trim().min(1).max(80);
export const displayDeviceIpSchema = z.string().trim().min(1).max(255);

export const displayDeviceRuntimeSchema = z.object({
  id: displayDeviceIdSchema,
  name: displayDeviceNameSchema,
  themeId: displayThemeIdSchema.default("default"),
  targetSelection: reportScreenTargetSelectionSchema.nullable().default(null),
});

export const displayDeviceSchema = displayDeviceRuntimeSchema.extend({
  createdAt: z.string(),
  updatedAt: z.string(),
  lastSeenAt: z.string(),
  lastSeenIp: displayDeviceIpSchema.nullable().default(null),
});

export const displayDevicesResponseSchema = z.object({
  devices: z.array(displayDeviceSchema).max(512).default([]),
});

export const updateDisplayDeviceRequestSchema = z.object({
  name: displayDeviceNameSchema,
  themeId: displayThemeIdSchema,
  targetSelection: reportScreenTargetSelectionSchema.nullable().default(null),
});

export const reportScreenProfileRequestSchema = z.object({
  targetSelection: reportScreenTargetSelectionSchema.optional(),
  // Legacy field kept for compatibility. Prefer targetSelection.kind === "set".
  selectedFamily: screenFamilySchema.nullable().optional().default(null),
  photoOrientation: photosOrientationSchema.nullable().optional().default(null),
  photoEventToken: z.number().int().min(0).optional(),
  reportedThemeId: displayThemeIdSchema.optional(),
  screenSessionId: z.string().trim().min(1).max(128).optional().default("default"),
});

export const reportScreenProfileReasonSchema = z.enum([
  "resolved",
  "fallback-active",
  "fallback-first",
  "no-layout",
]);

export const reportScreenProfileSetOptionSchema = z.object({
  id: screenFamilySchema,
  name: screenSetNameSchema,
});

export const reportScreenProfileLayoutOptionSchema = z.object({
  name: layoutNameSchema,
});

export const reportScreenProfileResponseSchema = z.object({
  family: screenFamilySchema,
  availableSets: z.array(reportScreenProfileSetOptionSchema).max(24).default([]),
  availableLayouts: z.array(reportScreenProfileLayoutOptionSchema).max(512).default([]),
  mode: displayLayoutSwitchModeSchema,
  autoCycleSeconds: z.number().int().min(3).max(3600),
  nextCycleAtMs: z.number().int().nonnegative().nullable(),
  selectedPhotoCollectionId: photoCollectionIdSchema.nullable(),
  requestedPhotoOrientation: photosOrientationSchema.nullable(),
  appliedPhotoOrientation: autoPhotoOrientationSchema.nullable(),
  device: displayDeviceRuntimeSchema,
  resolvedTargetSelection: reportScreenTargetSelectionSchema,
  layout: layoutRecordSchema.nullable(),
  reason: reportScreenProfileReasonSchema,
});

export type ScreenFamily = z.infer<typeof screenFamilySchema>;
export type DisplayLayoutSwitchMode = z.infer<typeof displayLayoutSwitchModeSchema>;
export type LayoutLogicParams = z.infer<typeof layoutLogicParamsSchema>;
export type AutoLayoutTargetTrigger = z.infer<typeof autoLayoutTargetTriggerSchema>;
export type AutoLayoutTarget = z.infer<typeof autoLayoutTargetSchema>;
export type ScreenFamilyLayoutTarget = z.infer<typeof screenFamilyLayoutTargetSchema>;
export type ScreenProfileLayouts = z.infer<typeof screenProfileLayoutsSchema>;
export type ReportScreenTargetSelection = z.infer<typeof reportScreenTargetSelectionSchema>;
export type DisplayThemeId = z.infer<typeof displayThemeIdSchema>;
export type DisplayDeviceId = z.infer<typeof displayDeviceIdSchema>;
export type DisplayDeviceName = z.infer<typeof displayDeviceNameSchema>;
export type DisplayDeviceRuntime = z.infer<typeof displayDeviceRuntimeSchema>;
export type DisplayDevice = z.infer<typeof displayDeviceSchema>;
export type DisplayDevicesResponse = z.infer<typeof displayDevicesResponseSchema>;
export type UpdateDisplayDeviceRequest = z.infer<typeof updateDisplayDeviceRequestSchema>;
export type ReportScreenProfileRequest = z.infer<typeof reportScreenProfileRequestSchema>;
export type ReportScreenProfileReason = z.infer<typeof reportScreenProfileReasonSchema>;
export type ReportScreenProfileSetOption = z.infer<typeof reportScreenProfileSetOptionSchema>;
export type ReportScreenProfileLayoutOption = z.infer<typeof reportScreenProfileLayoutOptionSchema>;
export type ReportScreenProfileResponse = z.infer<typeof reportScreenProfileResponseSchema>;
