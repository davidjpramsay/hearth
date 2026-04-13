import type { PhotoRouterBlock } from "@hearth/shared";

export interface GraphEditorState {
  block: PhotoRouterBlock;
  historyPast: PhotoRouterBlock[];
  historyFuture: PhotoRouterBlock[];
  selectedNodeId: string | null;
  editorError: string | null;
  isCanvasInteractive: boolean;
  draftNodePositions: Record<string, { x: number; y: number }>;
}

export type GraphEditorAction =
  | { type: "sync-from-props"; block: PhotoRouterBlock }
  | {
      type: "apply-block";
      block: PhotoRouterBlock;
      historyMode?: "push" | "replace";
      preserveFuture?: boolean;
    }
  | { type: "select-node"; nodeId: string | null }
  | { type: "set-editor-error"; message: string | null }
  | { type: "toggle-canvas-interactive" }
  | { type: "undo" }
  | { type: "redo" }
  | {
      type: "merge-draft-node-positions";
      positions: Record<string, { x: number; y: number }>;
    }
  | { type: "clear-draft-node-positions"; nodeIds?: string[] };

const blocksMatch = (left: PhotoRouterBlock, right: PhotoRouterBlock) =>
  JSON.stringify(left) === JSON.stringify(right);

const coerceSelectedNodeId = (
  block: PhotoRouterBlock,
  selectedNodeId: string | null,
): string | null =>
  selectedNodeId !== null && block.nodes.some((node) => node.id === selectedNodeId)
    ? selectedNodeId
    : null;

export const graphEditorReducer = (
  state: GraphEditorState,
  action: GraphEditorAction,
): GraphEditorState => {
  switch (action.type) {
    case "sync-from-props":
      return {
        ...state,
        block: action.block,
        historyPast: blocksMatch(action.block, state.block) ? state.historyPast : [],
        historyFuture: blocksMatch(action.block, state.block) ? state.historyFuture : [],
        selectedNodeId: coerceSelectedNodeId(action.block, state.selectedNodeId),
        draftNodePositions: {},
      };
    case "apply-block": {
      const nextHistoryMode = action.historyMode ?? "push";
      const shouldPushHistory =
        nextHistoryMode === "push" && !blocksMatch(action.block, state.block);
      return {
        ...state,
        block: action.block,
        historyPast: shouldPushHistory ? [...state.historyPast, state.block] : state.historyPast,
        historyFuture: shouldPushHistory
          ? []
          : action.preserveFuture
            ? state.historyFuture
            : nextHistoryMode === "replace"
              ? []
              : state.historyFuture,
        selectedNodeId: coerceSelectedNodeId(action.block, state.selectedNodeId),
        draftNodePositions: {},
      };
    }
    case "select-node":
      return {
        ...state,
        selectedNodeId: action.nodeId,
      };
    case "set-editor-error":
      return {
        ...state,
        editorError: action.message,
      };
    case "toggle-canvas-interactive":
      return {
        ...state,
        isCanvasInteractive: !state.isCanvasInteractive,
      };
    case "undo": {
      const previousBlock = state.historyPast.at(-1);
      if (!previousBlock) {
        return state;
      }
      return {
        ...state,
        block: previousBlock,
        historyPast: state.historyPast.slice(0, -1),
        historyFuture: [state.block, ...state.historyFuture],
        selectedNodeId: coerceSelectedNodeId(previousBlock, state.selectedNodeId),
        draftNodePositions: {},
      };
    }
    case "redo": {
      const nextBlock = state.historyFuture[0];
      if (!nextBlock) {
        return state;
      }
      return {
        ...state,
        block: nextBlock,
        historyPast: [...state.historyPast, state.block],
        historyFuture: state.historyFuture.slice(1),
        selectedNodeId: coerceSelectedNodeId(nextBlock, state.selectedNodeId),
        draftNodePositions: {},
      };
    }
    case "merge-draft-node-positions":
      return {
        ...state,
        draftNodePositions: {
          ...state.draftNodePositions,
          ...action.positions,
        },
      };
    case "clear-draft-node-positions":
      if (!action.nodeIds || action.nodeIds.length === 0) {
        return {
          ...state,
          draftNodePositions: {},
        };
      }

      return {
        ...state,
        draftNodePositions: Object.fromEntries(
          Object.entries(state.draftNodePositions).filter(
            ([nodeId]) => !action.nodeIds!.includes(nodeId),
          ),
        ),
      };
    default:
      return state;
  }
};
