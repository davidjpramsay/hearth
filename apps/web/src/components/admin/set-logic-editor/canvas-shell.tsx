import {
  Background,
  ConnectionLineType,
  Panel,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import type { DragEventHandler } from "react";
import { CanvasControlButton, edgeTypes, FitViewIcon, LockIcon, nodeTypes } from "./components";
import { EDGE_DASH_PATTERN, GRAPH_NODE_DRAG_TYPE, type LayoutOption } from "./shared";

interface RuntimeStatusMeta {
  icon: string;
  className: string;
  title: string;
}

export const SetLogicPalette = ({
  layoutOptions,
  onAddLayoutNode,
  onAddActionNode,
  onAddTimeGateNode,
}: {
  layoutOptions: LayoutOption[];
  onAddLayoutNode: () => void;
  onAddActionNode: (kind: "photo" | "warning") => void;
  onAddTimeGateNode: () => void;
}) => (
  <aside className="space-y-4 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">Palette</p>
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
        onClick={onAddLayoutNode}
      >
        <span className="block text-sm font-semibold">Layout Node</span>
      </button>
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
        Routing Nodes
      </p>
      <button
        type="button"
        draggable
        className="mt-3 flex w-full items-center justify-between rounded-xl border border-emerald-500/50 bg-emerald-500/10 px-3 py-3 text-left text-emerald-100 transition hover:bg-emerald-500/20"
        onDragStart={(event) => {
          event.dataTransfer.setData(GRAPH_NODE_DRAG_TYPE, "photo-node");
          event.dataTransfer.effectAllowed = "copy";
        }}
        onClick={() => onAddActionNode("photo")}
      >
        <span className="block text-sm font-semibold">Photo Orientation Node</span>
      </button>
      <button
        type="button"
        draggable
        className="mt-3 flex w-full items-center justify-between rounded-xl border border-amber-500/50 bg-amber-500/10 px-3 py-3 text-left text-amber-100 transition hover:bg-amber-500/20"
        onDragStart={(event) => {
          event.dataTransfer.setData(GRAPH_NODE_DRAG_TYPE, "warning-node");
          event.dataTransfer.effectAllowed = "copy";
        }}
        onClick={() => onAddActionNode("warning")}
      >
        <span className="block text-sm font-semibold">Warning Node</span>
      </button>
      <button
        type="button"
        draggable
        className="mt-3 flex w-full items-center justify-between rounded-xl border border-sky-500/50 bg-sky-500/10 px-3 py-3 text-left text-sky-100 transition hover:bg-sky-500/20"
        onDragStart={(event) => {
          event.dataTransfer.setData(GRAPH_NODE_DRAG_TYPE, "time-node");
          event.dataTransfer.effectAllowed = "copy";
        }}
        onClick={onAddTimeGateNode}
      >
        <span className="block text-sm font-semibold">Time Gate Node</span>
      </button>
    </div>
  </aside>
);

export const SetLogicCanvas = ({
  graph,
  selectedNodeSummary,
  canUndo,
  canRedo,
  hasEditableNodes,
  recoverableDraftSavedAt,
  reactFlowProps,
  runtimeStatusMeta,
  reactFlowInstance,
  isCanvasInteractive,
  onToggleCanvasInteractive,
  onUndo,
  onRedo,
  onAddStarterPhotoNode,
  onAddStarterTimeGateNode,
  onAddStarterLayoutNode,
  onRestoreDraft,
  onDiscardDraft,
  onFitView,
  onZoomIn,
  onZoomOut,
  onDrop,
  onDragOver,
}: {
  graph: { nodes: Node[]; edges: Edge[] };
  selectedNodeSummary: string;
  canUndo: boolean;
  canRedo: boolean;
  hasEditableNodes: boolean;
  recoverableDraftSavedAt: string | null;
  reactFlowProps: Record<string, unknown>;
  runtimeStatusMeta: RuntimeStatusMeta | null;
  reactFlowInstance: {
    fitView: (options?: Record<string, unknown>) => void;
    zoomIn: (options?: Record<string, unknown>) => void;
    zoomOut: (options?: Record<string, unknown>) => void;
  } | null;
  isCanvasInteractive: boolean;
  onToggleCanvasInteractive: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onAddStarterPhotoNode: () => void;
  onAddStarterTimeGateNode: () => void;
  onAddStarterLayoutNode: () => void;
  onRestoreDraft?: () => void;
  onDiscardDraft?: () => void;
  onFitView: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onDrop: DragEventHandler<HTMLDivElement>;
  onDragOver: DragEventHandler<HTMLDivElement>;
}) => (
  <div
    className="h-[760px] overflow-hidden rounded-xl border border-slate-700 bg-slate-950"
    onDrop={onDrop}
    onDragOver={onDragOver}
  >
    <ReactFlow
      nodes={graph.nodes}
      edges={graph.edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      proOptions={{ hideAttribution: true }}
      minZoom={0.35}
      maxZoom={1.5}
      deleteKeyCode={["Backspace", "Delete"]}
      connectionRadius={64}
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
      {...reactFlowProps}
    >
      <Background color="#1e293b" gap={24} size={1.2} />
      <Panel position="top-left">
        <div className="max-w-[340px] rounded-2xl border border-slate-700/80 bg-slate-950/90 px-4 py-3 shadow-[0_10px_24px_rgba(2,6,23,0.5)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                Selection
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-100">{selectedNodeSummary}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!canUndo}
                className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-cyan-400 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
                title="Undo last graph edit (Cmd/Ctrl+Z)"
                onClick={onUndo}
              >
                Undo
              </button>
              <button
                type="button"
                disabled={!canRedo}
                className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-cyan-400 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
                title="Redo last graph edit (Shift+Cmd/Ctrl+Z)"
                onClick={onRedo}
              >
                Redo
              </button>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Connecting from a used output replaces its current path.
          </p>
        </div>
      </Panel>
      {!hasEditableNodes ? (
        <Panel position="top-center">
          <div className="max-w-[520px] rounded-2xl border border-slate-700/80 bg-slate-950/92 px-5 py-4 text-center shadow-[0_10px_24px_rgba(2,6,23,0.55)]">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
              Set Logic
            </p>
            <p className="mt-2 text-lg font-semibold text-slate-100">
              Start your graph with one routing node or a direct layout.
            </p>
            <p className="mt-2 text-sm text-slate-300">
              Photo Orientation is the usual starting point. Time Gate is useful when a layout set
              changes by household time.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                className="rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/20"
                onClick={onAddStarterPhotoNode}
              >
                Add Photo Orientation
              </button>
              <button
                type="button"
                className="rounded-lg border border-sky-500/50 bg-sky-500/10 px-3 py-2 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/20"
                onClick={onAddStarterTimeGateNode}
              >
                Add Time Gate
              </button>
              <button
                type="button"
                className="rounded-lg border border-cyan-500/50 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20"
                onClick={onAddStarterLayoutNode}
              >
                Add Layout Node
              </button>
            </div>
          </div>
        </Panel>
      ) : null}
      {recoverableDraftSavedAt && onRestoreDraft && onDiscardDraft ? (
        <Panel position="top-center">
          <div className="mt-[156px] max-w-[520px] rounded-2xl border border-amber-400/50 bg-slate-950/92 px-5 py-4 text-center shadow-[0_10px_24px_rgba(2,6,23,0.55)]">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-amber-300/90">
              Local Draft Found
            </p>
            <p className="mt-2 text-sm text-slate-200">
              A newer local graph draft is available from{" "}
              {new Date(recoverableDraftSavedAt).toLocaleString()}.
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                type="button"
                className="rounded-lg border border-amber-400/60 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/20"
                onClick={onRestoreDraft}
              >
                Restore draft
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-slate-100"
                onClick={onDiscardDraft}
              >
                Discard
              </button>
            </div>
          </div>
        </Panel>
      ) : null}
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
            onClick={onZoomIn}
          >
            <span className="text-[30px] font-light leading-none">+</span>
          </CanvasControlButton>
          <CanvasControlButton
            title="Zoom out"
            disabled={!reactFlowInstance || !isCanvasInteractive}
            onClick={onZoomOut}
          >
            <span className="text-[30px] font-light leading-none">−</span>
          </CanvasControlButton>
          <CanvasControlButton
            title="Fit canvas"
            disabled={!reactFlowInstance || !isCanvasInteractive}
            onClick={onFitView}
          >
            <FitViewIcon />
          </CanvasControlButton>
          <CanvasControlButton
            title={isCanvasInteractive ? "Lock canvas" : "Unlock canvas"}
            active={!isCanvasInteractive}
            onClick={onToggleCanvasInteractive}
          >
            <LockIcon locked={!isCanvasInteractive} />
          </CanvasControlButton>
        </div>
      </Panel>
    </ReactFlow>
  </div>
);
