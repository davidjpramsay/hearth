import type { PhotoRouterBlock } from "@hearth/shared";

export interface GraphEditorState {
  block: PhotoRouterBlock;
  selectedNodeId: string | null;
  editorError: string | null;
  isCanvasInteractive: boolean;
  draftNodePositions: Record<string, { x: number; y: number }>;
}

export type GraphEditorAction =
  | { type: "sync-from-props"; block: PhotoRouterBlock }
  | { type: "set-block"; block: PhotoRouterBlock }
  | { type: "select-node"; nodeId: string | null }
  | { type: "set-editor-error"; message: string | null }
  | { type: "toggle-canvas-interactive" }
  | {
      type: "merge-draft-node-positions";
      positions: Record<string, { x: number; y: number }>;
    }
  | { type: "clear-draft-node-positions"; nodeIds?: string[] };

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
        selectedNodeId: coerceSelectedNodeId(action.block, state.selectedNodeId),
        draftNodePositions: {},
      };
    case "set-block":
      return {
        ...state,
        block: action.block,
        selectedNodeId: coerceSelectedNodeId(action.block, state.selectedNodeId),
        draftNodePositions: {},
      };
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
