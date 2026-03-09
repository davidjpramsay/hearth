import { z } from "zod";
import { layoutRecordSchema } from "./layout.js";
import {
  photoCollectionIdSchema,
  photosOrientationSchema,
} from "./modules/photos.js";

const DEFAULT_TARGET_CYCLE_SECONDS = 20;
const DEFAULT_ACTION_TYPE = "layout.display";
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

export const getDefaultLayoutSetLogicGraph = (): LayoutSetLogicGraph =>
  layoutSetLogicGraphSchema.parse(createDefaultLayoutSetLogicGraphInput());

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

  return {
    alwaysRules: extractRulesFromPrefix(graph, "display-fallback-", "always"),
    portraitRules: extractRulesFromPrefix(
      graph,
      "display-portrait-",
      "portrait-photo",
    ),
    landscapeRules: extractRulesFromPrefix(
      graph,
      "display-landscape-",
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
): Exclude<AutoLayoutTargetTrigger, "always"> | null => {
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

  if (input.node.type === "if-portrait") {
    const trigger = resolveConditionTrigger(input.node.type);
    const fallbackExpected = input.orientation === "portrait";
    const evaluated =
      trigger && input.evaluateCondition
        ? input.evaluateCondition({
            conditionType:
              input.node.conditionType?.trim() || PORTRAIT_CONDITION_TYPE,
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

  if (input.node.type === "if-landscape") {
    const trigger = resolveConditionTrigger(input.node.type);
    const fallbackExpected = input.orientation === "landscape";
    const evaluated =
      trigger && input.evaluateCondition
        ? input.evaluateCondition({
            conditionType:
              input.node.conditionType?.trim() || LANDSCAPE_CONDITION_TYPE,
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

    if (currentNode.type === "display") {
      const layoutName = currentNode.layoutName?.trim() ?? "";
      if (layoutName.length > 0) {
        const actionType =
          currentNode.actionType?.trim() || DEFAULT_ACTION_TYPE;
        const actionParams = toLogicParams(currentNode.actionParams);
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
  const branches = getLayoutSetLogicBranches(parsed);

  const normalizeKnownRules = (
    rules: AutoLayoutTarget[],
    trigger: AutoLayoutTargetTrigger,
  ): AutoLayoutTarget[] =>
    normalizeBranchRules(
      rules.filter((rule) => input.knownLayoutNames.has(rule.layoutName)),
      trigger,
    );

  const alwaysRules = normalizeKnownRules(branches.alwaysRules, "always");
  const portraitRules = normalizeKnownRules(
    branches.portraitRules,
    "portrait-photo",
  );
  const landscapeRules = normalizeKnownRules(
    branches.landscapeRules,
    "landscape-photo",
  );

  return createLayoutSetLogicGraphFromBranches({
    alwaysRules,
    portraitRules,
    landscapeRules,
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
