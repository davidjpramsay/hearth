import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import type { AutoLayoutTarget } from "@hearth/shared";
import {
  LOGIC_ACTION_TYPES,
  LOGIC_CANVAS_ACTION_TYPES,
  LOGIC_CONDITION_TYPES,
  getActionTypeById,
  getCanvasActionTypeById,
  getConditionTypeById,
  getDefaultActionParams,
  getDefaultActionTypeId,
  getDefaultCanvasActionTypeId,
  getDefaultConditionParamsForTrigger,
  getDefaultConditionTypeForTrigger,
  parseActionParamsByType,
  parseConditionParamsByType,
  getTriggerLabel,
  type LogicActionFieldDefinition,
  type LogicParamFieldDefinition,
  type LogicBranchTrigger,
} from "./logicNodeRegistry";
export type { LogicBranchTrigger } from "./logicNodeRegistry";

interface AddRuleRequest {
  trigger: LogicBranchTrigger;
  actionType?: string;
  actionParams?: Record<string, unknown>;
  conditionType?: string | null;
  conditionParams?: Record<string, unknown>;
  insertIndex?: number;
}

interface LayoutOption {
  id: number;
  name: string;
}

interface PhotoCollectionOption {
  id: string;
  name: string;
}

type CanvasEdgeStatePayload = {
  nodePositions: Record<
    string,
    {
      x: number;
      y: number;
    }
  >;
  edgeOverrides: Record<
    string,
    {
      source: string;
      target: string;
      sourceHandle?: string | null;
      targetHandle?: string | null;
    }
  >;
  disconnectedEdgeIds: string[];
};

interface LayoutSetLogicCanvasProps {
  layoutOptions: LayoutOption[];
  photoCollectionOptions: PhotoCollectionOption[];
  portraitRules: AutoLayoutTarget[];
  landscapeRules: AutoLayoutTarget[];
  fallbackRules: AutoLayoutTarget[];
  photoActionType: string;
  photoActionCollectionId: string | null;
  nodePositions: CanvasEdgeStatePayload["nodePositions"];
  edgeOverrides: CanvasEdgeStatePayload["edgeOverrides"];
  disconnectedEdgeIds: string[];
  onClearRules: () => void;
  onUpdatePhotoActionType: (actionType: string) => void;
  onUpdatePhotoActionCollectionId: (collectionId: string | null) => void;
  onUpdateEdgeState: (input: CanvasEdgeStatePayload) => void;
  onAddRule: (input: AddRuleRequest) => void;
  onUpdateRule: (
    trigger: LogicBranchTrigger,
    index: number,
    nextRule: AutoLayoutTarget,
  ) => void;
  onRemoveRule: (trigger: LogicBranchTrigger, index: number) => void;
}

type PaletteBlockType = "layout" | "if" | "action";

interface StepNodeData extends Record<string, unknown> {
  label: string;
  tone?: "normal" | "decision" | "terminal" | "muted";
  hasTargetHandle?: boolean;
  hasSourceHandle?: boolean;
}

interface ActionNodeData extends StepNodeData {
}

interface CircleNodeData extends Record<string, unknown> {
  label: string;
  hasTargetHandle?: boolean;
  hasSourceHandle?: boolean;
}

interface DecisionNodeData extends Record<string, unknown> {
  label: string;
  conditionLabel?: string;
}

interface RuleNodeData extends Record<string, unknown> {
  trigger: LogicBranchTrigger;
  index: number;
  rule: AutoLayoutTarget;
  layoutOptions: LayoutOption[];
  summary: string;
  onSelectRule: (trigger: LogicBranchTrigger, index: number) => void;
  onUpdateRule: (
    trigger: LogicBranchTrigger,
    index: number,
    nextRule: AutoLayoutTarget,
  ) => void;
  onRemoveRule: (trigger: LogicBranchTrigger, index: number) => void;
}

interface MergeNodeData extends Record<string, unknown> {
}

interface ConnectStartHandleContext {
  nodeId: string | null;
  handleId: string | null;
  handleType: "source" | "target" | null;
}

type StepFlowNode = Node<StepNodeData, "stepNode">;
type ActionFlowNode = Node<ActionNodeData, "actionNode">;
type CircleFlowNode = Node<CircleNodeData, "circleNode">;
type DecisionFlowNode = Node<DecisionNodeData, "decisionNode">;
type RuleFlowNode = Node<RuleNodeData, "ruleNode">;
type MergeFlowNode = Node<MergeNodeData, "mergeNode">;

const clampCycleSeconds = (value: number): number =>
  Math.max(3, Math.min(3600, Math.round(value)));

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

const toParamNumberValue = (
  value: unknown,
  fallback: number,
): number => {
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

const toneClassName: Record<NonNullable<StepNodeData["tone"]>, string> = {
  normal: "border-slate-600 bg-slate-800/90 text-slate-100",
  decision: "border-cyan-400/60 bg-cyan-500/10 text-cyan-100",
  terminal: "border-emerald-400/50 bg-emerald-500/10 text-emerald-100",
  muted: "border-slate-700/80 bg-slate-900/70 text-slate-400",
};

const paletteBlocks: Array<{ type: PaletteBlockType; label: string }> = [
  { type: "layout", label: "Layout" },
  { type: "if", label: "If" },
  { type: "action", label: "Action" },
];

const PaletteBlock = ({
  type,
  label,
  onCreate,
}: {
  type: PaletteBlockType;
  label: string;
  onCreate: (type: PaletteBlockType) => void;
}) => {
  const isDecisionShape = type === "if";
  const isActionShape = type === "action";
  return (
    <button
      type="button"
      draggable
      aria-label={`Add ${label} block`}
      className="relative h-10 w-[132px] cursor-grab select-none text-cyan-100 active:cursor-grabbing"
      onDragStart={(event) => {
        event.dataTransfer.setData("application/hearth-logic-block", type);
        event.dataTransfer.effectAllowed = "copyMove";
      }}
    >
      {isDecisionShape ? (
        <>
          <svg
            viewBox="0 0 100 100"
            className="absolute left-1/2 top-1/2 h-11 w-11 -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_0_0.5px_rgba(34,211,238,0.8)]"
            aria-hidden
          >
            <polygon
              points="50,1 99,50 50,99 1,50"
              fill="rgba(6,182,212,0.12)"
              stroke="rgba(34,211,238,0.9)"
              strokeWidth="1.25"
            />
          </svg>
          <span className="relative z-10 flex h-full items-center justify-center px-2 text-center text-xs font-semibold leading-tight">
            {label}
          </span>
        </>
      ) : isActionShape ? (
        <>
          <span className="absolute inset-x-2 inset-y-1.5 skew-x-[-20deg] rounded-sm border border-cyan-500/70 bg-cyan-500/10 shadow-[0_0_0_1px_rgba(34,211,238,0.2)]" />
          <span className="relative z-10 flex h-full items-center justify-center px-2 text-center text-xs font-semibold leading-tight">
            {label}
          </span>
        </>
      ) : (
        <span className="absolute inset-x-2 inset-y-1.5 z-10 flex items-center justify-center rounded border border-cyan-500/60 bg-cyan-500/10 px-3 text-sm font-semibold hover:bg-cyan-500/20">
          {label}
        </span>
      )}
    </button>
  );
};

const StepNode = ({ data }: NodeProps<StepFlowNode>) => (
  <div
    className={`rounded-lg border px-3 py-2 text-sm font-semibold tracking-wide ${
      toneClassName[data.tone ?? "normal"]
    }`}
  >
    {data.hasTargetHandle !== false ? (
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !border-none !bg-slate-400"
      />
    ) : null}
    <div className="text-center">{data.label}</div>
    {data.hasSourceHandle !== false ? (
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2 !w-2 !border-none !bg-slate-400"
      />
    ) : null}
  </div>
);

const ActionNode = ({ data }: NodeProps<ActionFlowNode>) => (
  <div className="relative h-full w-full">
    {data.hasTargetHandle !== false ? (
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !border-none !bg-cyan-300"
      />
    ) : null}
    <div className="absolute inset-0 skew-x-[-18deg] rounded border border-cyan-500/70 bg-cyan-500/10 shadow-[0_0_0_1px_rgba(34,211,238,0.2)]" />
    <div className="relative z-10 flex h-full w-full items-center justify-center px-4 text-center text-sm font-semibold text-cyan-100">
      {data.label}
    </div>
    {data.hasSourceHandle !== false ? (
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2 !w-2 !border-none !bg-cyan-300"
      />
    ) : null}
  </div>
);

const CircleNode = ({ data }: NodeProps<CircleFlowNode>) => (
  <div className="relative h-full w-full">
    {data.hasTargetHandle !== false ? (
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !border-none !bg-slate-300"
      />
    ) : null}
    <div className="flex h-full w-full items-center justify-center rounded-full border border-slate-500/80 bg-slate-800/90 px-3 text-center text-sm font-semibold leading-tight text-slate-100 shadow-[0_0_0_1px_rgba(148,163,184,0.25)]">
      {data.label}
    </div>
    {data.hasSourceHandle !== false ? (
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2 !w-2 !border-none !bg-slate-300"
      />
    ) : null}
  </div>
);

const RuleNode = ({ data }: NodeProps<RuleFlowNode>) => (
  <div
    className="rounded-lg border border-cyan-500/50 bg-slate-900/95 p-2 shadow-[0_0_0_1px_rgba(34,211,238,0.2)]"
    onPointerDown={(event) => event.stopPropagation()}
    onMouseDown={(event) => event.stopPropagation()}
    onClick={(event) => {
      event.stopPropagation();
      data.onSelectRule(data.trigger, data.index);
    }}
  >
    <Handle
      type="target"
      position={Position.Top}
      className="!h-2 !w-2 !border-none !bg-cyan-400"
    />
    <div className="mb-2 rounded border border-cyan-500/30 bg-slate-950/70 px-2 py-1 text-[11px] font-semibold text-cyan-100">
      {data.summary}
    </div>
    <div className="flex items-center gap-2">
      <select
        aria-label="Layout name"
        value={data.rule.layoutName}
        className="nodrag h-10 min-w-0 flex-1 rounded border border-slate-700 bg-slate-800 px-2 text-sm text-slate-100"
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) =>
          data.onUpdateRule(data.trigger, data.index, {
            ...data.rule,
            layoutName: event.target.value,
          })
        }
      >
        {data.layoutOptions.map((layout) => (
          <option key={layout.id} value={layout.name}>
            {layout.name}
          </option>
        ))}
      </select>
      <input
        aria-label="Show seconds"
        type="number"
        min={3}
        max={3600}
        step={1}
        value={data.rule.cycleSeconds}
        className="nodrag h-10 w-[92px] rounded border border-slate-700 bg-slate-800 px-2 text-sm text-slate-100"
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => {
          const parsed = Number.parseInt(event.target.value, 10);
          if (!Number.isFinite(parsed)) {
            return;
          }
          data.onUpdateRule(data.trigger, data.index, {
            ...data.rule,
            cycleSeconds: clampCycleSeconds(parsed),
          });
        }}
      />
    </div>
    <Handle
      type="source"
      position={Position.Bottom}
      className="!h-2 !w-2 !border-none !bg-cyan-400"
    />
  </div>
);

const DecisionNode = ({ data }: NodeProps<DecisionFlowNode>) => {
  const [showCondition, setShowCondition] = useState(false);
  const displayLabel =
    showCondition && data.conditionLabel ? data.conditionLabel : data.label;

  return (
    <button
      type="button"
      onClick={() => setShowCondition((current) => !current)}
      className="relative h-full w-full cursor-pointer text-left"
      title={
        data.conditionLabel
          ? showCondition
            ? "Click to show 'If'"
            : "Click to show condition"
          : undefined
      }
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !border-none !bg-cyan-300"
      />
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-2 h-[calc(100%-1rem)] w-[calc(100%-1rem)] drop-shadow-[0_0_0.5px_rgba(34,211,238,0.35)]"
        aria-hidden
      >
        <polygon
          points="50,1 99,50 50,99 1,50"
          fill="rgba(6,182,212,0.10)"
          stroke="rgba(6,182,212,0.70)"
          strokeWidth="1.15"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center px-8 text-center text-sm font-semibold leading-tight text-cyan-100">
        {displayLabel}
      </div>
      <Handle
        type="source"
        id="yes"
        position={Position.Left}
        className="!h-2 !w-2 !border-none !bg-cyan-300"
      />
      <Handle
        type="source"
        id="no"
        position={Position.Right}
        className="!h-2 !w-2 !border-none !bg-cyan-300"
      />
    </button>
  );
};

const MergeNode = (_props: NodeProps<MergeFlowNode>) => (
  <div className="relative h-full w-full">
    <Handle
      type="target"
      position={Position.Top}
      className="!h-2 !w-2 !border-none !bg-transparent !opacity-0"
    />
    <div className="h-full w-full rounded-full border border-slate-300/85 bg-slate-300 shadow-[0_0_0_1px_rgba(148,163,184,0.35)]" />
    <Handle
      type="source"
      position={Position.Bottom}
      className="!h-2 !w-2 !border-none !bg-transparent !opacity-0"
    />
  </div>
);

const nodeTypes: NodeTypes = {
  circleNode: CircleNode,
  stepNode: StepNode,
  actionNode: ActionNode,
  decisionNode: DecisionNode,
  ruleNode: RuleNode,
  mergeNode: MergeNode,
};

const createEdge = (input: {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  type?: Edge["type"];
  pathOptions?: Record<string, unknown>;
  label?: string;
  animated?: boolean;
  dashed?: boolean;
}): Edge => ({
  id: input.id,
  source: input.source,
  target: input.target,
  sourceHandle: input.sourceHandle,
  targetHandle: input.targetHandle,
  type: input.type ?? "simplebezier",
  ...(input.pathOptions ? { pathOptions: input.pathOptions } : {}),
  label: input.label,
  animated: input.animated ?? false,
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 18,
    height: 18,
    color: "#64748b",
  },
  style: {
    stroke: "#64748b",
    strokeWidth: 1.5,
    vectorEffect: "non-scaling-stroke",
    strokeDasharray: input.dashed ? "4 4" : undefined,
  },
  labelStyle: {
    fill: "#a5f3fc",
    fontWeight: 700,
    fontSize: 11,
  },
  labelBgStyle: {
    fill: "#020617",
    fillOpacity: 0.8,
  },
  labelBgPadding: [4, 2],
  labelBgBorderRadius: 4,
});

const DEFAULT_NODE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  actionNode: { width: 340, height: 56 },
  stepNode: { width: 340, height: 56 },
  decisionNode: { width: 180, height: 180 },
  circleNode: { width: 116, height: 116 },
  ruleNode: { width: 380, height: 72 },
  mergeNode: { width: 8, height: 8 },
};

const getNodeDimensions = (node: Node): { width: number; height: number } => {
  const fallback = DEFAULT_NODE_DIMENSIONS[node.type ?? ""] ?? {
    width: 320,
    height: 56,
  };

  const styleWidth = typeof node.style?.width === "number" ? node.style.width : null;
  const styleHeight = typeof node.style?.height === "number" ? node.style.height : null;

  const measuredWidth =
    typeof node.measured?.width === "number" ? node.measured.width : null;
  const measuredHeight =
    typeof node.measured?.height === "number" ? node.measured.height : null;

  return {
    width: styleWidth ?? measuredWidth ?? fallback.width,
    height: styleHeight ?? measuredHeight ?? fallback.height,
  };
};

const serializeCanvasEdgeState = (input: CanvasEdgeStatePayload): string => {
  const sortedNodePositions = Object.fromEntries(
    Object.keys(input.nodePositions)
      .sort((left, right) => left.localeCompare(right))
      .map((nodeId) => {
        const position = input.nodePositions[nodeId];
        return [
          nodeId,
          {
            x: Number.isFinite(position.x) ? position.x : 0,
            y: Number.isFinite(position.y) ? position.y : 0,
          },
        ] as const;
      }),
  );

  const sortedEdgeOverrides = Object.fromEntries(
    Object.keys(input.edgeOverrides)
      .sort((left, right) => left.localeCompare(right))
      .map((edgeId) => {
        const override = input.edgeOverrides[edgeId];
        return [
          edgeId,
          {
            source: override.source,
            target: override.target,
            sourceHandle: override.sourceHandle ?? null,
            targetHandle: override.targetHandle ?? null,
          },
        ] as const;
      }),
  );

  return JSON.stringify({
    nodePositions: sortedNodePositions,
    edgeOverrides: sortedEdgeOverrides,
    disconnectedEdgeIds: [...input.disconnectedEdgeIds]
      .map((edgeId) => edgeId.trim())
      .filter((edgeId) => edgeId.length > 0)
      .sort((left, right) => left.localeCompare(right)),
  });
};

const toDisconnectedEdgeIdRecord = (edgeIds: string[]): Record<string, true> =>
  Object.fromEntries(
    edgeIds
      .map((edgeId) => edgeId.trim())
      .filter((edgeId) => edgeId.length > 0)
      .map((edgeId) => [edgeId, true] as const),
  );

const buildGraph = (input: {
  portraitRules: AutoLayoutTarget[];
  landscapeRules: AutoLayoutTarget[];
  fallbackRules: AutoLayoutTarget[];
  layoutOptions: LayoutOption[];
  photoActionLabel?: string;
  showPhotoActionNode?: boolean;
  showPortraitDecision?: boolean;
  showLandscapeDecision?: boolean;
  onSelectRule: (trigger: LogicBranchTrigger, index: number) => void;
  onUpdateRule: LayoutSetLogicCanvasProps["onUpdateRule"];
  onRemoveRule: LayoutSetLogicCanvasProps["onRemoveRule"];
}): { nodes: Node[]; edges: Edge[]; canvasHeight: number } => {
  const centerX = 760;
  const circleNodeSize = 116;
  const rectNodeHeight = 56;
  const centerStepWidth = 340;
  const decisionNodeSize = 180;
  const ruleWidth = 380;
  const baseY = 24;
  const stepGap = 58;
  const branchGap = 92;
  const ruleGap = 132;
  const returnGap = 96;
  const ruleNodeHeightEstimate = 72;
  const mergeNodeSize = 8;
  const mergeGap = 40;

  const primaryBranchOffset = 350;
  const secondaryBranchOffset = 250;

  const portraitRows = input.portraitRules.length;
  const landscapeRows = input.landscapeRules.length;
  const fallbackRows = input.fallbackRules.length;
  const totalRuleCount = portraitRows + landscapeRows + fallbackRows;
  const hasPortrait = portraitRows > 0 || Boolean(input.showPortraitDecision);
  const hasLandscape = landscapeRows > 0 || Boolean(input.showLandscapeDecision);
  const hasFallback = fallbackRows > 0;
  const hasLandscapeDecision = hasLandscape;
  const requiresPhotoSelection =
    portraitRows > 0 || landscapeRows > 0 || Boolean(input.showPhotoActionNode);
  const hasRenderableGraph =
    totalRuleCount > 0 ||
    hasPortrait ||
    hasLandscapeDecision ||
    requiresPhotoSelection;

  if (!hasRenderableGraph) {
    const yStart = baseY;
    const yReturn = yStart + circleNodeSize + 180;
    const nodes: Node[] = [
      {
        id: "start",
        type: "circleNode",
        position: { x: centerX - circleNodeSize / 2, y: yStart },
        selectable: false,
        style: { width: circleNodeSize, height: circleNodeSize },
        data: {
          label: "Start",
          hasTargetHandle: false,
        } satisfies CircleNodeData,
      },
      {
        id: "return",
        type: "circleNode",
        position: { x: centerX - circleNodeSize / 2, y: yReturn },
        draggable: true,
        selectable: false,
        style: { width: circleNodeSize, height: circleNodeSize },
        data: {
          label: "Return to start",
          hasSourceHandle: false,
        } satisfies CircleNodeData,
      },
    ];
    const edges: Edge[] = [
      createEdge({
        id: "edge-start-return",
        source: "start",
        target: "return",
      }),
    ];
    return {
      nodes,
      edges,
      canvasHeight: Math.max(520, yReturn + circleNodeSize + 112),
    };
  }

  const yStart = baseY;
  const yPhoto = yStart + circleNodeSize + stepGap;
  const yAfterPhoto = requiresPhotoSelection
    ? yPhoto + rectNodeHeight + stepGap
    : yStart + circleNodeSize + stepGap;
  const yPortraitDecision = hasPortrait ? yAfterPhoto : null;
  const primaryBranchY = hasPortrait
    ? yAfterPhoto + decisionNodeSize + branchGap
    : null;
  const yLandscapeDecision = hasLandscapeDecision
    ? hasPortrait
      ? (primaryBranchY ?? yAfterPhoto)
      : yAfterPhoto
    : null;
  const secondaryBranchY =
    yLandscapeDecision === null
      ? null
      : yLandscapeDecision + decisionNodeSize + branchGap;

  const portraitRuleCenterX = centerX - primaryBranchOffset;
  const landscapeDecisionCenterX = centerX + primaryBranchOffset;
  const landscapeRuleCenterX = landscapeDecisionCenterX - secondaryBranchOffset;
  const fallbackRuleCenterX = centerX;

  const portraitRuleX = portraitRuleCenterX - ruleWidth / 2;
  const landscapeRuleX = landscapeRuleCenterX - ruleWidth / 2;
  const fallbackRuleX = fallbackRuleCenterX - ruleWidth / 2;

  const yPortraitStart = hasPortrait ? (primaryBranchY ?? yAfterPhoto) : null;
  const yLandscapeStart = hasLandscape ? (secondaryBranchY ?? yAfterPhoto) : null;
  const yFallbackStart = hasFallback
    ? hasLandscapeDecision
      ? (secondaryBranchY ?? yAfterPhoto)
      : hasPortrait
        ? (primaryBranchY ?? yAfterPhoto)
        : yAfterPhoto + branchGap
    : null;

  const nodes: Node[] = [
    {
      id: "start",
      type: "circleNode",
      position: { x: centerX - circleNodeSize / 2, y: yStart },
      selectable: false,
      style: { width: circleNodeSize, height: circleNodeSize },
      data: {
        label: "Start",
        hasTargetHandle: false,
      } satisfies CircleNodeData,
    },
  ];

  if (requiresPhotoSelection) {
    nodes.push({
      id: "select-photo",
      type: "actionNode",
      position: { x: centerX - centerStepWidth / 2, y: yPhoto },
      style: { width: centerStepWidth, height: rectNodeHeight },
      data: {
        label: input.photoActionLabel ?? "Select next photo from library",
      } satisfies ActionNodeData,
    });
  }

  if (hasPortrait) {
    nodes.push({
      id: "if-portrait",
      type: "decisionNode",
      position: {
        x: centerX - decisionNodeSize / 2,
        y: yPortraitDecision ?? yAfterPhoto,
      },
      style: { width: decisionNodeSize, height: decisionNodeSize },
      data: {
        label: "If",
        conditionLabel: "Selected photo is portrait?",
      } satisfies DecisionNodeData,
    });
  }

  if (hasLandscapeDecision) {
    nodes.push({
      id: "if-landscape",
      type: "decisionNode",
      position: {
        x: landscapeDecisionCenterX - decisionNodeSize / 2,
        y: yLandscapeDecision ?? yAfterPhoto,
      },
      style: { width: decisionNodeSize, height: decisionNodeSize },
      data: {
        label: "If",
        conditionLabel: "Selected photo is landscape?",
      } satisfies DecisionNodeData,
    });
  }

  const edges: Edge[] = [];

  if (requiresPhotoSelection) {
    edges.push(
      createEdge({ id: "edge-start-photo", source: "start", target: "select-photo" }),
    );
  }

  const addRuleNodes = (params: {
    trigger: LogicBranchTrigger;
    rules: AutoLayoutTarget[];
    x: number;
    startY: number;
  }): string[] => {
    if (params.rules.length === 0) {
      return [];
    }

    return params.rules.map((rule, index) => {
      const id = `rule-${params.trigger}-${index}`;
      nodes.push({
        id,
        type: "ruleNode",
        position: { x: params.x, y: params.startY + index * ruleGap },
        style: { width: ruleWidth },
        data: {
          trigger: params.trigger,
          index,
          rule,
          summary: getActionTypeById(rule.actionType).renderSummary({
            ...rule,
            actionParams: parseActionParamsByType(
              rule.actionType,
              rule.actionParams,
            ),
            conditionParams: parseConditionParamsByType(
              rule.conditionType,
              rule.conditionParams,
            ),
          }),
          layoutOptions: input.layoutOptions,
          onSelectRule: input.onSelectRule,
          onUpdateRule: input.onUpdateRule,
          onRemoveRule: input.onRemoveRule,
        } satisfies RuleNodeData,
      });
      return id;
    });
  };

  const portraitNodeIds = addRuleNodes({
    trigger: "portrait-photo",
    rules: input.portraitRules,
    x: portraitRuleX,
    startY: yPortraitStart ?? yAfterPhoto,
  });
  const landscapeNodeIds = addRuleNodes({
    trigger: "landscape-photo",
    rules: input.landscapeRules,
    x: landscapeRuleX,
    startY: yLandscapeStart ?? yAfterPhoto,
  });
  const fallbackNodeIds = addRuleNodes({
    trigger: "always",
    rules: input.fallbackRules,
    x: fallbackRuleX,
    startY: yFallbackStart ?? yAfterPhoto,
  });

  const estimateNodeHeight = (node: Node): number => {
    if (typeof node.style?.height === "number") {
      return node.style.height;
    }
    if (node.type === "decisionNode") {
      return decisionNodeSize;
    }
    if (node.type === "circleNode") {
      return circleNodeSize;
    }
    if (node.type === "ruleNode") {
      return ruleNodeHeightEstimate;
    }
    return rectNodeHeight;
  };

  const maxBodyBottom = nodes.reduce((maxBottom, node) => {
    return Math.max(maxBottom, node.position.y + estimateNodeHeight(node));
  }, 0);
  const yReturn = maxBodyBottom + returnGap;

  nodes.push({
    id: "return",
    type: "circleNode",
    position: { x: centerX - circleNodeSize / 2, y: yReturn },
    draggable: true,
    selectable: false,
    style: { width: circleNodeSize, height: circleNodeSize },
    data: {
      label: "Return to start",
      hasSourceHandle: false,
    } satisfies CircleNodeData,
  });

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const addMergeNode = (mergeId: string, targetId: string): string | null => {
    const targetNode = nodeById.get(targetId);
    if (!targetNode) {
      return null;
    }

    const targetDimensions = getNodeDimensions(targetNode);
    const mergeX = targetNode.position.x + targetDimensions.width / 2 - mergeNodeSize / 2;
    const mergeY = Math.max(
      baseY + 24,
      targetNode.position.y - mergeGap - mergeNodeSize,
    );

    const mergeNode: Node = {
      id: mergeId,
      type: "mergeNode",
      position: { x: mergeX, y: mergeY },
      draggable: true,
      selectable: false,
      style: {
        width: mergeNodeSize,
        height: mergeNodeSize,
      },
      data: {} satisfies MergeNodeData,
    };

    nodes.push(mergeNode);
    nodeById.set(mergeId, mergeNode);
    return mergeId;
  };

  const centerRuleChainBetween = (
    nodeIds: string[],
    windowTop: number,
    windowBottom: number,
  ) => {
    if (nodeIds.length === 0) {
      return;
    }
    const availableHeight = Math.max(0, windowBottom - windowTop);
    const chainHeight =
      (nodeIds.length - 1) * ruleGap + ruleNodeHeightEstimate;
    const offset = Math.max(0, (availableHeight - chainHeight) / 2);
    const startY = windowTop + offset;

    nodeIds.forEach((id, index) => {
      const node = nodeById.get(id);
      if (!node) {
        return;
      }
      node.position = {
        ...node.position,
        y: startY + index * ruleGap,
      };
    });
  };

  const returnWindowTop = yReturn - branchGap;

  if (hasPortrait && yPortraitDecision !== null) {
    centerRuleChainBetween(
      portraitNodeIds,
      yPortraitDecision + decisionNodeSize + branchGap,
      returnWindowTop,
    );
  }

  if (hasLandscapeDecision && yLandscapeDecision !== null) {
    centerRuleChainBetween(
      landscapeNodeIds,
      yLandscapeDecision + decisionNodeSize + branchGap,
      returnWindowTop,
    );
  }

  if (fallbackNodeIds.length > 0) {
    const fallbackWindowTop = hasLandscapeDecision && yLandscapeDecision !== null
      ? yLandscapeDecision + decisionNodeSize + branchGap
      : hasPortrait && yPortraitDecision !== null
        ? yPortraitDecision + decisionNodeSize + branchGap
        : yAfterPhoto + branchGap;
    centerRuleChainBetween(fallbackNodeIds, fallbackWindowTop, returnWindowTop);
  }

  const connectRuleChain = (
    nodeIds: string[],
    prefix: string,
    returnTargetId: string,
  ) => {
    if (nodeIds.length === 0) {
      return;
    }
    for (let index = 0; index < nodeIds.length - 1; index += 1) {
      edges.push(
        createEdge({
          id: `${prefix}-chain-${index}`,
          source: nodeIds[index],
          target: nodeIds[index + 1],
        }),
      );
    }
    edges.push(
      createEdge({
        id: `${prefix}-return`,
        source: nodeIds[nodeIds.length - 1],
        target: returnTargetId,
      }),
    );
  };

  const fallbackEntryNode = fallbackNodeIds[0] ?? "return";
  const landscapeEntryNode = hasLandscapeDecision ? "if-landscape" : fallbackEntryNode;
  const portraitPrimaryTarget = portraitNodeIds[0] ?? landscapeEntryNode;
  const portraitSharedTarget = landscapeEntryNode;
  const portraitMergeId =
    hasPortrait && portraitPrimaryTarget === portraitSharedTarget
      ? addMergeNode("merge-portrait", portraitPrimaryTarget)
      : null;
  const portraitYesTarget = portraitMergeId ?? portraitPrimaryTarget;
  const portraitNoTarget = portraitMergeId ?? portraitSharedTarget;

  const landscapePrimaryTarget = landscapeNodeIds[0] ?? fallbackEntryNode;
  const landscapeSharedTarget = fallbackEntryNode;
  const landscapeMergeId =
    hasLandscapeDecision && landscapePrimaryTarget === landscapeSharedTarget
      ? addMergeNode("merge-landscape", landscapePrimaryTarget)
      : null;
  const landscapeYesTarget = landscapeMergeId ?? landscapePrimaryTarget;
  const landscapeNoTarget = landscapeMergeId ?? landscapeSharedTarget;

  if (portraitMergeId) {
    edges.push(
      createEdge({
        id: "edge-merge-portrait-out",
        source: portraitMergeId,
        target: portraitPrimaryTarget,
      }),
    );
  }

  if (landscapeMergeId) {
    edges.push(
      createEdge({
        id: "edge-merge-landscape-out",
        source: landscapeMergeId,
        target: landscapePrimaryTarget,
      }),
    );
  }

  if (hasPortrait) {
    edges.push(
      createEdge({
        id: "edge-photo-portrait",
        source: requiresPhotoSelection ? "select-photo" : "start",
        target: "if-portrait",
      }),
    );
    edges.push(
      createEdge({
        id: portraitMergeId ? "edge-portrait-yes-merge" : "edge-portrait-yes",
        source: "if-portrait",
        sourceHandle: "yes",
        target: portraitYesTarget,
        type: "default",
        pathOptions: { curvature: 0.34 },
        label: "Yes",
      }),
    );
    edges.push(
      createEdge({
        id: portraitMergeId ? "edge-portrait-no-merge" : "edge-portrait-no",
        source: "if-portrait",
        sourceHandle: "no",
        target: portraitNoTarget,
        type: "default",
        pathOptions: { curvature: 0.34 },
        label: "No",
      }),
    );
  } else if (hasLandscapeDecision) {
    edges.push(
      createEdge({
        id: "edge-photo-landscape",
        source: requiresPhotoSelection ? "select-photo" : "start",
        target: "if-landscape",
      }),
    );
  } else if (hasFallback) {
    edges.push(
      createEdge({
        id: "edge-photo-fallback",
        source: requiresPhotoSelection ? "select-photo" : "start",
        target: fallbackEntryNode,
      }),
    );
  } else {
    edges.push(
      createEdge({
        id: "edge-photo-return",
        source: requiresPhotoSelection ? "select-photo" : "start",
        target: "return",
      }),
    );
  }

  if (hasLandscapeDecision) {
    edges.push(
      createEdge({
        id: landscapeMergeId ? "edge-landscape-yes-merge" : "edge-landscape-yes",
        source: "if-landscape",
        sourceHandle: "yes",
        target: landscapeYesTarget,
        type: "default",
        pathOptions: { curvature: 0.34 },
        label: "Yes",
      }),
    );
    edges.push(
      createEdge({
        id: landscapeMergeId ? "edge-landscape-no-merge" : "edge-landscape-no",
        source: "if-landscape",
        sourceHandle: "no",
        target: landscapeNoTarget,
        type: "default",
        pathOptions: { curvature: 0.34 },
        label: "No",
      }),
    );
  }

  const returnBranchSources = [
    portraitNodeIds[portraitNodeIds.length - 1],
    landscapeNodeIds[landscapeNodeIds.length - 1],
    fallbackNodeIds[fallbackNodeIds.length - 1],
  ].filter((value): value is string => Boolean(value));

  const mergeReturnId =
    returnBranchSources.length >= 2
      ? addMergeNode("merge-return", "return")
      : null;

  if (mergeReturnId) {
    edges.push(
      createEdge({
        id: "edge-merge-return-out",
        source: mergeReturnId,
        target: "return",
      }),
    );
  }

  const branchReturnTarget = mergeReturnId ?? "return";

  connectRuleChain(portraitNodeIds, "portrait", branchReturnTarget);
  connectRuleChain(landscapeNodeIds, "landscape", branchReturnTarget);
  connectRuleChain(fallbackNodeIds, "fallback", branchReturnTarget);

  const estimatedBottom = nodes.reduce((maxBottom, node) => {
    return Math.max(maxBottom, node.position.y + estimateNodeHeight(node));
  }, 0);

  return {
    nodes,
    edges,
    canvasHeight: Math.max(560, Math.ceil(estimatedBottom + 64)),
  };
};

type ConditionTrigger = Exclude<LogicBranchTrigger, "always">;

type SelectedInspectorState =
  | {
      kind: "rule";
      trigger: LogicBranchTrigger;
      index: number;
    }
  | {
      kind: "action";
      actionId: string;
    }
  | {
      kind: "condition";
      trigger: ConditionTrigger;
    }
  | null;

type SelectedCanvasTarget =
  | { kind: "node"; id: string }
  | null;

const getRulesByTrigger = (
  trigger: LogicBranchTrigger,
  input: {
    portrait: AutoLayoutTarget[];
    landscape: AutoLayoutTarget[];
    always: AutoLayoutTarget[];
  },
): AutoLayoutTarget[] => {
  if (trigger === "portrait-photo") {
    return input.portrait;
  }
  if (trigger === "landscape-photo") {
    return input.landscape;
  }
  return input.always;
};

export const LayoutSetLogicCanvas = ({
  layoutOptions,
  photoCollectionOptions,
  portraitRules,
  landscapeRules,
  fallbackRules,
  photoActionType,
  photoActionCollectionId,
  nodePositions,
  edgeOverrides,
  disconnectedEdgeIds: persistedDisconnectedEdgeIds,
  onClearRules,
  onUpdatePhotoActionType,
  onUpdatePhotoActionCollectionId,
  onUpdateEdgeState,
  onAddRule,
  onUpdateRule,
  onRemoveRule,
}: LayoutSetLogicCanvasProps) => {
  const onUpdateRuleRef = useRef(onUpdateRule);
  const onRemoveRuleRef = useRef(onRemoveRule);
  const [selectedInspector, setSelectedInspector] =
    useState<SelectedInspectorState>(null);
  const [selectedCanvasTarget, setSelectedCanvasTarget] =
    useState<SelectedCanvasTarget>(null);
  const [showManualActionNode, setShowManualActionNode] = useState(false);
  const [selectedFlowActionId, setSelectedFlowActionId] = useState<string>(
    () => photoActionType?.trim() || getDefaultCanvasActionTypeId(),
  );
  const [visibleConditions, setVisibleConditions] = useState<{
    portrait: boolean;
    landscape: boolean;
  }>({
    portrait: portraitRules.length > 0,
    landscape: landscapeRules.length > 0,
  });
  const [manualNodePositions, setManualNodePositions] = useState<
    Record<string, { x: number; y: number }>
  >(() => ({ ...nodePositions }));
  const [manualEdgeConnections, setManualEdgeConnections] = useState<
    Record<
      string,
      {
        source: string;
        target: string;
        sourceHandle?: string | null;
        targetHandle?: string | null;
      }
    >
  >(() => ({ ...edgeOverrides }));
  const [disconnectedEdgeIdsRecord, setDisconnectedEdgeIds] = useState<
    Record<string, true>
  >(() => toDisconnectedEdgeIdRecord(persistedDisconnectedEdgeIds));
  const connectStartHandleRef = useRef<ConnectStartHandleContext | null>(null);
  const isSyncingEdgeStateFromPropsRef = useRef(false);
  const lastPropsEdgeStateRef = useRef<string | null>(null);

  useEffect(() => {
    onUpdateRuleRef.current = onUpdateRule;
  }, [onUpdateRule]);
  useEffect(() => {
    onRemoveRuleRef.current = onRemoveRule;
  }, [onRemoveRule]);
  useEffect(() => {
    const normalized = photoActionType?.trim() || getDefaultCanvasActionTypeId();
    setSelectedFlowActionId(normalized);
  }, [photoActionType]);
  const serializedEdgeStateFromProps = useMemo(
    () =>
      serializeCanvasEdgeState({
        nodePositions,
        edgeOverrides,
        disconnectedEdgeIds: persistedDisconnectedEdgeIds,
      }),
    [edgeOverrides, nodePositions, persistedDisconnectedEdgeIds],
  );
  const serializedLocalEdgeState = useMemo(
    () => {
      const disconnectedEdgeIds = Object.keys(disconnectedEdgeIdsRecord);
      return serializeCanvasEdgeState({
        nodePositions: manualNodePositions,
        edgeOverrides: manualEdgeConnections,
        disconnectedEdgeIds,
      });
    },
    [disconnectedEdgeIdsRecord, manualEdgeConnections, manualNodePositions],
  );

  useEffect(() => {
    if (lastPropsEdgeStateRef.current === serializedEdgeStateFromProps) {
      return;
    }

    lastPropsEdgeStateRef.current = serializedEdgeStateFromProps;
    isSyncingEdgeStateFromPropsRef.current = true;

    setManualNodePositions({ ...nodePositions });
    setManualEdgeConnections({ ...edgeOverrides });
    setDisconnectedEdgeIds(toDisconnectedEdgeIdRecord(persistedDisconnectedEdgeIds));
  }, [
    edgeOverrides,
    nodePositions,
    persistedDisconnectedEdgeIds,
    serializedEdgeStateFromProps,
  ]);

  useEffect(() => {
    if (isSyncingEdgeStateFromPropsRef.current) {
      if (serializedLocalEdgeState === serializedEdgeStateFromProps) {
        isSyncingEdgeStateFromPropsRef.current = false;
      }
      return;
    }

    if (serializedLocalEdgeState === serializedEdgeStateFromProps) {
      return;
    }

    onUpdateEdgeState({
      nodePositions: manualNodePositions,
      edgeOverrides: manualEdgeConnections,
      disconnectedEdgeIds: Object.keys(disconnectedEdgeIdsRecord).sort((left, right) =>
        left.localeCompare(right),
      ),
    });
  }, [
    disconnectedEdgeIdsRecord,
    manualNodePositions,
    manualEdgeConnections,
    onUpdateEdgeState,
    serializedEdgeStateFromProps,
    serializedLocalEdgeState,
  ]);

  const rulesByTrigger = useMemo(
    () => ({
      portrait: portraitRules,
      landscape: landscapeRules,
      always: fallbackRules,
    }),
    [fallbackRules, landscapeRules, portraitRules],
  );

  useEffect(() => {
    setVisibleConditions((current) => {
      const next = {
        portrait: current.portrait || portraitRules.length > 0,
        landscape: current.landscape || landscapeRules.length > 0,
      };
      if (
        next.portrait === current.portrait &&
        next.landscape === current.landscape
      ) {
        return current;
      }
      return next;
    });
  }, [landscapeRules.length, portraitRules.length]);

  const selectedRule = useMemo(() => {
    if (!selectedInspector || selectedInspector.kind !== "rule") {
      return null;
    }
    const branchRules = getRulesByTrigger(selectedInspector.trigger, rulesByTrigger);
    const rule = branchRules[selectedInspector.index];
    if (!rule) {
      return null;
    }
    return {
      ref: selectedInspector,
      rule,
    };
  }, [rulesByTrigger, selectedInspector]);

  const selectedCondition = useMemo(() => {
    if (!selectedInspector || selectedInspector.kind !== "condition") {
      return null;
    }
    const branchRules = getRulesByTrigger(selectedInspector.trigger, rulesByTrigger);
    const fallbackConditionType =
      getDefaultConditionTypeForTrigger(selectedInspector.trigger);
    const conditionType = branchRules[0]?.conditionType ?? fallbackConditionType;
    const conditionDefinition = getConditionTypeById(conditionType);
    const conditionParams = parseConditionParamsByType(
      conditionType,
      branchRules[0]?.conditionParams,
    );
    return {
      trigger: selectedInspector.trigger,
      rules: branchRules,
      conditionType,
      conditionDefinition,
      conditionParams,
    };
  }, [rulesByTrigger, selectedInspector]);

  const selectedCanvasActionType = useMemo(
    () => getCanvasActionTypeById(selectedFlowActionId),
    [selectedFlowActionId],
  );
  const selectedPhotoActionCollectionId =
    typeof photoActionCollectionId === "string"
      ? photoActionCollectionId.trim()
      : "";

  const clearBranchRules = useCallback(
    (trigger: ConditionTrigger | "always") => {
      const branchRules = getRulesByTrigger(trigger, rulesByTrigger);
      for (let index = branchRules.length - 1; index >= 0; index -= 1) {
        onRemoveRuleRef.current(trigger, index);
      }
    },
    [rulesByTrigger],
  );

  useEffect(() => {
    if (!selectedInspector || selectedInspector.kind !== "rule") {
      return;
    }
    const branchRules = getRulesByTrigger(selectedInspector.trigger, rulesByTrigger);
    if (!branchRules[selectedInspector.index]) {
      setSelectedInspector(null);
    }
  }, [rulesByTrigger, selectedInspector]);

  const stableOnUpdateRule = useCallback(
    (trigger: LogicBranchTrigger, index: number, nextRule: AutoLayoutTarget) => {
      onUpdateRuleRef.current(trigger, index, nextRule);
    },
    [],
  );

  const stableOnRemoveRule = useCallback(
    (trigger: LogicBranchTrigger, index: number) => {
      onRemoveRuleRef.current(trigger, index);
      setSelectedInspector((current) => {
        if (!current || current.kind !== "rule" || current.trigger !== trigger) {
          return current;
        }
        if (current.index === index) {
          return null;
        }
        if (current.index > index) {
          return { ...current, index: current.index - 1 };
        }
        return current;
      });
    },
    [],
  );

  const stableOnSelectRule = useCallback(
    (trigger: LogicBranchTrigger, index: number) => {
      setSelectedInspector({ kind: "rule", trigger, index });
    },
    [],
  );

  const clearSelectedConditionBranch = useCallback(
    (trigger: ConditionTrigger) => {
      clearBranchRules(trigger);
      setVisibleConditions((current) =>
        trigger === "portrait-photo"
          ? { ...current, portrait: false }
          : { ...current, landscape: false },
      );
      setSelectedInspector(null);
    },
    [clearBranchRules],
  );

  const removePhotoActionFlow = useCallback(() => {
    clearBranchRules("portrait-photo");
    clearBranchRules("landscape-photo");
    setShowManualActionNode(false);
    setVisibleConditions({ portrait: false, landscape: false });
    setSelectedInspector(null);
  }, [clearBranchRules]);

  const baseGraph = useMemo(
    () =>
      buildGraph({
        portraitRules,
        landscapeRules,
        fallbackRules,
        layoutOptions,
        photoActionLabel: selectedCanvasActionType.nodeLabel,
        showPhotoActionNode: showManualActionNode,
        showPortraitDecision: visibleConditions.portrait,
        showLandscapeDecision: visibleConditions.landscape,
        onSelectRule: stableOnSelectRule,
        onUpdateRule: stableOnUpdateRule,
        onRemoveRule: stableOnRemoveRule,
      }),
    [
      fallbackRules,
      landscapeRules,
      layoutOptions,
      portraitRules,
      selectedCanvasActionType.nodeLabel,
      showManualActionNode,
      visibleConditions,
      stableOnRemoveRule,
      stableOnSelectRule,
      stableOnUpdateRule,
    ],
  );

  useEffect(() => {
    const validIds = new Set(baseGraph.nodes.map((node) => node.id));
    setManualNodePositions((current) => {
      let changed = false;
      const next: Record<string, { x: number; y: number }> = {};
      for (const [id, position] of Object.entries(current)) {
        if (!validIds.has(id)) {
          changed = true;
          continue;
        }
        next[id] = position;
      }
      return changed ? next : current;
    });
  }, [baseGraph.nodes]);

  useEffect(() => {
    const validEdgeIds = new Set(baseGraph.edges.map((edge) => edge.id));
    const validNodeIds = new Set(baseGraph.nodes.map((node) => node.id));
    setManualEdgeConnections((current) => {
      let changed = false;
      const next: typeof current = {};
      for (const [id, connection] of Object.entries(current)) {
        if (!validEdgeIds.has(id)) {
          changed = true;
          continue;
        }
        if (
          !validNodeIds.has(connection.source) ||
          !validNodeIds.has(connection.target)
        ) {
          changed = true;
          continue;
        }
        next[id] = connection;
      }
      return changed ? next : current;
    });
  }, [baseGraph.edges, baseGraph.nodes]);

  useEffect(() => {
    const validEdgeIds = new Set(baseGraph.edges.map((edge) => edge.id));
    setDisconnectedEdgeIds((current) => {
      let changed = false;
      const next: Record<string, true> = {};
      for (const edgeId of Object.keys(current)) {
        if (!validEdgeIds.has(edgeId)) {
          changed = true;
          continue;
        }
        next[edgeId] = true;
      }
      return changed ? next : current;
    });
  }, [baseGraph.edges]);

  const effectiveEdges = useMemo(
    () =>
      baseGraph.edges.map((edge) => {
        const override = manualEdgeConnections[edge.id];
        if (!override) {
          return edge;
        }
        return {
          ...edge,
          source: override.source,
          target: override.target,
          sourceHandle: override.sourceHandle ?? undefined,
          targetHandle: override.targetHandle ?? undefined,
        };
      }),
    [baseGraph.edges, manualEdgeConnections],
  );

  const graph = useMemo(
    () => ({
      ...baseGraph,
      nodes: baseGraph.nodes.map((node) => {
        const override = manualNodePositions[node.id];
        const isSelectedNode =
          selectedCanvasTarget?.kind === "node" && selectedCanvasTarget.id === node.id;
        let nextNode: Node = node;
        if (override && node.draggable !== false) {
          nextNode = {
            ...nextNode,
            position: override,
          };
        }
        if (isSelectedNode) {
          nextNode = {
            ...nextNode,
            style: {
              ...nextNode.style,
              boxShadow:
                "0 0 0 2px rgba(34,211,238,0.95), 0 0 0 5px rgba(34,211,238,0.3)",
            },
          };
        }
        return nextNode;
      }),
      edges: effectiveEdges.filter((edge) => !disconnectedEdgeIdsRecord[edge.id]),
    }),
    [baseGraph, disconnectedEdgeIdsRecord, effectiveEdges, manualNodePositions, selectedCanvasTarget],
  );

  useEffect(() => {
    if (!selectedCanvasTarget) {
      return;
    }
    const exists = graph.nodes.some((node) => node.id === selectedCanvasTarget.id);
    if (!exists) {
      setSelectedCanvasTarget(null);
    }
  }, [graph.nodes, selectedCanvasTarget]);

  const flowKey = useMemo(() => {
    const serialize = (rules: AutoLayoutTarget[]) =>
      rules
        .map(
          (rule) =>
            `${rule.trigger}:${rule.layoutName}:${clampCycleSeconds(rule.cycleSeconds ?? 20)}:${rule.actionType}:${JSON.stringify(rule.actionParams ?? {})}:${rule.conditionType ?? ""}:${JSON.stringify(rule.conditionParams ?? {})}`,
        )
        .join("|");

    return [
      serialize(portraitRules),
      serialize(landscapeRules),
      serialize(fallbackRules),
    ].join("||");
  }, [fallbackRules, landscapeRules, portraitRules]);

  const createRuleFromPalette = useCallback(
    (blockType: PaletteBlockType) => {
      const addRuleAt = (
        trigger: LogicBranchTrigger,
        preferredIndex?: number,
      ) => {
        const currentBranchRules = getRulesByTrigger(trigger, rulesByTrigger);
        const defaultIndex = trigger === "always" ? 0 : currentBranchRules.length;
        const nextIndex = Math.max(
          0,
          Math.min(
            currentBranchRules.length,
            typeof preferredIndex === "number" && Number.isFinite(preferredIndex)
              ? preferredIndex
              : defaultIndex,
          ),
        );
        const defaultActionType = getDefaultActionTypeId();
        const defaultConditionType = getDefaultConditionTypeForTrigger(trigger);
        onAddRule({
          trigger,
          actionType: defaultActionType,
          actionParams: getDefaultActionParams(defaultActionType),
          conditionType: defaultConditionType,
          conditionParams:
            trigger === "portrait-photo" || trigger === "landscape-photo"
              ? getDefaultConditionParamsForTrigger(trigger)
              : {},
          insertIndex: nextIndex,
        });
        setSelectedInspector({
          kind: "rule",
          trigger,
          index: nextIndex,
        });
      };

      if (blockType === "if") {
        const targetTrigger: ConditionTrigger =
          !visibleConditions.portrait
            ? "portrait-photo"
            : !visibleConditions.landscape
              ? "landscape-photo"
              : selectedInspector?.kind === "condition"
                ? selectedInspector.trigger
                : "portrait-photo";
        setVisibleConditions((current) =>
          targetTrigger === "portrait-photo"
            ? { ...current, portrait: true }
            : { ...current, landscape: true },
        );
        setSelectedInspector({
          kind: "condition",
          trigger: targetTrigger,
        });
        return;
      }

      if (blockType === "action") {
        setShowManualActionNode(true);
        setSelectedInspector({
          kind: "action",
          actionId: selectedFlowActionId,
        });
        return;
      }

      const trigger: LogicBranchTrigger =
        selectedInspector && selectedInspector.kind === "condition"
            ? selectedInspector.trigger
            : selectedInspector && selectedInspector.kind === "rule"
              ? selectedInspector.trigger
              : "always";

      addRuleAt(trigger);
    },
    [onAddRule, rulesByTrigger, selectedFlowActionId, selectedInspector, visibleConditions],
  );

  const onCanvasDragOver = useCallback((event: React.DragEvent) => {
    if (
      !event.dataTransfer.types.includes("application/hearth-logic-block")
    ) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const onCanvasDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const blockType = event.dataTransfer.getData(
        "application/hearth-logic-block",
      ) as PaletteBlockType;
      if (!blockType) {
        return;
      }
      // Disable automatic edge/branch inference from drop position.
      // New blocks are created explicitly from the current selection context.
      createRuleFromPalette(blockType);
    },
    [
      createRuleFromPalette,
    ],
  );

  const updateManualNodePosition = useCallback((node: Node) => {
    if (node.draggable === false) {
      return;
    }
    setManualNodePositions((current) => ({
      ...current,
      [node.id]: { x: node.position.x, y: node.position.y },
    }));
  }, []);

  const findReconnectableEdgeId = useCallback(
    (connection: Connection): string | null => {
      const sourceHandleId = connection.sourceHandle ?? null;
      const targetHandleId = connection.targetHandle ?? null;
      const start = connectStartHandleRef.current;

      const normalizeHandle = (value: string | null | undefined): string | null =>
        value ?? null;

      if (start?.handleType === "source" && start.nodeId) {
        const handleId = normalizeHandle(start.handleId ?? sourceHandleId);
        const sourceId = start.nodeId;
        const existing = effectiveEdges.find(
          (edge) =>
            edge.source === sourceId &&
            normalizeHandle(edge.sourceHandle) === handleId,
        );
        return existing?.id ?? null;
      }

      if (start?.handleType === "target" && start.nodeId) {
        const handleId = normalizeHandle(start.handleId ?? targetHandleId);
        const targetId = start.nodeId;
        const existing = effectiveEdges.find(
          (edge) =>
            edge.target === targetId &&
            normalizeHandle(edge.targetHandle) === handleId,
        );
        return existing?.id ?? null;
      }

      if (connection.source) {
        const existing = effectiveEdges.find(
          (edge) =>
            edge.source === connection.source &&
            normalizeHandle(edge.sourceHandle) === sourceHandleId,
        );
        if (existing) {
          return existing.id;
        }
      }

      if (connection.target) {
        const existing = effectiveEdges.find(
          (edge) =>
            edge.target === connection.target &&
            normalizeHandle(edge.targetHandle) === targetHandleId,
        );
        if (existing) {
          return existing.id;
        }
      }

      return null;
    },
    [effectiveEdges],
  );

  const updateSelectedRule = useCallback(
    (nextRule: AutoLayoutTarget) => {
      if (!selectedRule) {
        return;
      }
      const normalizedActionParams = parseActionParamsByType(
        nextRule.actionType,
        nextRule.actionParams,
      );
      const normalizedConditionParams = parseConditionParamsByType(
        nextRule.conditionType,
        nextRule.conditionParams,
      );
      stableOnUpdateRule(
        selectedRule.ref.trigger,
        selectedRule.ref.index,
        {
          ...nextRule,
          actionParams: normalizedActionParams,
          conditionParams: normalizedConditionParams,
        },
      );
    },
    [selectedRule, stableOnUpdateRule],
  );

  const updateSelectedConditionBranch = useCallback(
    (
      trigger: ConditionTrigger,
      nextInput: {
        conditionType: string;
        conditionParams: Record<string, unknown>;
      },
    ) => {
      const branchRules = getRulesByTrigger(trigger, rulesByTrigger);
      const nextConditionType =
        nextInput.conditionType ||
        getDefaultConditionTypeForTrigger(trigger) ||
        "";
      const nextConditionParams = parseConditionParamsByType(
        nextConditionType,
        nextInput.conditionParams,
      );
      branchRules.forEach((rule, index) => {
        stableOnUpdateRule(trigger, index, {
          ...rule,
          conditionType: nextConditionType,
          conditionParams: nextConditionParams,
        });
      });
    },
    [rulesByTrigger, stableOnUpdateRule],
  );

  const updateSelectedCanvasAction = useCallback((actionId: string) => {
    const normalized = actionId.trim() || getDefaultCanvasActionTypeId();
    setSelectedFlowActionId(normalized);
    onUpdatePhotoActionType(normalized);
    setSelectedInspector({
      kind: "action",
      actionId: normalized,
    });
  }, [onUpdatePhotoActionType]);

  const updateSelectedRuleActionType = useCallback(
    (actionType: string) => {
      if (!selectedRule) {
        return;
      }
      const normalizedActionParams = parseActionParamsByType(
        actionType,
        selectedRule.rule.actionParams,
      );
      updateSelectedRule({
        ...selectedRule.rule,
        actionType,
        actionParams: normalizedActionParams,
      });
    },
    [selectedRule, updateSelectedRule],
  );

  const updateSelectedRuleActionParam = useCallback(
    (key: string, value: string | number | boolean | null) => {
      if (!selectedRule) {
        return;
      }

      updateSelectedRule({
        ...selectedRule.rule,
        actionParams: {
          ...parseActionParamsByType(
            selectedRule.rule.actionType,
            selectedRule.rule.actionParams,
          ),
          [key]: value,
        },
      });
    },
    [selectedRule, updateSelectedRule],
  );

  const updateSelectedConditionType = useCallback(
    (trigger: ConditionTrigger, conditionType: string) => {
      updateSelectedConditionBranch(trigger, {
        conditionType,
        conditionParams: parseConditionParamsByType(conditionType, {}),
      });
    },
    [updateSelectedConditionBranch],
  );

  const updateSelectedConditionParam = useCallback(
    (key: string, value: string | number | boolean | null) => {
      if (!selectedCondition) {
        return;
      }

      updateSelectedConditionBranch(selectedCondition.trigger, {
        conditionType: selectedCondition.conditionType ?? "",
        conditionParams: {
          ...parseConditionParamsByType(
            selectedCondition.conditionType,
            selectedCondition.conditionParams,
          ),
          [key]: value,
        },
      });
    },
    [selectedCondition, updateSelectedConditionBranch],
  );

  const selectedRuleActionType = selectedRule
    ? getActionTypeById(selectedRule.rule.actionType)
    : null;
  const selectedRuleActionParams =
    selectedRule && selectedRuleActionType
      ? parseActionParamsByType(
          selectedRuleActionType.id,
          selectedRule.rule.actionParams,
        )
      : {};
  const selectedRulePhotoCollectionId =
    typeof selectedRuleActionParams.photoCollectionId === "string"
      ? selectedRuleActionParams.photoCollectionId.trim()
      : "";

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.key === "Delete" || event.key === "Backspace")) {
        return;
      }

      const activeElement = document.activeElement;
      const tag = activeElement?.tagName?.toLowerCase() ?? "";
      if (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        (activeElement instanceof HTMLElement && activeElement.isContentEditable)
      ) {
        return;
      }

      if (!selectedCanvasTarget) {
        return;
      }

      event.preventDefault();

      const node = graph.nodes.find((entry) => entry.id === selectedCanvasTarget.id);
      if (!node) {
        setSelectedCanvasTarget(null);
        return;
      }

      if (node.type === "ruleNode") {
        const data = node.data as RuleNodeData;
        stableOnRemoveRule(data.trigger, data.index);
      } else if (node.id === "if-portrait") {
        clearSelectedConditionBranch("portrait-photo");
      } else if (node.id === "if-landscape") {
        clearSelectedConditionBranch("landscape-photo");
      } else if (node.id === "select-photo") {
        removePhotoActionFlow();
      }

      setSelectedCanvasTarget(null);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    clearSelectedConditionBranch,
    graph.nodes,
    removePhotoActionFlow,
    selectedCanvasTarget,
    stableOnRemoveRule,
  ]);

  return (
    <section className="rounded-xl border border-slate-700/80 bg-slate-950/70 p-3">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {paletteBlocks.map((block) => (
          <PaletteBlock
            key={block.type}
            type={block.type}
            label={block.label}
            onCreate={createRuleFromPalette}
          />
        ))}
        <button
          type="button"
          className="ml-auto h-10 w-[132px] rounded border border-rose-400/70 px-3 text-sm font-semibold text-rose-100 hover:bg-rose-500/20"
          onClick={() => {
            setShowManualActionNode(false);
            setVisibleConditions({ portrait: false, landscape: false });
            setSelectedInspector(null);
            onClearRules();
          }}
        >
          Clear canvas
        </button>
      </div>
      <p className="mb-3 text-xs text-slate-400">
        Drop blocks into the canvas, then click nodes to edit details in Inspector.
      </p>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div
          className="overflow-hidden rounded-lg border border-slate-700"
          style={{ height: graph.canvasHeight }}
        >
          <ReactFlow
            key={flowKey}
            nodes={graph.nodes}
            edges={graph.edges}
            className="select-none"
            nodeTypes={nodeTypes}
            onDragOver={onCanvasDragOver}
            onDrop={onCanvasDrop}
            onConnectStart={(_event, params) => {
              connectStartHandleRef.current = {
                nodeId: params.nodeId ?? null,
                handleId: params.handleId ?? null,
                handleType:
                  params.handleType === "source" || params.handleType === "target"
                    ? params.handleType
                    : null,
              };
            }}
            onConnectEnd={() => {
              connectStartHandleRef.current = null;
            }}
            onConnect={(connection) => {
              if (!connection.source || !connection.target) {
                return;
              }
              const edgeId = findReconnectableEdgeId(connection);
              if (!edgeId) {
                return;
              }
              setManualEdgeConnections((current) => ({
                ...current,
                [edgeId]: {
                  source: connection.source,
                  target: connection.target,
                  sourceHandle: connection.sourceHandle ?? null,
                  targetHandle: connection.targetHandle ?? null,
                },
              }));
              setDisconnectedEdgeIds((current) => {
                if (!current[edgeId]) {
                  return current;
                }
                const next = { ...current };
                delete next[edgeId];
                return next;
              });
            }}
            onReconnect={(oldEdge, newConnection) => {
              if (!newConnection.source || !newConnection.target) {
                return;
              }
              setManualEdgeConnections((current) => ({
                ...current,
                [oldEdge.id]: {
                  source: newConnection.source,
                  target: newConnection.target,
                  sourceHandle: newConnection.sourceHandle ?? null,
                  targetHandle: newConnection.targetHandle ?? null,
                },
              }));
              setDisconnectedEdgeIds((current) => {
                if (!current[oldEdge.id]) {
                  return current;
                }
                const next = { ...current };
                delete next[oldEdge.id];
                return next;
              });
            }}
            onReconnectEnd={(_event, oldEdge, _handleType, connectionState) => {
              if (connectionState.toHandle || connectionState.toNode) {
                return;
              }
              setManualEdgeConnections((current) => {
                if (!Object.prototype.hasOwnProperty.call(current, oldEdge.id)) {
                  return current;
                }
                const next = { ...current };
                delete next[oldEdge.id];
                return next;
              });
              setDisconnectedEdgeIds((current) => ({
                ...current,
                [oldEdge.id]: true,
              }));
            }}
            onNodeClick={(_event, node) => {
              setSelectedCanvasTarget({ kind: "node", id: node.id });
              if (node.type === "ruleNode") {
                const data = node.data as RuleNodeData;
                setSelectedInspector({
                  kind: "rule",
                  trigger: data.trigger,
                  index: data.index,
                });
                return;
              }
              if (node.id === "if-portrait") {
                setSelectedInspector({
                  kind: "condition",
                  trigger: "portrait-photo",
                });
                return;
              }
              if (node.id === "if-landscape") {
                setSelectedInspector({
                  kind: "condition",
                  trigger: "landscape-photo",
                });
                return;
              }
              if (node.id === "select-photo") {
                setSelectedInspector({
                  kind: "action",
                  actionId: selectedFlowActionId,
                });
                return;
              }
              setSelectedInspector(null);
            }}
            onNodeDragStop={(_event, node) => {
              updateManualNodePosition(node);
            }}
            onNodeDrag={(_event, node) => {
              updateManualNodePosition(node);
            }}
            onPaneClick={() => {
              setSelectedInspector(null);
              setSelectedCanvasTarget(null);
            }}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            preventScrolling={false}
            zoomOnScroll={false}
            zoomOnPinch={false}
            zoomOnDoubleClick={false}
            connectOnClick={false}
            panOnDrag={false}
            minZoom={0.55}
            maxZoom={2}
            onlyRenderVisibleElements={false}
            nodesConnectable
            edgesReconnectable
            edgesFocusable={false}
            elementsSelectable={false}
            selectNodesOnDrag={false}
            selectionOnDrag={false}
            selectionKeyCode={null}
            multiSelectionKeyCode={null}
            nodesDraggable
            defaultEdgeOptions={{
              type: "simplebezier",
              markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
            }}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} size={1} color="#1e293b" />
            <Controls
              position="top-right"
              showZoom
              showFitView
              showInteractive={false}
            />
          </ReactFlow>
        </div>

        <aside className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
          <h3 className="text-sm font-semibold text-slate-100">Inspector</h3>
          {!selectedRule &&
          !selectedCondition &&
          selectedInspector?.kind !== "action" ? (
            <p className="mt-2 text-xs text-slate-400">
              Select an If or action block in the canvas to edit its settings.
            </p>
          ) : selectedInspector?.kind === "action" ? (
            <div className="mt-2 space-y-3">
              <div className="rounded border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-xs font-medium text-cyan-200">
                Action: {selectedCanvasActionType.label}
              </div>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Action
                </span>
                <select
                  className="h-10 w-full rounded border border-slate-700 bg-slate-800 px-2 text-sm text-slate-100"
                  value={selectedCanvasActionType.id}
                  onChange={(event) => updateSelectedCanvasAction(event.target.value)}
                >
                  {LOGIC_CANVAS_ACTION_TYPES.map((action) => (
                    <option key={action.id} value={action.id}>
                      {action.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-slate-400">{selectedCanvasActionType.description}</p>
              <label className="block">
                <span className="mb-1 block text-sm text-slate-200">
                  Photo source
                </span>
                <select
                  className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
                  value={selectedPhotoActionCollectionId}
                  onChange={(event) =>
                    onUpdatePhotoActionCollectionId(event.target.value.trim() || null)
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
              <p className="text-xs text-slate-400">
                In set mode, this collection drives photo selection/orientation and overrides module collection settings.
              </p>
              <button
                type="button"
                className="h-10 rounded border border-rose-400/70 px-3 text-sm font-semibold text-rose-100 hover:bg-rose-500/20"
                onClick={removePhotoActionFlow}
              >
                Remove
              </button>
            </div>
          ) : selectedCondition ? (
            <div className="mt-2 space-y-3">
              <div className="rounded border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-xs font-medium text-cyan-200">
                Condition: {getTriggerLabel(selectedCondition.trigger)}
              </div>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Condition
                </span>
                <select
                  className="h-10 w-full rounded border border-slate-700 bg-slate-800 px-2 text-sm text-slate-100"
                  value={selectedCondition.conditionType ?? ""}
                  onChange={(event) =>
                    updateSelectedConditionType(
                      selectedCondition.trigger,
                      event.target.value,
                    )
                  }
                >
                  {LOGIC_CONDITION_TYPES.filter(
                    (entry) => entry.trigger === selectedCondition.trigger,
                  ).map((condition) => (
                    <option key={condition.id} value={condition.id}>
                      {condition.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-slate-400">
                {selectedCondition.conditionDefinition?.description}
              </p>
              {selectedCondition.conditionDefinition?.paramFields?.map(
                (field: LogicParamFieldDefinition) => {
                  const value = selectedCondition.conditionParams[field.key];
                  if (field.kind === "boolean") {
                    return (
                      <label
                        key={field.key}
                        className="flex items-center justify-between rounded border border-slate-700 bg-slate-800/40 px-2 py-2"
                      >
                        <span className="text-sm text-slate-200">{field.label}</span>
                        <input
                          type="checkbox"
                          checked={toParamBooleanValue(value)}
                          onChange={(event) =>
                            updateSelectedConditionParam(field.key, event.target.checked)
                          }
                        />
                      </label>
                    );
                  }

                  if (field.kind === "number") {
                    const fallback =
                      typeof field.min === "number" && Number.isFinite(field.min)
                        ? field.min
                        : 0;
                    return (
                      <label key={field.key} className="block">
                        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          {field.label}
                        </span>
                        <input
                          type="number"
                          min={field.min}
                          max={field.max}
                          step={field.step ?? 1}
                          value={toParamNumberValue(value, fallback)}
                          className="h-10 w-full rounded border border-slate-700 bg-slate-800 px-2 text-sm text-slate-100"
                          onChange={(event) => {
                            const parsed = Number.parseFloat(event.target.value);
                            if (!Number.isFinite(parsed)) {
                              return;
                            }
                            updateSelectedConditionParam(field.key, parsed);
                          }}
                        />
                      </label>
                    );
                  }

                  if (field.kind === "select") {
                    const options = field.options ?? [];
                    return (
                      <label key={field.key} className="block">
                        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          {field.label}
                        </span>
                        <select
                          className="h-10 w-full rounded border border-slate-700 bg-slate-800 px-2 text-sm text-slate-100"
                          value={toParamStringValue(value)}
                          onChange={(event) =>
                            updateSelectedConditionParam(field.key, event.target.value)
                          }
                        >
                          {options.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    );
                  }

                  return (
                    <label key={field.key} className="block">
                      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        {field.label}
                      </span>
                      <input
                        type="text"
                        value={toParamStringValue(value)}
                        className="h-10 w-full rounded border border-slate-700 bg-slate-800 px-2 text-sm text-slate-100"
                        onChange={(event) =>
                          updateSelectedConditionParam(field.key, event.target.value)
                        }
                      />
                    </label>
                  );
                },
              )}
              <button
                type="button"
                className="h-10 rounded border border-rose-400/70 px-3 text-sm font-semibold text-rose-100 hover:bg-rose-500/20"
                onClick={() => clearSelectedConditionBranch(selectedCondition.trigger)}
              >
                Remove
              </button>
            </div>
          ) : selectedRule ? (
            <div className="mt-2 space-y-3">
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Action
                </span>
                <select
                  className="h-10 w-full rounded border border-slate-700 bg-slate-800 px-2 text-sm text-slate-100"
                  value={selectedRuleActionType?.id ?? ""}
                  onChange={(event) =>
                    updateSelectedRuleActionType(event.target.value)
                  }
                >
                  {LOGIC_ACTION_TYPES.map((action) => (
                    <option key={action.id} value={action.id}>
                      {action.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-slate-400">
                {selectedRuleActionType?.description}
              </p>
              {selectedRuleActionType?.fields.map((field: LogicActionFieldDefinition) =>
                field.kind === "layout-select" ? (
                  <label key={field.key} className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      {field.label}
                    </span>
                    <select
                      className="h-10 w-full rounded border border-slate-700 bg-slate-800 px-2 text-sm text-slate-100"
                      value={selectedRule.rule.layoutName}
                      onChange={(event) =>
                        updateSelectedRule({
                          ...selectedRule.rule,
                          layoutName: event.target.value,
                        })
                      }
                    >
                      {layoutOptions.map((layout) => (
                        <option key={layout.id} value={layout.name}>
                          {layout.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label key={field.key} className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      {field.label}
                    </span>
                    <input
                      type="number"
                      min={field.min}
                      max={field.max}
                      step={field.step ?? 1}
                      value={selectedRule.rule.cycleSeconds}
                      className="h-10 w-full rounded border border-slate-700 bg-slate-800 px-2 text-sm text-slate-100"
                      onChange={(event) => {
                        const parsed = Number.parseInt(event.target.value, 10);
                        if (!Number.isFinite(parsed)) {
                          return;
                        }
                        updateSelectedRule({
                          ...selectedRule.rule,
                          cycleSeconds: clampCycleSeconds(parsed),
                        });
                      }}
                    />
                  </label>
                ),
              )}
              <label className="block">
                <span className="mb-1 block text-sm text-slate-200">
                  Photo source override
                </span>
                <select
                  className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
                  value={selectedRulePhotoCollectionId}
                  onChange={(event) =>
                    updateSelectedRuleActionParam(
                      "photoCollectionId",
                      event.target.value.trim() || null,
                    )
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
              {selectedRuleActionType?.paramFields?.map(
                (field: LogicParamFieldDefinition) => {
                  const value = selectedRuleActionParams[field.key];
                  if (field.kind === "boolean") {
                    return (
                      <label
                        key={field.key}
                        className="flex items-center justify-between rounded border border-slate-700 bg-slate-800/40 px-2 py-2"
                      >
                        <span className="text-sm text-slate-200">{field.label}</span>
                        <input
                          type="checkbox"
                          checked={toParamBooleanValue(value)}
                          onChange={(event) =>
                            updateSelectedRuleActionParam(field.key, event.target.checked)
                          }
                        />
                      </label>
                    );
                  }

                  if (field.kind === "number") {
                    const fallback =
                      typeof field.min === "number" && Number.isFinite(field.min)
                        ? field.min
                        : 0;
                    return (
                      <label key={field.key} className="block">
                        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          {field.label}
                        </span>
                        <input
                          type="number"
                          min={field.min}
                          max={field.max}
                          step={field.step ?? 1}
                          value={toParamNumberValue(value, fallback)}
                          className="h-10 w-full rounded border border-slate-700 bg-slate-800 px-2 text-sm text-slate-100"
                          onChange={(event) => {
                            const parsed = Number.parseFloat(event.target.value);
                            if (!Number.isFinite(parsed)) {
                              return;
                            }
                            updateSelectedRuleActionParam(field.key, parsed);
                          }}
                        />
                      </label>
                    );
                  }

                  if (field.kind === "select") {
                    const options = field.options ?? [];
                    return (
                      <label key={field.key} className="block">
                        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          {field.label}
                        </span>
                        <select
                          className="h-10 w-full rounded border border-slate-700 bg-slate-800 px-2 text-sm text-slate-100"
                          value={toParamStringValue(value)}
                          onChange={(event) =>
                            updateSelectedRuleActionParam(field.key, event.target.value)
                          }
                        >
                          {options.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    );
                  }

                  return (
                    <label key={field.key} className="block">
                      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        {field.label}
                      </span>
                      <input
                        type="text"
                        value={toParamStringValue(value)}
                        className="h-10 w-full rounded border border-slate-700 bg-slate-800 px-2 text-sm text-slate-100"
                        onChange={(event) =>
                          updateSelectedRuleActionParam(field.key, event.target.value)
                        }
                      />
                    </label>
                  );
                },
              )}

              <p className="rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-1.5 text-xs text-cyan-100">
                Summary:{" "}
                {selectedRuleActionType?.renderSummary({
                  ...selectedRule.rule,
                  actionParams: selectedRuleActionParams,
                  conditionParams: parseConditionParamsByType(
                    selectedRule.rule.conditionType,
                    selectedRule.rule.conditionParams,
                  ),
                })}
              </p>
              <button
                type="button"
                className="h-10 rounded border border-rose-400/70 px-3 text-sm font-semibold text-rose-100 hover:bg-rose-500/20"
                onClick={() =>
                  stableOnRemoveRule(
                    selectedRule.ref.trigger,
                    selectedRule.ref.index,
                  )
                }
              >
                Remove
              </button>
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
};
