import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import {
  BaseEdge,
  Background,
  ConnectionLineType,
  Handle,
  Panel,
  Position,
  ReactFlow,
  applyEdgeChanges,
  applyNodeChanges,
  getBezierPath,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
  type ReactFlowInstance,
} from "@xyflow/react";
import {
  DEFAULT_LANDSCAPE_LAYOUT_LOGIC_CONDITION_TYPE,
  DEFAULT_PORTRAIT_LAYOUT_LOGIC_CONDITION_TYPE,
  PHOTO_COLLECTION_ACTION_PARAM_KEY,
  getPrimaryPhotoRouterBlock,
  setPrimaryPhotoRouterBlock,
  type LayoutSetAuthoring,
  type PhotoRouterBlock,
  type PhotoRouterConnection,
  type PhotoRouterGraphNode,
  type PhotoRouterLayoutNode,
  type PhotoRouterPhotoOrientationNode,
} from "@hearth/shared";
import type { RuntimeHealthReport } from "../../pages/layout-set-runtime-health";
import {
  LOGIC_ACTION_TYPES,
  LOGIC_CANVAS_ACTION_TYPES,
  LOGIC_CONDITION_TYPES,
  getActionTypeById,
  getCanvasActionTypeById,
  getConditionTypeById,
  getDefaultActionParams,
  getDefaultCanvasActionTypeId,
  getDefaultConditionTypeForTrigger,
  parseActionParamsByType,
  parseConditionParamsByType,
  type LogicParamFieldDefinition,
} from "./logicNodeRegistry";

interface LayoutOption {
  id: number;
  name: string;
}

interface PhotoCollectionOption {
  id: string;
  name: string;
}

interface PhotoRouterBlockEditorProps {
  authoring: LayoutSetAuthoring;
  layoutOptions: LayoutOption[];
  photoCollectionOptions: PhotoCollectionOption[];
  runtimeHealth?: RuntimeHealthReport;
  onChange: (nextAuthoring: LayoutSetAuthoring) => void;
}

type ConditionalTrigger = "portrait-photo";
type BranchKey = "fallback" | "portrait";
type StepNodeType = Node<LayoutNodeData, "layoutNode">;
type RouterNodeType = Node<RouterNodeData, "routerNode">;
type TerminalNodeType = Node<TerminalNodeData, "terminalNode">;

interface RouterNodeData extends Record<string, unknown> {
  title: string;
  photoActionLabel: string;
  photoSourceLabel: string;
  onRemove?: () => void;
  routes: Array<{
    key: BranchKey;
    label: string;
    count: number;
    enabled: boolean;
  }>;
}

interface LayoutNodeData extends Record<string, unknown> {
  title: string;
  subtitle: string;
  routeLabel: string;
  onRemove?: () => void;
}

interface TerminalNodeData extends Record<string, unknown> {
  title: string;
  tone: "start" | "end";
}

const GRAPH_NODE_DRAG_TYPE = "application/hearth-graph-node";
const START_NODE_ID = "__start__";
const END_NODE_ID = "__end__";
const ROUTER_NODE_WIDTH = 360;
const ROUTER_NODE_HEIGHT = 200;
const LAYOUT_NODE_WIDTH = 260;
const LAYOUT_NODE_HEIGHT = 92;
const TERMINAL_NODE_SIZE = 96;
const START_NODE_GAP = 128;
const END_NODE_GAP = 168;
const DEFAULT_ROUTER_POSITION = { x: 420, y: 48 };
const DEFAULT_DETACHED_ORIGIN = { x: 96, y: 980 };
const DEFAULT_DETACHED_X_GAP = 332;
const DEFAULT_DETACHED_Y_GAP = 168;
const ROUTER_ROUTE_ORDER: BranchKey[] = ["portrait", "fallback"];
const EDGE_DASH_PATTERN = "8 12";

const BRANCH_META: Record<
  BranchKey,
  {
    color: string;
    bgClassName: string;
    borderClassName: string;
  }
> = {
  portrait: {
    color: "#22d3ee",
    bgClassName: "bg-cyan-500/10 text-cyan-100",
    borderClassName: "border-cyan-400/50",
  },
  fallback: {
    color: "#f59e0b",
    bgClassName: "bg-amber-500/10 text-amber-100",
    borderClassName: "border-amber-400/50",
  },
};

const getConditionBranchCopy = (conditionType: string | null | undefined) => {
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

  return {
    title: "Condition branch",
    matchedLabel: "Matches",
    fallbackLabel: "Otherwise",
  };
};

const clampCycleSeconds = (value: number): number =>
  Math.max(3, Math.min(3600, Math.round(value)));

const roundPosition = (value: number): number => Math.round(value);

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

const toParamStringValue = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return "";
};

const toParamNumberValue = (value: unknown, fallback: number): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
};

const toParamBooleanValue = (value: unknown): boolean => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }
  return false;
};

const createStepId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `step-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

const createActionNodeId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `action-${crypto.randomUUID()}`;
  }

  return `action-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

const toConnectionId = (input: {
  source: string;
  sourceHandle?: string | null;
  target: string;
}): string =>
  [input.source.trim(), input.sourceHandle?.trim() || "default", input.target.trim()].join(
    "::",
  );

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

const omitNodePositions = (
  nodePositions: Record<string, { x: number; y: number }>,
  nodeIds: Set<string>,
) =>
  Object.fromEntries(
    Object.entries(nodePositions).filter(([nodeId]) => !nodeIds.has(nodeId)),
  );

const isLayoutGraphNode = (
  node: PhotoRouterGraphNode,
): node is PhotoRouterLayoutNode => node.nodeType === "layout";

const isPhotoOrientationNode = (
  node: PhotoRouterGraphNode,
): node is PhotoRouterPhotoOrientationNode => node.nodeType === "photo-orientation";

const isBranchKey = (value: string | null | undefined): value is BranchKey =>
  value === "portrait" || value === "fallback";

const getGraphNodeById = (
  block: PhotoRouterBlock,
  nodeId: string | null | undefined,
): PhotoRouterGraphNode | null =>
  nodeId ? block.nodes.find((node) => node.id === nodeId) ?? null : null;

const wouldCreateGraphCycle = (
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

const ParamFieldEditor = ({
  field,
  value,
  onChange,
}: {
  field: LogicParamFieldDefinition;
  value: unknown;
  onChange: (value: string | number | boolean | null) => void;
}) => {
  if (field.kind === "boolean") {
    return (
      <label className="flex items-center justify-between rounded border border-slate-700 bg-slate-800/40 px-3 py-2">
        <span className="text-sm text-slate-200">{field.label}</span>
        <input
          type="checkbox"
          checked={toParamBooleanValue(value)}
          onChange={(event) => onChange(event.target.checked)}
        />
      </label>
    );
  }

  if (field.kind === "number") {
    const fallback =
      typeof field.min === "number" && Number.isFinite(field.min) ? field.min : 0;
    return (
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {field.label}
        </span>
        <input
          type="number"
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          value={toParamNumberValue(value, fallback)}
          className="h-10 w-full rounded border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100"
          onChange={(event) => {
            const parsed = Number.parseFloat(event.target.value);
            if (!Number.isFinite(parsed)) {
              return;
            }
            onChange(parsed);
          }}
        />
      </label>
    );
  }

  if (field.kind === "select") {
    return (
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {field.label}
        </span>
        <select
          className="h-10 w-full rounded border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100"
          value={toParamStringValue(value)}
          onChange={(event) => onChange(event.target.value)}
        >
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {field.label}
      </span>
      <input
        type="text"
        value={toParamStringValue(value)}
        className="h-10 w-full rounded border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100"
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
};

const RouterNode = ({ data, selected }: NodeProps<RouterNodeType>) => (
  <div
    className={`relative rounded-2xl border bg-slate-950/95 px-4 py-4 shadow-[0_0_0_1px_rgba(15,23,42,0.75)] ${
      selected ? "border-cyan-300 shadow-[0_0_0_2px_rgba(34,211,238,0.35)]" : "border-slate-700"
    }`}
  >
    <Handle
      type="target"
      position={Position.Top}
      className="!h-3 !w-3 !border-none !bg-slate-300"
      style={{ top: -7 }}
    />
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-200/90">
          Action
        </p>
        <h4 className="mt-1 text-lg font-semibold text-slate-100">{data.title}</h4>
        <p className="mt-2 text-sm text-slate-300">{data.photoActionLabel}</p>
        <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">
          Source: {data.photoSourceLabel}
        </p>
      </div>
      {data.onRemove ? (
        <button
          type="button"
          className="nodrag nopan rounded border border-rose-400/70 px-2.5 py-1.5 text-xs font-semibold text-rose-100 hover:bg-rose-500/20"
          onTouchStart={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            data.onRemove?.();
          }}
        >
          Remove
        </button>
      ) : null}
    </div>

    <div className="mt-4 grid grid-cols-2 gap-2">
      {data.routes.map((route) => (
        <div
          key={route.key}
          className={`relative rounded-lg border px-3 py-2 text-sm ${BRANCH_META[route.key].borderClassName} ${BRANCH_META[route.key].bgClassName}`}
        >
          <Handle
            type="source"
            id={route.key}
            position={Position.Bottom}
            className="!h-3 !w-3 !border-none"
            style={{
              bottom: -7,
              left: "50%",
              transform: "translateX(-50%)",
              backgroundColor: BRANCH_META[route.key].color,
            }}
          />
          <div className="text-center">
            <span className="block font-semibold">{route.label}</span>
            <span className="mt-1 block text-[11px] uppercase tracking-wide opacity-80">
              {route.enabled ? `${route.count} linked` : `disabled · ${route.count} linked`}
            </span>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const LayoutNode = ({ data, selected }: NodeProps<StepNodeType>) => (
  <div
    className={`rounded-xl border bg-slate-950/95 px-4 py-3 shadow-[0_0_0_1px_rgba(15,23,42,0.75)] ${
      selected ? "border-cyan-300 shadow-[0_0_0_2px_rgba(34,211,238,0.35)]" : "border-slate-700"
    }`}
  >
    <Handle
      type="target"
      position={Position.Top}
      className="!h-3 !w-3 !border-none !bg-slate-300"
      style={{ top: -7 }}
    />
    <Handle
      type="source"
      id="next"
      position={Position.Bottom}
      className="!h-3 !w-3 !border-none !bg-slate-300"
      style={{ bottom: -7 }}
    />

    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
          Layout
        </p>
        <h4 className="mt-1 truncate text-base font-semibold text-slate-100">{data.title}</h4>
      </div>
      {data.onRemove ? (
        <button
          type="button"
          className="nodrag nopan rounded border border-rose-400/70 px-2.5 py-1.5 text-xs font-semibold text-rose-100 hover:bg-rose-500/20"
          onTouchStart={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            data.onRemove?.();
          }}
        >
          Remove
        </button>
      ) : null}
    </div>
    <p className="mt-1 text-sm text-slate-300">{data.subtitle}</p>
    <div className="mt-3 inline-flex rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-300">
      {data.routeLabel}
    </div>
  </div>
);

const TerminalNode = ({ data }: NodeProps<TerminalNodeType>) => (
  <div
    className={`flex h-full w-full items-center justify-center rounded-full border text-center ${
      data.tone === "start"
        ? "border-cyan-400/50 bg-cyan-500/10 text-cyan-100"
        : "border-slate-600 bg-slate-900/90 text-slate-200"
    }`}
  >
    {data.tone === "start" ? (
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !border-none !bg-slate-300"
        style={{ bottom: -7 }}
      />
    ) : (
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-none !bg-slate-300"
        style={{ top: -7 }}
      />
    )}
    <div>
      {data.tone === "end" ? (
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] opacity-75">
          {data.tone}
        </p>
      ) : null}
      <p className={`${data.tone === "end" ? "mt-1" : ""} text-base font-semibold`}>
        {data.title}
      </p>
    </div>
  </div>
);

const CanvasControlButton = ({
  title,
  disabled = false,
  active = false,
  onClick,
  children,
}: {
  title: string;
  disabled?: boolean;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    disabled={disabled}
    onClick={onClick}
    className={`flex h-12 w-12 items-center justify-center transition ${
      active
        ? "bg-cyan-500/18 text-cyan-100 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.22)]"
        : "bg-slate-950/92 text-sky-100 hover:bg-slate-800/95 hover:text-cyan-100"
    } ${
      disabled
        ? "cursor-not-allowed bg-slate-950/90 text-slate-500 hover:bg-slate-950/90 hover:text-slate-500"
        : ""
    }`}
  >
    {children}
  </button>
);

const FitViewIcon = () => (
  <svg
    viewBox="0 0 20 20"
    aria-hidden="true"
    className="h-[18px] w-[18px]"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M7 3H3v4" />
    <path d="M13 3h4v4" />
    <path d="M17 13v4h-4" />
    <path d="M7 17H3v-4" />
  </svg>
);

const LockIcon = ({ locked }: { locked: boolean }) => (
  <svg
    viewBox="0 0 20 20"
    aria-hidden="true"
    className="h-[18px] w-[18px]"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="4.5" y="9" width="11" height="7.5" rx="1.8" />
    {locked ? (
      <path d="M6.5 9V6.8a3.5 3.5 0 1 1 7 0V9" />
    ) : (
      <path d="M13.5 9V6.8a3.5 3.5 0 0 0-6-2.45" />
    )}
  </svg>
);

const GraphEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  selected,
}: EdgeProps) => {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.42,
  });

  return (
    <>
      <BaseEdge
        id={`${id}-underlay`}
        path={edgePath}
        style={{
          stroke: style?.stroke ?? "#cbd5e1",
          strokeOpacity: selected ? 0.18 : 0.08,
          strokeWidth:
            typeof style?.strokeWidth === "number" ? style.strokeWidth + 8 : 10,
          strokeLinecap: "round",
          strokeLinejoin: "round",
        }}
      />
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          strokeLinecap: "round",
          strokeLinejoin: "round",
        }}
        interactionWidth={28}
      />
    </>
  );
};

const nodeTypes: NodeTypes = {
  routerNode: RouterNode,
  layoutNode: LayoutNode,
  terminalNode: TerminalNode,
};

const edgeTypes = {
  hearthEdge: GraphEdge,
};

const getDefaultGraphNodePosition = (input: {
  node: PhotoRouterGraphNode;
  index: number;
}): { x: number; y: number } =>
  isPhotoOrientationNode(input.node)
    ? {
        x: DEFAULT_ROUTER_POSITION.x + (input.index % 2) * 420,
        y: DEFAULT_ROUTER_POSITION.y + Math.floor(input.index / 2) * 260,
      }
    : {
        x: DEFAULT_DETACHED_ORIGIN.x + (input.index % 3) * DEFAULT_DETACHED_X_GAP,
        y: DEFAULT_DETACHED_ORIGIN.y + Math.floor(input.index / 3) * DEFAULT_DETACHED_Y_GAP,
      };

const getGraphNodeSize = (
  node: PhotoRouterGraphNode | null | undefined,
): { width: number; height: number } =>
  node && isPhotoOrientationNode(node)
    ? {
        width: ROUTER_NODE_WIDTH,
        height: ROUTER_NODE_HEIGHT,
      }
    : {
        width: LAYOUT_NODE_WIDTH,
        height: LAYOUT_NODE_HEIGHT,
      };

const buildFlowGraph = (input: {
  block: PhotoRouterBlock;
  selectedNodeId: string | null;
  photoCollectionOptions: PhotoCollectionOption[];
  onRemoveNode: (nodeId: string) => void;
}): { nodes: Node[]; edges: Edge[] } => {
  const actionNodes = input.block.nodes.filter(
    (node): node is PhotoRouterPhotoOrientationNode => isPhotoOrientationNode(node),
  );
  const layoutNodes = input.block.nodes.filter(
    (node): node is PhotoRouterLayoutNode => isLayoutGraphNode(node),
  );
  const incomingCounts = new Map<string, number>();
  const connectionBySourceHandle = new Map<string, PhotoRouterConnection>();

  input.block.connections.forEach((connection) => {
    incomingCounts.set(
      connection.target,
      (incomingCounts.get(connection.target) ?? 0) + 1,
    );
    connectionBySourceHandle.set(
      `${connection.source}::${connection.sourceHandle?.trim() || "default"}`,
      connection,
    );
  });

  const nodes: Node[] = [];
  const positionedNodes = input.block.nodes.map((node, index) => ({
    node,
    position:
      input.block.nodePositions[node.id] ?? getDefaultGraphNodePosition({ node, index }),
  }));

  const firstGraphNodePosition =
    positionedNodes[0]?.position ?? DEFAULT_ROUTER_POSITION;
  const startTargetId =
    input.block.connections.find((connection) => connection.source === START_NODE_ID)?.target ??
    null;
  const startAnchorEntry =
    (startTargetId
      ? positionedNodes.find((entry) => entry.node.id === startTargetId) ?? null
      : null) ?? positionedNodes[0] ?? null;
  const startAnchorSize = getGraphNodeSize(startAnchorEntry?.node);

  nodes.push({
    id: START_NODE_ID,
    type: "terminalNode",
    position:
      input.block.nodePositions[START_NODE_ID] ?? {
        x:
          (startAnchorEntry?.position.x ?? firstGraphNodePosition.x) +
          startAnchorSize.width / 2 -
          TERMINAL_NODE_SIZE / 2,
        y: Math.max(
          24,
          (startAnchorEntry?.position.y ?? firstGraphNodePosition.y) - START_NODE_GAP,
        ),
      },
    draggable: true,
    selectable: false,
    deletable: false,
    style: {
      width: TERMINAL_NODE_SIZE,
      height: TERMINAL_NODE_SIZE,
    },
    data: {
      title: "Start",
      tone: "start",
    },
  } satisfies TerminalNodeType);

  actionNodes.forEach((node, index) => {
    const conditionBranchCopy = getConditionBranchCopy(node.portrait.conditionType);

    nodes.push({
      id: node.id,
      type: "routerNode",
      position:
        input.block.nodePositions[node.id] ??
        getDefaultGraphNodePosition({ node, index }),
      draggable: true,
      selectable: true,
      deletable: true,
      style: {
        width: ROUTER_NODE_WIDTH,
        minHeight: ROUTER_NODE_HEIGHT,
      },
      selected: input.selectedNodeId === node.id,
      data: {
        title: node.title,
        photoActionLabel: getCanvasActionTypeById(node.photoActionType).description,
        photoSourceLabel: toPhotoSourceLabel(
          node.photoActionCollectionId,
          input.photoCollectionOptions,
        ),
        onRemove: () => input.onRemoveNode(node.id),
        routes: ROUTER_ROUTE_ORDER.map((branchKey) => ({
          key: branchKey,
          label:
            branchKey === "portrait"
              ? conditionBranchCopy.matchedLabel
              : conditionBranchCopy.fallbackLabel,
          count: connectionBySourceHandle.has(`${node.id}::${branchKey}`) ? 1 : 0,
          enabled: true,
        })),
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
          index: actionNodes.length + index,
        }),
      draggable: true,
      selectable: true,
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
    position:
      input.block.nodePositions[END_NODE_ID] ?? {
        x:
          lowestNodeEntry.position.x +
          lowestNodeSize.width / 2 -
          TERMINAL_NODE_SIZE / 2,
        y: lowestNodeEntry.position.y + lowestNodeSize.height + END_NODE_GAP,
      },
    draggable: true,
    selectable: false,
    deletable: false,
    style: {
      width: TERMINAL_NODE_SIZE,
      height: TERMINAL_NODE_SIZE,
    },
    data: {
      title: "Return to start",
      tone: "end",
    },
  } satisfies TerminalNodeType);

  const edges = input.block.connections.map((connection) => {
    const sourceNode = getGraphNodeById(input.block, connection.source);
    const branchKey = isBranchKey(connection.sourceHandle)
      ? connection.sourceHandle
      : null;
    const stroke = branchKey
      ? BRANCH_META[branchKey].color
      : sourceNode && isPhotoOrientationNode(sourceNode)
        ? "#94a3b8"
        : "#94a3b8";
    const dashed = false;

    return createEdge({
      id: connection.id,
      source: connection.source,
      sourceHandle: connection.sourceHandle,
      target: connection.target,
      stroke,
      dashed,
    });
  });

  return { nodes, edges };
};

export const PhotoRouterBlockEditor = ({
  authoring,
  layoutOptions,
  photoCollectionOptions,
  runtimeHealth,
  onChange,
}: PhotoRouterBlockEditorProps) => {
  const block = useMemo(() => getPrimaryPhotoRouterBlock(authoring), [authoring]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isCanvasInteractive, setIsCanvasInteractive] = useState(true);
  const [reactFlowInstance, setReactFlowInstance] =
    useState<ReactFlowInstance<Node, Edge> | null>(null);
  const updateBlock = useCallback((updater: (current: PhotoRouterBlock) => PhotoRouterBlock) => {
    const nextBlock = updater(block);
    onChange(
      setPrimaryPhotoRouterBlock({
        authoring,
        block: nextBlock,
      }),
    );
  }, [authoring, block, onChange]);

  const addLayoutNodeAtPosition = useCallback((position: { x: number; y: number }) => {
    const fallbackLayoutName =
      layoutOptions[0]?.name ??
      block.nodes.find((node): node is PhotoRouterLayoutNode => isLayoutGraphNode(node))
        ?.layoutName ??
      "";

    if (!fallbackLayoutName) {
      return;
    }

    const nextLayoutNode: PhotoRouterLayoutNode = {
      id: createStepId(),
      nodeType: "layout",
      layoutName: fallbackLayoutName,
      cycleSeconds: 20,
      actionType: LOGIC_ACTION_TYPES[0]?.id ?? "layout.display",
      actionParams: getDefaultActionParams(LOGIC_ACTION_TYPES[0]?.id),
    };

    setSelectedNodeId(nextLayoutNode.id);
    updateBlock((current) => ({
      ...current,
      nodes: [...current.nodes, nextLayoutNode],
      nodePositions: {
        ...current.nodePositions,
        [nextLayoutNode.id]: {
          x: roundPosition(position.x),
          y: roundPosition(position.y),
        },
      },
    }));
  }, [block.nodes, layoutOptions, updateBlock]);

  const addPhotoOrientationNodeAtPosition = useCallback((position: { x: number; y: number }) => {
    const existingActionCount = block.nodes.filter((node) => isPhotoOrientationNode(node)).length;
    const nextActionNode: PhotoRouterPhotoOrientationNode = {
      id: createActionNodeId(),
      nodeType: "photo-orientation",
      title:
        existingActionCount === 0
          ? "Photo Orientation"
          : `Photo Orientation ${existingActionCount + 1}`,
      photoActionType: getDefaultCanvasActionTypeId(),
      photoActionCollectionId: null,
      portrait: {
        enabled: true,
        conditionType: getDefaultConditionTypeForTrigger("portrait-photo"),
        conditionParams: parseConditionParamsByType(
          getDefaultConditionTypeForTrigger("portrait-photo"),
          {},
        ),
      },
      landscape: {
        enabled: false,
        conditionType: "photo.orientation.landscape",
        conditionParams: {},
      },
    };

    setSelectedNodeId(nextActionNode.id);
    updateBlock((current) => ({
      ...current,
      nodes: [...current.nodes, nextActionNode],
      nodePositions: {
        ...current.nodePositions,
        [nextActionNode.id]: {
          x: roundPosition(position.x),
          y: roundPosition(position.y),
        },
      },
    }));
  }, [block.nodes, updateBlock]);

  const handleNodesDelete = useCallback((deletedNodes: Node[]) => {
    const deletedNodeIds = new Set(
      deletedNodes
        .map((node) => node.id)
        .filter((nodeId) => nodeId !== START_NODE_ID && nodeId !== END_NODE_ID),
    );
    if (deletedNodeIds.size === 0) {
      return;
    }

    setSelectedNodeId(null);
    updateBlock((current) => {
      const remainingNodes = current.nodes.filter((node) => !deletedNodeIds.has(node.id));
      const remainingNodeIds = new Set(remainingNodes.map((node) => node.id));

      return {
        ...current,
        nodes: remainingNodes,
        layoutNodes: current.layoutNodes.filter((step) => remainingNodeIds.has(step.id)),
        connections: current.connections.filter(
          (connection) =>
            !deletedNodeIds.has(connection.source) && !deletedNodeIds.has(connection.target),
        ),
        nodePositions: omitNodePositions(current.nodePositions, deletedNodeIds),
        fallback: {
          ...current.fallback,
          steps: current.fallback.steps.filter((step) => remainingNodeIds.has(step.id)),
        },
        portrait: {
          ...current.portrait,
          steps: current.portrait.steps.filter((step) => remainingNodeIds.has(step.id)),
        },
        landscape: {
          ...current.landscape,
          steps: current.landscape.steps.filter((step) => remainingNodeIds.has(step.id)),
        },
      };
    });
  }, [updateBlock]);

  const removeNodeById = useCallback((nodeId: string) => {
    if (nodeId === START_NODE_ID || nodeId === END_NODE_ID) {
      return;
    }

    handleNodesDelete([
      {
        id: nodeId,
        position: block.nodePositions[nodeId] ?? {
          x: 0,
          y: 0,
        },
        data: {},
      } as Node,
    ]);
  }, [block.nodePositions, handleNodesDelete]);

  const graph = useMemo(
    () =>
      buildFlowGraph({
        block,
        selectedNodeId,
        photoCollectionOptions,
        onRemoveNode: removeNodeById,
      }),
    [block, photoCollectionOptions, removeNodeById, selectedNodeId],
  );
  const [nodes, setNodes] = useState<Node[]>(graph.nodes);
  const [edges, setEdges] = useState<Edge[]>(graph.edges);

  useEffect(() => {
    setNodes(graph.nodes);
    setEdges(graph.edges);
  }, [graph]);

  useEffect(() => {
    if (!reactFlowInstance) {
      return;
    }

    requestAnimationFrame(() => {
      reactFlowInstance.fitView({
        padding: 0.2,
        duration: 180,
      });
    });
  }, [graph.nodes.map((node) => node.id).join("|"), reactFlowInstance]);

  useEffect(() => {
    if (selectedNodeId === null) {
      return;
    }
    if (block.nodes.some((node) => node.id === selectedNodeId)) {
      return;
    }
    setSelectedNodeId(null);
  }, [block, selectedNodeId]);

  const isValidConnection = (candidate: Edge | Connection): boolean => {
    const source = candidate.source?.trim();
    const target = candidate.target?.trim();
    if (!source || !target || source === target) {
      return false;
    }
    if (source === END_NODE_ID || target === START_NODE_ID) {
      return false;
    }
    if (
      target !== END_NODE_ID &&
      !block.nodes.some((node) => node.id === target)
    ) {
      return false;
    }

    if (source === START_NODE_ID) {
      return target !== END_NODE_ID;
    }

    const sourceNode = getGraphNodeById(block, source);
    if (!sourceNode) {
      return false;
    }

    if (isLayoutGraphNode(sourceNode)) {
      return !wouldCreateGraphCycle(block, source, target);
    }

    return (
      isBranchKey(candidate.sourceHandle?.trim() ?? null) &&
      !wouldCreateGraphCycle(block, source, target)
    );
  };

  const handleConnect = (connection: Connection) => {
    if (!isValidConnection(connection)) {
      return;
    }

    updateBlock((current) => {
      const source = connection.source!.trim();
      const target = connection.target!.trim();
      const sourceNode = getGraphNodeById(current, source);
      const sourceHandle =
        source === START_NODE_ID
          ? null
          : sourceNode && isLayoutGraphNode(sourceNode)
            ? "next"
            : connection.sourceHandle?.trim() ?? null;
      if (source !== START_NODE_ID && !sourceHandle) {
        return current;
      }

      return {
        ...current,
        connections: [
          ...current.connections.filter(
            (entry) =>
              !(
                entry.source === source &&
                (entry.sourceHandle?.trim() || null) === sourceHandle
              ),
          ),
          {
            id: toConnectionId({
              source,
              sourceHandle,
              target,
            }),
            source,
            sourceHandle,
            target,
          },
        ],
      };
    });
  };

  const handleNodesChange = (changes: NodeChange[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
  };

  const handleEdgesChange = (changes: EdgeChange[]) => {
    setEdges((current) => applyEdgeChanges(changes, current));
  };

  const handleNodeDragStop = (_event: unknown, node: Node) => {
    updateBlock((current) => ({
      ...current,
      nodePositions: {
        ...current.nodePositions,
        [node.id]: {
          x: roundPosition(node.position.x),
          y: roundPosition(node.position.y),
        },
      },
    }));
  };

  const handleEdgesDelete = (deletedEdges: Edge[]) => {
    const deletedEdgeIds = new Set(deletedEdges.map((edge) => edge.id));
    if (deletedEdgeIds.size === 0) {
      return;
    }

    updateBlock((current) => ({
      ...current,
      connections: current.connections.filter(
        (connection) => !deletedEdgeIds.has(connection.id),
      ),
    }));
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!reactFlowInstance) {
      return;
    }

    const blockType = event.dataTransfer.getData(GRAPH_NODE_DRAG_TYPE);
    if (blockType !== "layout-node" && blockType !== "photo-orientation-node") {
      return;
    }

    const position = reactFlowInstance.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    if (blockType === "photo-orientation-node") {
      addPhotoOrientationNodeAtPosition(position);
      return;
    }

    if (layoutOptions.length === 0) {
      return;
    }

    addLayoutNodeAtPosition(position);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const selectedLayoutNode = selectedNodeId
    ? block.nodes.find(
        (node): node is PhotoRouterLayoutNode =>
          node.id === selectedNodeId && isLayoutGraphNode(node),
      ) ?? null
    : null;
  const selectedActionNode = selectedNodeId
    ? block.nodes.find(
        (node): node is PhotoRouterPhotoOrientationNode =>
          node.id === selectedNodeId && isPhotoOrientationNode(node),
      ) ?? null
    : null;
  const selectedCanvasAction = getCanvasActionTypeById(
    selectedActionNode?.photoActionType || getDefaultCanvasActionTypeId(),
  );
  const runtimeStatusMeta = useMemo(() => {
    if (!runtimeHealth) {
      return null;
    }

    const summaryLines =
      runtimeHealth.issues.length === 0
        ? ["No issues found. Runtime path resolves for current set logic."]
        : runtimeHealth.issues.map((issue) => issue.message);
    const pathLines = runtimeHealth.paths.map((path) => `${path.label}: ${path.summary}`);

    return {
      icon: runtimeHealth.status === "ok" ? "✓" : "!",
      className:
        runtimeHealth.status === "ok"
          ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-100"
          : "border-amber-400/60 bg-amber-500/15 text-amber-100",
      title: [
        runtimeHealth.status === "ok" ? "Runtime healthy" : "Runtime warnings found",
        "Checks use the same logic the display runtime executes.",
        ...summaryLines,
        ...pathLines,
      ].join("\n"),
    };
  }, [runtimeHealth]);

  const updateSelectedLayoutNode = (
    updater: (current: PhotoRouterLayoutNode) => PhotoRouterLayoutNode,
  ) => {
    if (!selectedLayoutNode) {
      return;
    }

    updateBlock((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === selectedLayoutNode.id && isLayoutGraphNode(node)
          ? updater(node)
          : node,
      ),
    }));
  };

  const updateSelectedActionNode = (
    updater: (
      current: PhotoRouterPhotoOrientationNode,
    ) => PhotoRouterPhotoOrientationNode,
  ) => {
    if (!selectedActionNode) {
      return;
    }

    updateBlock((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === selectedActionNode.id && isPhotoOrientationNode(node)
          ? updater(node)
          : node,
      ),
    }));
  };

  const renderConditionalSettings = (
    trigger: ConditionalTrigger,
    branch: PhotoRouterPhotoOrientationNode["portrait"],
    updateBranch: (
      updater: (current: PhotoRouterPhotoOrientationNode["portrait"]) => PhotoRouterPhotoOrientationNode["portrait"],
    ) => void,
  ) => {
    const conditionDefinition = getConditionTypeById(branch.conditionType);
    const conditionParams = parseConditionParamsByType(
      branch.conditionType,
      branch.conditionParams,
    );
    const conditionBranchCopy = getConditionBranchCopy(branch.conditionType);

    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
        <div>
          <p className="text-sm font-semibold text-slate-100">
            {conditionBranchCopy.title}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Connect this output to the first layout node when the condition matches.
          </p>
        </div>

        <label className="mt-4 block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Condition
          </span>
          <select
            className="h-10 w-full rounded border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100"
            value={branch.conditionType ?? getDefaultConditionTypeForTrigger(trigger) ?? ""}
            onChange={(event) =>
              updateBranch((current) => ({
                ...current,
                enabled: true,
                conditionType: event.target.value,
                conditionParams: parseConditionParamsByType(event.target.value, {}),
              }))
            }
          >
            {LOGIC_CONDITION_TYPES.filter(
              (condition) =>
                condition.trigger === trigger || condition.trigger === "landscape-photo",
            ).map((condition) => (
              <option key={condition.id} value={condition.id}>
                {condition.label}
              </option>
            ))}
          </select>
        </label>

        <p className="mt-2 text-xs text-slate-400">
          {conditionDefinition?.description ??
            "Select which photo condition must match before this route runs."}
        </p>

        {conditionDefinition?.paramFields?.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {conditionDefinition.paramFields.map((field) => (
              <ParamFieldEditor
                key={field.key}
                field={field}
                value={conditionParams[field.key]}
                onChange={(value) =>
                  updateBranch((current) => ({
                    ...current,
                    conditionParams: {
                      ...conditionParams,
                      [field.key]: value,
                    },
                  }))
                }
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <section className="rounded-xl border border-slate-700/80 bg-slate-950/70 p-4">
      <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_340px]">
        <aside className="space-y-4 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">
              Palette
            </p>
            <p className="mt-1 text-xs text-slate-500">Drag a node to canvas.</p>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Layout Nodes
            </p>
            <button
              type="button"
              draggable={layoutOptions.length > 0}
              disabled={layoutOptions.length === 0}
              className="mt-3 flex w-full items-center justify-between rounded-xl border border-cyan-500/50 bg-cyan-500/10 px-3 py-3 text-left text-cyan-100 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              onDragStart={(event) => {
                event.dataTransfer.setData(GRAPH_NODE_DRAG_TYPE, "layout-node");
                event.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() =>
                addLayoutNodeAtPosition({
                  x: DEFAULT_DETACHED_ORIGIN.x,
                  y: DEFAULT_DETACHED_ORIGIN.y,
                })
              }
            >
              <span className="block text-sm font-semibold">Layout Node</span>
            </button>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Action Nodes
            </p>
            <button
              type="button"
              draggable
              className="mt-3 flex w-full items-center justify-between rounded-xl border border-emerald-500/50 bg-emerald-500/10 px-3 py-3 text-left text-emerald-100 transition hover:bg-emerald-500/20"
              onDragStart={(event) => {
                event.dataTransfer.setData(
                  GRAPH_NODE_DRAG_TYPE,
                  "photo-orientation-node",
                );
                event.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => addPhotoOrientationNodeAtPosition(DEFAULT_ROUTER_POSITION)}
            >
              <span className="block text-sm font-semibold">Photo Orientation Node</span>
            </button>
          </div>

        </aside>

        <div
          className="h-[760px] overflow-hidden rounded-xl border border-slate-700 bg-slate-950"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            proOptions={{ hideAttribution: true }}
            onInit={setReactFlowInstance}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={handleConnect}
            onNodeDragStop={handleNodeDragStop}
            onNodesDelete={handleNodesDelete}
            onEdgesDelete={handleEdgesDelete}
            onNodeClick={(_event, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            fitView
            minZoom={0.35}
            maxZoom={1.5}
            deleteKeyCode={["Backspace", "Delete"]}
            isValidConnection={isValidConnection}
            panOnDrag={isCanvasInteractive}
            zoomOnScroll={isCanvasInteractive}
            zoomOnPinch={isCanvasInteractive}
            zoomOnDoubleClick={isCanvasInteractive}
            connectionLineType={ConnectionLineType.SimpleBezier}
            connectionLineStyle={{
              stroke: "#cbd5e1",
              strokeOpacity: 0.55,
              strokeWidth: 2.2,
              strokeDasharray: EDGE_DASH_PATTERN,
              strokeLinecap: "round",
              strokeLinejoin: "round",
            }}
            className="bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.08),_rgba(2,6,23,0.95)_55%)]"
            nodesConnectable={isCanvasInteractive}
            nodesDraggable={isCanvasInteractive}
            elementsSelectable={isCanvasInteractive}
          >
            <Background color="#1e293b" gap={24} size={1.2} />
            {runtimeStatusMeta ? (
              <Panel position="top-right">
                <div
                  title={runtimeStatusMeta.title}
                  aria-label={runtimeStatusMeta.title}
                  className={`flex h-10 w-10 items-center justify-center rounded-full border text-base font-bold shadow-[0_10px_30px_rgba(2,6,23,0.35)] ${runtimeStatusMeta.className}`}
                >
                  {runtimeStatusMeta.icon}
                </div>
              </Panel>
            ) : null}
            <Panel position="bottom-right">
              <div className="divide-y divide-cyan-500/25 overflow-hidden rounded-[22px] border border-cyan-500/40 bg-slate-950/92 shadow-[0_0_0_1px_rgba(14,116,144,0.25),0_8px_18px_rgba(2,6,23,0.55)]">
                <CanvasControlButton
                  title="Zoom in"
                  disabled={!reactFlowInstance || !isCanvasInteractive}
                  onClick={() => {
                    void reactFlowInstance?.zoomIn({ duration: 140 });
                  }}
                >
                  <span className="text-[30px] font-light leading-none">+</span>
                </CanvasControlButton>
                <CanvasControlButton
                  title="Zoom out"
                  disabled={!reactFlowInstance || !isCanvasInteractive}
                  onClick={() => {
                    void reactFlowInstance?.zoomOut({ duration: 140 });
                  }}
                >
                  <span className="text-[30px] font-light leading-none">−</span>
                </CanvasControlButton>
                <CanvasControlButton
                  title="Fit canvas"
                  disabled={!reactFlowInstance || !isCanvasInteractive}
                  onClick={() => {
                    void reactFlowInstance?.fitView({
                      duration: 160,
                      padding: 0.18,
                    });
                  }}
                >
                  <FitViewIcon />
                </CanvasControlButton>
                <CanvasControlButton
                  title={isCanvasInteractive ? "Lock canvas" : "Unlock canvas"}
                  active={!isCanvasInteractive}
                  onClick={() => {
                    setIsCanvasInteractive((current) => !current);
                  }}
                >
                  <LockIcon locked={!isCanvasInteractive} />
                </CanvasControlButton>
              </div>
            </Panel>
          </ReactFlow>
        </div>

        <aside className="space-y-4 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">
              Inspector
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {selectedLayoutNode
                ? "Edit the selected layout node."
                : selectedActionNode
                  ? "Edit the action node settings and portrait route."
                  : "Select an action or layout node to edit it."}
            </p>
          </div>

          {selectedLayoutNode ? (
            <>
              <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-4">
                <div>
                  <p className="text-base font-semibold text-slate-100">
                    Layout Node
                  </p>
                  <p className="mt-1 text-sm text-slate-300">
                    {selectedLayoutNode.layoutName}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Node {selectedLayoutNode.id.slice(0, 8)}
                  </p>
                </div>

                <div className="mt-4 space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Layout
                    </span>
                    <select
                      className="h-10 w-full rounded border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100"
                      value={selectedLayoutNode.layoutName}
                      onChange={(event) =>
                        updateSelectedLayoutNode((current) => ({
                          ...current,
                          layoutName: event.target.value,
                        }))
                      }
                    >
                      {layoutOptions.map((layout) => (
                        <option key={layout.id} value={layout.name}>
                          {layout.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Show (sec)
                    </span>
                    <input
                      type="number"
                      min={3}
                      max={3600}
                      step={1}
                      value={selectedLayoutNode.cycleSeconds}
                      className="h-10 w-full rounded border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100"
                      onChange={(event) => {
                        const parsed = Number.parseInt(event.target.value, 10);
                        if (!Number.isFinite(parsed)) {
                          return;
                        }
                        updateSelectedLayoutNode((current) => ({
                          ...current,
                          cycleSeconds: clampCycleSeconds(parsed),
                        }));
                      }}
                    />
                  </label>

                </div>
              </div>

              {(() => {
                const actionType = getActionTypeById(selectedLayoutNode.actionType);
                const actionParams = parseActionParamsByType(
                  selectedLayoutNode.actionType,
                  selectedLayoutNode.actionParams,
                );
                const photoCollectionId =
                  typeof actionParams[PHOTO_COLLECTION_ACTION_PARAM_KEY] === "string"
                    ? actionParams[PHOTO_COLLECTION_ACTION_PARAM_KEY].trim()
                    : "";

                return (
                  <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-4">
                    <p className="text-sm font-semibold text-slate-100">Action settings</p>
                    <p className="mt-1 text-xs text-slate-400">{actionType.description}</p>

                    <div className="mt-4 space-y-3">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          Photo source override
                        </span>
                        <select
                          className="h-10 w-full rounded border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100"
                          value={photoCollectionId}
                          onChange={(event) =>
                            updateSelectedLayoutNode((current) => ({
                              ...current,
                              actionParams: {
                                ...actionParams,
                                [PHOTO_COLLECTION_ACTION_PARAM_KEY]:
                                  event.target.value.trim() || null,
                              },
                            }))
                          }
                        >
                          <option value="">/photos</option>
                          {photoCollectionOptions.map((collection) => (
                            <option key={collection.id} value={collection.id}>
                              Collection: {collection.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      {actionType.paramFields?.map((field) => (
                        <ParamFieldEditor
                          key={field.key}
                          field={field}
                          value={actionParams[field.key]}
                          onChange={(value) =>
                            updateSelectedLayoutNode((current) => ({
                              ...current,
                              actionParams: {
                                ...actionParams,
                                [field.key]: value,
                              },
                            }))
                          }
                        />
                      ))}
                    </div>
                  </div>
                );
              })()}
            </>
          ) : selectedActionNode ? (
            <>
              <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-4">
                <p className="text-base font-semibold text-slate-100">Action node settings</p>
                <div className="mt-4 space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Node name
                    </span>
                    <input
                      type="text"
                      value={selectedActionNode.title}
                      className="h-10 w-full rounded border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100"
                      onChange={(event) =>
                        updateSelectedActionNode((current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Photo action
                    </span>
                    <select
                      className="h-10 w-full rounded border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100"
                      value={selectedCanvasAction.id}
                      onChange={(event) =>
                        updateSelectedActionNode((current) => ({
                          ...current,
                          photoActionType:
                            event.target.value.trim() || getDefaultCanvasActionTypeId(),
                        }))
                      }
                    >
                      {LOGIC_CANVAS_ACTION_TYPES.map((action) => (
                        <option key={action.id} value={action.id}>
                          {action.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Photo source
                    </span>
                    <select
                      className="h-10 w-full rounded border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100"
                      value={selectedActionNode.photoActionCollectionId ?? ""}
                      onChange={(event) =>
                        updateSelectedActionNode((current) => ({
                          ...current,
                          photoActionCollectionId: event.target.value.trim() || null,
                        }))
                      }
                    >
                      <option value="">/photos</option>
                      {photoCollectionOptions.map((collection) => (
                        <option key={collection.id} value={collection.id}>
                          Collection: {collection.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="mt-3 text-xs text-slate-400">{selectedCanvasAction.description}</p>
              </div>

              {renderConditionalSettings("portrait-photo", selectedActionNode.portrait, (updater) =>
                updateSelectedActionNode((current) => ({
                  ...current,
                  portrait: updater(current.portrait),
                }))
              )}
            </>
          ) : null}
        </aside>
      </div>
    </section>
  );
};

export default PhotoRouterBlockEditor;
