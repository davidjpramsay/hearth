import type { Node } from "@xyflow/react";

export interface LayoutOption {
  id: number;
  name: string;
}

export interface PhotoCollectionOption {
  id: string;
  name: string;
}

export type ConditionalTrigger = "portrait-photo";
export type ActionNodeKind = "photo" | "warning";
export type RouterNodeKind = ActionNodeKind | "time";

export interface RouterNodeData extends Record<string, unknown> {
  title: string;
  kindLabel: string;
  actionSummary: string;
  sourceLabel: string | null;
  onSelect?: () => void;
  onRemove?: () => void;
  routes: Array<{
    key: string;
    label: string;
    count: number;
    enabled: boolean;
    connectable?: boolean;
    color: string;
    bgClassName: string;
    borderClassName: string;
  }>;
}

export interface LayoutNodeData extends Record<string, unknown> {
  title: string;
  subtitle: string;
  routeLabel: string;
  onSelect?: () => void;
  onRemove?: () => void;
}

export interface TerminalNodeData extends Record<string, unknown> {
  title: string;
  tone: "start" | "end";
}

export type StepNodeType = Node<LayoutNodeData, "layoutNode">;
export type RouterNodeType = Node<RouterNodeData, "routerNode">;
export type TerminalNodeType = Node<TerminalNodeData, "terminalNode">;

export const GRAPH_NODE_DRAG_TYPE = "application/hearth-graph-node";
export const START_NODE_ID = "__start__";
export const END_NODE_ID = "__end__";
export const ROUTER_NODE_WIDTH = 360;
export const ROUTER_NODE_BASE_HEIGHT = 144;
export const ROUTER_NODE_ROUTE_ROW_HEIGHT = 68;
export const LAYOUT_NODE_WIDTH = 260;
export const LAYOUT_NODE_HEIGHT = 92;
export const TERMINAL_NODE_SIZE = 96;
export const GRAPH_TARGET_HANDLE_WIDTH = 72;
export const GRAPH_TARGET_HANDLE_HEIGHT = 28;
export const GRAPH_ENDPOINT_HANDLE_SIZE = 20;
export const START_NODE_GAP = 128;
export const END_NODE_GAP = 168;
export const DEFAULT_ROUTER_POSITION = { x: 420, y: 180 };
export const DEFAULT_DETACHED_ORIGIN = { x: 96, y: 980 };
export const DEFAULT_DETACHED_X_GAP = 332;
export const DEFAULT_DETACHED_Y_GAP = 168;
export const GRAPH_NODE_DRAG_HANDLE_SELECTOR = ".hearth-graph-node-drag-handle";
export const ROUTER_ROUTE_ORDER = ["portrait", "fallback"] as const;
export const EDGE_DASH_PATTERN = "8 12";
export const DEFAULT_TIME_GATE_DURATION_MINUTES = 60;

export const TIME_GATE_ROUTE_PALETTE = [
  {
    color: "#38bdf8",
    bgClassName: "bg-sky-500/10 text-sky-100",
    borderClassName: "border-sky-400/50",
  },
  {
    color: "#34d399",
    bgClassName: "bg-emerald-500/10 text-emerald-100",
    borderClassName: "border-emerald-400/50",
  },
  {
    color: "#f97316",
    bgClassName: "bg-orange-500/10 text-orange-100",
    borderClassName: "border-orange-400/50",
  },
  {
    color: "#f43f5e",
    bgClassName: "bg-rose-500/10 text-rose-100",
    borderClassName: "border-rose-400/50",
  },
] as const;

export const BRANCH_META: Record<
  "portrait" | "fallback",
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
