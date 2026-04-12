import type { Edge, Node } from "@xyflow/react";
import {
  DEFAULT_LANDSCAPE_LAYOUT_LOGIC_CONDITION_TYPE,
  DEFAULT_PORTRAIT_LAYOUT_LOGIC_CONDITION_TYPE,
  LOCAL_WARNING_CANVAS_ACTION_TYPE,
  LOCAL_WARNING_CONDITION_TYPE,
  formatClockTimeFromMinutes,
  formatPhotoRouterTimeGateWindow,
  parseClockTimeToMinutes,
  type PhotoRouterBlock,
  type PhotoRouterConnection,
  type PhotoRouterGraphNode,
  type PhotoRouterLayoutNode,
  type PhotoRouterPhotoOrientationNode,
  type PhotoRouterTimeGate,
  type PhotoRouterTimeGateNode,
} from "@hearth/shared";
import {
  getActionTypeById,
  getCanvasActionTypeById,
  getDefaultConditionTypeForTrigger,
  LOGIC_CONDITION_TYPES,
  parseActionParamsByType,
} from "../logicNodeRegistry";
import type {
  ActionNodeKind,
  ConditionalTrigger,
  PhotoCollectionOption,
  RouterNodeKind,
  RouterNodeType,
  StepNodeType,
  TerminalNodeType,
} from "./shared";
import {
  BRANCH_META,
  DEFAULT_DETACHED_ORIGIN,
  DEFAULT_DETACHED_X_GAP,
  DEFAULT_DETACHED_Y_GAP,
  DEFAULT_ROUTER_POSITION,
  DEFAULT_TIME_GATE_DURATION_MINUTES,
  EDGE_DASH_PATTERN,
  END_NODE_GAP,
  END_NODE_ID,
  GRAPH_NODE_DRAG_HANDLE_SELECTOR,
  LAYOUT_NODE_HEIGHT,
  LAYOUT_NODE_WIDTH,
  ROUTER_NODE_BASE_HEIGHT,
  ROUTER_NODE_ROUTE_ROW_HEIGHT,
  ROUTER_NODE_WIDTH,
  ROUTER_ROUTE_ORDER,
  START_NODE_GAP,
  START_NODE_ID,
  TERMINAL_NODE_SIZE,
  TIME_GATE_ROUTE_PALETTE,
} from "./shared";

export const getConditionBranchCopy = (conditionType: string | null | undefined) => {
  const normalizedConditionType = conditionType?.trim() ?? "";

  if (normalizedConditionType === DEFAULT_LANDSCAPE_LAYOUT_LOGIC_CONDITION_TYPE) {
    return {
      title: "Landscape photo",
      matchedLabel: "Landscape",
      fallbackLabel: "Not Landscape",
    };
  }

  if (normalizedConditionType === DEFAULT_PORTRAIT_LAYOUT_LOGIC_CONDITION_TYPE) {
    return {
      title: "Portrait photo",
      matchedLabel: "Portrait",
      fallbackLabel: "Not Portrait",
    };
  }

  if (normalizedConditionType === LOCAL_WARNING_CONDITION_TYPE) {
    return {
      title: "Warning check",
      matchedLabel: "Warning Active",
      fallbackLabel: "No Warning",
    };
  }

  return {
    title: "Condition branch",
    matchedLabel: "Matches",
    fallbackLabel: "Otherwise",
  };
};

export const getTimeGateRouteMeta = (index: number) =>
  TIME_GATE_ROUTE_PALETTE[index % TIME_GATE_ROUTE_PALETTE.length] ?? TIME_GATE_ROUTE_PALETTE[0]!;

export const isTimeGateNode = (node: PhotoRouterGraphNode): node is PhotoRouterTimeGateNode =>
  node.nodeType === "time-gate";

export const isLayoutGraphNode = (node: PhotoRouterGraphNode): node is PhotoRouterLayoutNode =>
  node.nodeType === "layout";

export const isPhotoOrientationNode = (
  node: PhotoRouterGraphNode,
): node is PhotoRouterPhotoOrientationNode => node.nodeType === "photo-orientation";

export const isWarningCanvasActionType = (actionType: string | null | undefined): boolean =>
  (actionType?.trim() ?? "") === LOCAL_WARNING_CANVAS_ACTION_TYPE;

export const getActionNodeKind = (actionType: string | null | undefined): ActionNodeKind =>
  isWarningCanvasActionType(actionType) ? "warning" : "photo";

const getRouterNodeKind = (node: PhotoRouterPhotoOrientationNode | PhotoRouterTimeGateNode) =>
  isTimeGateNode(node) ? "time" : getActionNodeKind(node.photoActionType);

const getRouterNodeKindLabel = (kind: RouterNodeKind): string => {
  if (kind === "warning") {
    return "Warning";
  }
  if (kind === "time") {
    return "Time Gate";
  }
  return "Photo Orientation";
};

export const getDefaultRouterNodeTitle = (kind: RouterNodeKind, existingCount: number) => {
  const baseTitle =
    kind === "warning"
      ? "Warning Node"
      : kind === "time"
        ? "Time Gate Node"
        : "Photo Orientation Node";
  return existingCount === 0 ? baseTitle : `${baseTitle} ${existingCount + 1}`;
};

const getRouterNodeRouteCount = (
  node: PhotoRouterPhotoOrientationNode | PhotoRouterTimeGateNode,
): number => {
  if (isTimeGateNode(node)) {
    return node.gates.length + 1;
  }
  if (getActionNodeKind(node.photoActionType) === "warning") {
    return 1;
  }
  return 2;
};

const getRouterNodeHeight = (
  node: PhotoRouterPhotoOrientationNode | PhotoRouterTimeGateNode,
): number =>
  ROUTER_NODE_BASE_HEIGHT +
  Math.max(1, Math.ceil(getRouterNodeRouteCount(node) / 2)) * ROUTER_NODE_ROUTE_ROW_HEIGHT;

export const roundPosition = (value: number): number => Math.round(value);

const toLayoutNodeSubtitle = (input: {
  actionSummary: string;
  layoutName: string;
  cycleSeconds: number;
}): string => {
  const trimmedSummary = input.actionSummary.trim();
  const trimmedLayoutName = input.layoutName.trim();

  if (!trimmedSummary) {
    return `${input.cycleSeconds}s`;
  }

  if (trimmedLayoutName.length > 0 && trimmedSummary.startsWith(trimmedLayoutName)) {
    const remainder = trimmedSummary.slice(trimmedLayoutName.length).trim();
    if (remainder.startsWith("for ")) {
      return remainder;
    }
  }

  return trimmedSummary;
};

export const createStepId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `step-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

export const createActionNodeId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `action-${crypto.randomUUID()}`;
  }

  return `action-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

export const createTimeGateWindowId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `time-window-${crypto.randomUUID()}`;
  }

  return `time-window-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

export const doesTimeWindowOverlap = (
  gates: PhotoRouterTimeGate[],
  candidate: PhotoRouterTimeGate,
  excludeGateId?: string,
): boolean => {
  const candidateStart = parseClockTimeToMinutes(candidate.startTime);
  const candidateEnd = parseClockTimeToMinutes(candidate.endTime);
  if (candidateEnd <= candidateStart) {
    return true;
  }

  return gates.some((gate) => {
    if (gate.id === excludeGateId) {
      return false;
    }
    const start = parseClockTimeToMinutes(gate.startTime);
    const end = parseClockTimeToMinutes(gate.endTime);
    return candidateStart < end && candidateEnd > start;
  });
};

export const getNextTimeGateWindow = (gates: PhotoRouterTimeGate[]): PhotoRouterTimeGate | null => {
  for (let startMinutes = 0; startMinutes + DEFAULT_TIME_GATE_DURATION_MINUTES <= 24 * 60; ) {
    const candidate = {
      id: createTimeGateWindowId(),
      startTime: formatClockTimeFromMinutes(startMinutes),
      endTime: formatClockTimeFromMinutes(startMinutes + DEFAULT_TIME_GATE_DURATION_MINUTES),
    } satisfies PhotoRouterTimeGate;

    if (!doesTimeWindowOverlap(gates, candidate)) {
      return candidate;
    }

    startMinutes += 30;
  }

  return null;
};

const toPhotoSourceLabel = (
  collectionId: string | null | undefined,
  photoCollectionOptions: PhotoCollectionOption[],
): string => {
  if (!collectionId) {
    return "/photos";
  }

  const match = photoCollectionOptions.find((collection) => collection.id === collectionId);
  return match ? `Collection: ${match.name}` : "/photos";
};

export const omitNodePositions = (
  nodePositions: Record<string, { x: number; y: number }>,
  nodeIds: Set<string>,
) => Object.fromEntries(Object.entries(nodePositions).filter(([nodeId]) => !nodeIds.has(nodeId)));

export const getAvailableConditionTypes = (kind: ActionNodeKind, trigger: ConditionalTrigger) =>
  LOGIC_CONDITION_TYPES.filter((condition) => {
    if (kind === "warning") {
      return condition.id === LOCAL_WARNING_CONDITION_TYPE;
    }
    if (condition.id === LOCAL_WARNING_CONDITION_TYPE) {
      return false;
    }
    return condition.trigger === trigger || condition.trigger === "landscape-photo";
  });

export const getNormalizedConditionTypeForNodeKind = (
  kind: ActionNodeKind,
  trigger: ConditionalTrigger,
  conditionType: string | null | undefined,
): string | null => {
  const availableConditionTypes = getAvailableConditionTypes(kind, trigger);
  const normalizedConditionType = conditionType?.trim() ?? "";
  if (availableConditionTypes.some((condition) => condition.id === normalizedConditionType)) {
    return normalizedConditionType;
  }
  return availableConditionTypes[0]?.id ?? getDefaultConditionTypeForTrigger(trigger);
};

export const clampCycleSeconds = (value: number): number =>
  Math.max(3, Math.min(3600, Math.round(value)));

export const getConnectableSourceHandles = (node: PhotoRouterGraphNode): string[] => {
  if (isLayoutGraphNode(node)) {
    return ["next"];
  }

  if (isTimeGateNode(node)) {
    return [...node.gates.map((gate) => gate.id), "fallback"];
  }

  return getActionNodeKind(node.photoActionType) === "warning"
    ? ["fallback"]
    : [...ROUTER_ROUTE_ORDER];
};

export const getGraphNodeById = (
  block: PhotoRouterBlock,
  nodeId: string | null | undefined,
): PhotoRouterGraphNode | null =>
  nodeId ? (block.nodes.find((node) => node.id === nodeId) ?? null) : null;

export const wouldCreateGraphCycle = (
  block: PhotoRouterBlock,
  sourceId: string,
  targetId: string,
): boolean => {
  if (sourceId === START_NODE_ID || targetId === END_NODE_ID) {
    return false;
  }

  const nextBySource = new Map<string, string[]>();

  for (const connection of block.connections) {
    if (
      connection.source === START_NODE_ID ||
      connection.target === END_NODE_ID ||
      connection.source === sourceId
    ) {
      continue;
    }
    const current = nextBySource.get(connection.source) ?? [];
    current.push(connection.target);
    nextBySource.set(connection.source, current);
  }

  const visited = new Set<string>();
  const queue = [targetId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId || visited.has(currentId)) {
      continue;
    }
    if (currentId === sourceId) {
      return true;
    }
    visited.add(currentId);
    for (const nextId of nextBySource.get(currentId) ?? []) {
      if (!visited.has(nextId)) {
        queue.push(nextId);
      }
    }
  }

  return false;
};

const createEdge = (input: {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  stroke: string;
  dashed?: boolean;
}): Edge => ({
  id: input.id,
  source: input.source,
  target: input.target,
  sourceHandle: input.sourceHandle ?? undefined,
  type: "hearthEdge",
  style: {
    stroke: input.stroke,
    strokeOpacity: input.dashed ? 0.38 : 0.64,
    strokeWidth: input.dashed ? 2 : 2.5,
    strokeDasharray: EDGE_DASH_PATTERN,
  },
  selectable: true,
});

export const getDefaultGraphNodePosition = (input: {
  node: PhotoRouterGraphNode;
  index: number;
}): { x: number; y: number } =>
  isPhotoOrientationNode(input.node) || isTimeGateNode(input.node)
    ? {
        x: DEFAULT_ROUTER_POSITION.x + (input.index % 2) * 420,
        y: DEFAULT_ROUTER_POSITION.y + Math.floor(input.index / 2) * 260,
      }
    : {
        x: DEFAULT_DETACHED_ORIGIN.x + (input.index % 3) * DEFAULT_DETACHED_X_GAP,
        y: DEFAULT_DETACHED_ORIGIN.y + Math.floor(input.index / 3) * DEFAULT_DETACHED_Y_GAP,
      };

export const getNextRouterInsertPosition = (block: PhotoRouterBlock): { x: number; y: number } => {
  const routerCount = block.nodes.filter(
    (node) => isPhotoOrientationNode(node) || isTimeGateNode(node),
  ).length;

  return {
    x: DEFAULT_ROUTER_POSITION.x + (routerCount % 2) * 420,
    y: DEFAULT_ROUTER_POSITION.y + Math.floor(routerCount / 2) * 260,
  };
};

export const getNextLayoutInsertPosition = (block: PhotoRouterBlock): { x: number; y: number } => {
  const layoutCount = block.nodes.filter((node) => isLayoutGraphNode(node)).length;

  return {
    x: DEFAULT_DETACHED_ORIGIN.x + (layoutCount % 3) * DEFAULT_DETACHED_X_GAP,
    y: DEFAULT_DETACHED_ORIGIN.y + Math.floor(layoutCount / 3) * DEFAULT_DETACHED_Y_GAP,
  };
};

const doNodeRectsOverlap = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

export const resolveInsertPosition = (input: {
  block: PhotoRouterBlock;
  desiredPosition: { x: number; y: number };
  nodeSize: { width: number; height: number };
}): { x: number; y: number } => {
  const existingRects = input.block.nodes.map((node, index) => {
    const position =
      input.block.nodePositions[node.id] ?? getDefaultGraphNodePosition({ node, index });
    const size = getGraphNodeSize(node);
    return {
      x: position.x - 24,
      y: position.y - 24,
      width: size.width + 48,
      height: size.height + 48,
    };
  });

  for (let attempt = 0; attempt < 18; attempt += 1) {
    const candidate = {
      x: roundPosition(input.desiredPosition.x + (attempt % 3) * 40),
      y: roundPosition(input.desiredPosition.y + Math.floor(attempt / 3) * 36),
      width: input.nodeSize.width,
      height: input.nodeSize.height,
    };

    if (!existingRects.some((rect) => doNodeRectsOverlap(candidate, rect))) {
      return { x: candidate.x, y: candidate.y };
    }
  }

  return {
    x: roundPosition(input.desiredPosition.x),
    y: roundPosition(input.desiredPosition.y),
  };
};

export const getGraphNodeSize = (
  node: PhotoRouterGraphNode | null | undefined,
): { width: number; height: number } =>
  node && (isPhotoOrientationNode(node) || isTimeGateNode(node))
    ? {
        width: ROUTER_NODE_WIDTH,
        height: getRouterNodeHeight(node),
      }
    : {
        width: LAYOUT_NODE_WIDTH,
        height: LAYOUT_NODE_HEIGHT,
      };

export const buildFlowGraph = (input: {
  block: PhotoRouterBlock;
  selectedNodeId: string | null;
  photoCollectionOptions: PhotoCollectionOption[];
  onRemoveNode: (nodeId: string) => void;
  onSelectNode: (nodeId: string) => void;
  isCanvasInteractive: boolean;
}): { nodes: Node[]; edges: Edge[] } => {
  const routerNodes = input.block.nodes.filter(
    (node): node is PhotoRouterPhotoOrientationNode | PhotoRouterTimeGateNode =>
      isPhotoOrientationNode(node) || isTimeGateNode(node),
  );
  const layoutNodes = input.block.nodes.filter((node): node is PhotoRouterLayoutNode =>
    isLayoutGraphNode(node),
  );
  const hiddenWarningPortraitSources = new Set(
    routerNodes
      .filter(
        (node) =>
          isPhotoOrientationNode(node) && getActionNodeKind(node.photoActionType) === "warning",
      )
      .map((node) => `${node.id}::portrait`),
  );
  const visibleConnections = input.block.connections.filter(
    (connection) =>
      !hiddenWarningPortraitSources.has(
        `${connection.source}::${connection.sourceHandle?.trim() || "default"}`,
      ),
  );
  const incomingCounts = new Map<string, number>();
  const connectionBySourceHandle = new Map<string, PhotoRouterConnection>();

  visibleConnections.forEach((connection) => {
    incomingCounts.set(connection.target, (incomingCounts.get(connection.target) ?? 0) + 1);
    connectionBySourceHandle.set(
      `${connection.source}::${connection.sourceHandle?.trim() || "default"}`,
      connection,
    );
  });

  const nodes: Node[] = [];
  const positionedNodes = input.block.nodes.map((node, index) => ({
    node,
    position: input.block.nodePositions[node.id] ?? getDefaultGraphNodePosition({ node, index }),
  }));

  const firstGraphNodePosition = positionedNodes[0]?.position ?? DEFAULT_ROUTER_POSITION;
  const startTargetId =
    input.block.connections.find((connection) => connection.source === START_NODE_ID)?.target ??
    null;
  const startAnchorEntry =
    (startTargetId
      ? (positionedNodes.find((entry) => entry.node.id === startTargetId) ?? null)
      : null) ??
    positionedNodes[0] ??
    null;
  const startAnchorSize = getGraphNodeSize(startAnchorEntry?.node);

  nodes.push({
    id: START_NODE_ID,
    type: "terminalNode",
    position: input.block.nodePositions[START_NODE_ID] ?? {
      x:
        (startAnchorEntry?.position.x ?? firstGraphNodePosition.x) +
        startAnchorSize.width / 2 -
        TERMINAL_NODE_SIZE / 2,
      y: Math.max(
        24,
        (startAnchorEntry?.position.y ?? firstGraphNodePosition.y) -
          START_NODE_GAP -
          TERMINAL_NODE_SIZE,
      ),
    },
    draggable: input.isCanvasInteractive,
    selectable: false,
    deletable: false,
    zIndex: 1000,
    style: {
      width: TERMINAL_NODE_SIZE,
      height: TERMINAL_NODE_SIZE,
    },
    data: {
      title: "Start",
      tone: "start",
    },
  } satisfies TerminalNodeType);

  routerNodes.forEach((node, index) => {
    const routerNodeKind = getRouterNodeKind(node);
    const isTimeGate = isTimeGateNode(node);
    const conditionBranchCopy = isPhotoOrientationNode(node)
      ? getConditionBranchCopy(
          getNormalizedConditionTypeForNodeKind(
            getActionNodeKind(node.photoActionType),
            "portrait-photo",
            node.portrait.conditionType,
          ),
        )
      : null;
    const routerHeight = getRouterNodeHeight(node);
    const routes = isTimeGate
      ? [
          ...node.gates.map((gate, gateIndex) => {
            const meta = getTimeGateRouteMeta(gateIndex);
            return {
              key: gate.id,
              label: formatPhotoRouterTimeGateWindow(gate),
              count: connectionBySourceHandle.has(`${node.id}::${gate.id}`) ? 1 : 0,
              enabled: true,
              connectable: true,
              ...meta,
            };
          }),
          {
            key: "fallback",
            label: "Else",
            count: connectionBySourceHandle.has(`${node.id}::fallback`) ? 1 : 0,
            enabled: true,
            connectable: true,
            ...BRANCH_META.fallback,
          },
        ]
      : routerNodeKind === "warning"
        ? [
            {
              key: "fallback",
              label: conditionBranchCopy?.fallbackLabel ?? "Otherwise",
              count: connectionBySourceHandle.has(`${node.id}::fallback`) ? 1 : 0,
              enabled: true,
              connectable: true,
              ...BRANCH_META.fallback,
            },
          ]
        : ROUTER_ROUTE_ORDER.map((branchKey) => ({
            key: branchKey,
            label:
              branchKey === "portrait"
                ? (conditionBranchCopy?.matchedLabel ?? "Matches")
                : (conditionBranchCopy?.fallbackLabel ?? "Otherwise"),
            count: connectionBySourceHandle.has(`${node.id}::${branchKey}`) ? 1 : 0,
            enabled: true,
            connectable: true,
            ...(branchKey === "portrait" ? BRANCH_META.portrait : BRANCH_META.fallback),
          }));

    nodes.push({
      id: node.id,
      type: "routerNode",
      position: input.block.nodePositions[node.id] ?? getDefaultGraphNodePosition({ node, index }),
      draggable: input.isCanvasInteractive,
      dragHandle: GRAPH_NODE_DRAG_HANDLE_SELECTOR,
      selectable: true,
      connectable: true,
      deletable: true,
      style: {
        width: ROUTER_NODE_WIDTH,
        minHeight: routerHeight,
      },
      selected: input.selectedNodeId === node.id,
      data: {
        title: node.title,
        kindLabel: getRouterNodeKindLabel(routerNodeKind),
        actionSummary: isTimeGate
          ? "Routes to different paths based on the household time window."
          : getCanvasActionTypeById(node.photoActionType).description,
        sourceLabel:
          routerNodeKind === "warning"
            ? null
            : isTimeGate
              ? "Household timezone"
              : toPhotoSourceLabel(node.photoActionCollectionId, input.photoCollectionOptions),
        onSelect: () => input.onSelectNode(node.id),
        onRemove: () => input.onRemoveNode(node.id),
        routes,
      },
    } satisfies RouterNodeType);
  });

  layoutNodes.forEach((node, index) => {
    const actionType = getActionTypeById(node.actionType);
    const actionParams = parseActionParamsByType(node.actionType, node.actionParams);
    const incomingCount = incomingCounts.get(node.id) ?? 0;

    nodes.push({
      id: node.id,
      type: "layoutNode",
      position:
        input.block.nodePositions[node.id] ??
        getDefaultGraphNodePosition({
          node,
          index: routerNodes.length + index,
        }),
      draggable: input.isCanvasInteractive,
      dragHandle: GRAPH_NODE_DRAG_HANDLE_SELECTOR,
      selectable: true,
      connectable: true,
      deletable: true,
      style: {
        width: LAYOUT_NODE_WIDTH,
        minHeight: LAYOUT_NODE_HEIGHT,
      },
      selected: input.selectedNodeId === node.id,
      data: {
        title: node.layoutName,
        subtitle: toLayoutNodeSubtitle({
          actionSummary: actionType.renderSummary({
            layoutName: node.layoutName,
            cycleSeconds: node.cycleSeconds,
            actionType: node.actionType,
            actionParams,
            conditionParams: {},
          }),
          layoutName: node.layoutName,
          cycleSeconds: node.cycleSeconds,
        }),
        onSelect: () => input.onSelectNode(node.id),
        onRemove: () => input.onRemoveNode(node.id),
        routeLabel:
          incomingCount > 0
            ? `${incomingCount} input${incomingCount === 1 ? "" : "s"}`
            : "Detached",
      },
    } satisfies StepNodeType);
  });

  const lowestNodeEntry = positionedNodes.reduce<{
    node: PhotoRouterGraphNode | null;
    position: { x: number; y: number };
  }>(
    (result, entry) =>
      entry.position.y > result.position.y
        ? { node: entry.node, position: entry.position }
        : result,
    {
      node: null,
      position: firstGraphNodePosition,
    },
  );
  const lowestNodeSize = getGraphNodeSize(lowestNodeEntry.node);

  nodes.push({
    id: END_NODE_ID,
    type: "terminalNode",
    position: input.block.nodePositions[END_NODE_ID] ?? {
      x: lowestNodeEntry.position.x + lowestNodeSize.width / 2 - TERMINAL_NODE_SIZE / 2,
      y: lowestNodeEntry.position.y + lowestNodeSize.height + END_NODE_GAP,
    },
    draggable: input.isCanvasInteractive,
    selectable: false,
    deletable: false,
    zIndex: 1000,
    style: {
      width: TERMINAL_NODE_SIZE,
      height: TERMINAL_NODE_SIZE,
    },
    data: {
      title: "Return to start",
      tone: "end",
    },
  } satisfies TerminalNodeType);

  const edges = visibleConnections.map((connection) => {
    const sourceNode = getGraphNodeById(input.block, connection.source);
    const stroke =
      sourceNode && isTimeGateNode(sourceNode)
        ? connection.sourceHandle?.trim() === "fallback"
          ? BRANCH_META.fallback.color
          : getTimeGateRouteMeta(
              Math.max(
                0,
                sourceNode.gates.findIndex((gate) => gate.id === connection.sourceHandle?.trim()),
              ),
            ).color
        : connection.sourceHandle?.trim() === "portrait"
          ? BRANCH_META.portrait.color
          : connection.sourceHandle?.trim() === "fallback"
            ? BRANCH_META.fallback.color
            : "#94a3b8";

    return createEdge({
      id: connection.id,
      source: connection.source,
      sourceHandle: connection.sourceHandle,
      target: connection.target,
      stroke,
      dashed: false,
    });
  });

  return { nodes, edges };
};
