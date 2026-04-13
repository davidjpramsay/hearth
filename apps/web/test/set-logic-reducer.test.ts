import assert from "node:assert/strict";
import test from "node:test";
import type { PhotoRouterBlock, PhotoRouterLayoutNode } from "@hearth/shared";
import {
  type GraphEditorState,
  graphEditorReducer,
} from "../src/components/admin/set-logic-editor/reducer";

const createLayoutNode = (id: string, layoutName = id): PhotoRouterLayoutNode => ({
  id,
  nodeType: "layout",
  layoutName,
  cycleSeconds: 20,
  actionType: "layout.display",
  actionParams: {},
});

const createBlock = (input?: Partial<PhotoRouterBlock>): PhotoRouterBlock => ({
  nodeType: "photo-router",
  nodes: [],
  layoutNodes: [],
  connections: [],
  fallback: { steps: [] },
  portrait: { steps: [] },
  landscape: { steps: [] },
  nodePositions: {},
  ...(input ?? {}),
});

const createState = (block: PhotoRouterBlock): GraphEditorState => ({
  block,
  historyPast: [],
  historyFuture: [],
  selectedNodeId: null,
  editorError: null,
  isCanvasInteractive: true,
  draftNodePositions: {},
});

test("graph editor reducer tracks undo and redo history for block edits", () => {
  const initialBlock = createBlock({
    nodes: [createLayoutNode("layout-1", "Home")],
  });
  const editedBlock = createBlock({
    nodes: [createLayoutNode("layout-1", "Family")],
  });

  const afterEdit = graphEditorReducer(createState(initialBlock), {
    type: "apply-block",
    block: editedBlock,
  });

  assert.equal(afterEdit.block.nodes[0]?.layoutName, "Family");
  assert.equal(afterEdit.historyPast.length, 1);
  assert.equal(afterEdit.historyPast[0]?.nodes[0]?.layoutName, "Home");
  assert.equal(afterEdit.historyFuture.length, 0);

  const afterUndo = graphEditorReducer(afterEdit, {
    type: "undo",
  });
  assert.equal(afterUndo.block.nodes[0]?.layoutName, "Home");
  assert.equal(afterUndo.historyFuture[0]?.nodes[0]?.layoutName, "Family");

  const afterRedo = graphEditorReducer(afterUndo, {
    type: "redo",
  });
  assert.equal(afterRedo.block.nodes[0]?.layoutName, "Family");
});

test("sync-from-props clears history when the incoming block differs", () => {
  const initialBlock = createBlock({
    nodes: [createLayoutNode("layout-1", "Home")],
  });
  const editedBlock = createBlock({
    nodes: [createLayoutNode("layout-1", "Family")],
  });

  const editedState = graphEditorReducer(createState(initialBlock), {
    type: "apply-block",
    block: editedBlock,
  });

  const syncedState = graphEditorReducer(editedState, {
    type: "sync-from-props",
    block: initialBlock,
  });

  assert.equal(syncedState.block.nodes[0]?.layoutName, "Home");
  assert.equal(syncedState.historyPast.length, 0);
  assert.equal(syncedState.historyFuture.length, 0);
});
