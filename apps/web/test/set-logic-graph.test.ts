import assert from "node:assert/strict";
import test from "node:test";
import {
  LOCAL_WARNING_CANVAS_ACTION_TYPE,
  type PhotoRouterBlock,
  type PhotoRouterLayoutNode,
  type PhotoRouterPhotoOrientationNode,
  type PhotoRouterTimeGate,
} from "@hearth/shared";
import {
  buildFlowGraph,
  doesTimeWindowOverlap,
  getNextTimeGateWindow,
  resolveInsertPosition,
  wouldCreateGraphCycle,
} from "../src/components/admin/set-logic-editor/graph";

const createLayoutNode = (input: {
  id: string;
  layoutName?: string;
  x?: number;
  y?: number;
}): PhotoRouterLayoutNode => ({
  id: input.id,
  nodeType: "layout",
  layoutName: input.layoutName ?? input.id,
  cycleSeconds: 20,
  actionType: "layout.display",
  actionParams: {},
});

const createPhotoNode = (id: string): PhotoRouterPhotoOrientationNode => ({
  id,
  nodeType: "photo-orientation",
  title: `Photo ${id}`,
  photoActionType: "photo.orientation",
  photoActionCollectionId: null,
  portrait: {
    enabled: true,
    conditionType: "photo.orientation.portrait",
    conditionParams: {},
  },
  landscape: {
    enabled: false,
    conditionType: "photo.orientation.landscape",
    conditionParams: {},
  },
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

test("time gate overlap check allows adjacent windows and rejects intersecting ones", () => {
  const gates: PhotoRouterTimeGate[] = [
    { id: "a", startTime: "09:00", endTime: "10:00" },
    { id: "b", startTime: "10:00", endTime: "11:00" },
  ];

  assert.equal(
    doesTimeWindowOverlap(gates, {
      id: "c",
      startTime: "11:00",
      endTime: "12:00",
    }),
    false,
  );
  assert.equal(
    doesTimeWindowOverlap(gates, {
      id: "d",
      startTime: "09:30",
      endTime: "10:30",
    }),
    true,
  );
});

test("next time gate window skips occupied ranges", () => {
  const gates: PhotoRouterTimeGate[] = [
    { id: "a", startTime: "00:00", endTime: "01:00" },
    { id: "b", startTime: "01:00", endTime: "02:00" },
    { id: "c", startTime: "02:30", endTime: "03:30" },
  ];

  const nextGate = getNextTimeGateWindow(gates);
  assert.ok(nextGate);
  assert.equal(nextGate.startTime, "03:30");
  assert.equal(nextGate.endTime, "04:30");
});

test("cycle detection blocks connections that close a loop", () => {
  const block = createBlock({
    nodes: [
      createLayoutNode({ id: "a" }),
      createLayoutNode({ id: "b" }),
      createLayoutNode({ id: "c" }),
    ],
    connections: [
      { id: "ab", source: "a", sourceHandle: "next", target: "b" },
      { id: "bc", source: "b", sourceHandle: "next", target: "c" },
    ],
  });

  assert.equal(wouldCreateGraphCycle(block, "c", "a"), true);
  assert.equal(wouldCreateGraphCycle(block, "a", "c"), false);
});

test("insert position resolves away from existing node bounds", () => {
  const block = createBlock({
    nodes: [createLayoutNode({ id: "layout-1" })],
    nodePositions: {
      "layout-1": { x: 96, y: 980 },
    },
  });

  const position = resolveInsertPosition({
    block,
    desiredPosition: { x: 96, y: 980 },
    nodeSize: { width: 260, height: 92 },
  });

  assert.notDeepEqual(position, { x: 96, y: 980 });
});

test("flow graph hides the warning portrait edge but keeps the fallback route", () => {
  const warningNode = {
    ...createPhotoNode("warning-1"),
    photoActionType: LOCAL_WARNING_CANVAS_ACTION_TYPE,
    title: "Warning node",
  } satisfies PhotoRouterPhotoOrientationNode;
  const layoutNode = createLayoutNode({ id: "layout-1", layoutName: "Main Layout" });
  const block = createBlock({
    nodes: [warningNode, layoutNode],
    connections: [
      { id: "warning-portrait", source: "warning-1", sourceHandle: "portrait", target: "layout-1" },
      { id: "warning-fallback", source: "warning-1", sourceHandle: "fallback", target: "layout-1" },
    ],
    nodePositions: {
      "warning-1": { x: 420, y: 180 },
      "layout-1": { x: 96, y: 980 },
    },
  });

  const graph = buildFlowGraph({
    block,
    selectedNodeId: "warning-1",
    photoCollectionOptions: [],
    onRemoveNode: () => {},
    onSelectNode: () => {},
    isCanvasInteractive: true,
  });

  assert.equal(
    graph.edges.some((edge) => edge.id === "warning-portrait"),
    false,
  );
  assert.equal(
    graph.edges.some((edge) => edge.id === "warning-fallback"),
    true,
  );
});
