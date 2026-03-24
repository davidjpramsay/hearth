import assert from "node:assert/strict";
import test from "node:test";
import {
  applyLayoutSetLogicEdgeState,
  createLayoutSetLogicGraphFromBranches,
  normalizeLayoutSetLogicEdgeState,
  resolveDisplaySequenceFromLogicGraph,
  type AutoLayoutTarget,
  type LayoutSetLogicGraph,
} from "@hearth/shared";
import { analyzeSetRuntimeHealth } from "../src/pages/layout-set-runtime-health";

const toRule = (layoutName: string, trigger: AutoLayoutTarget["trigger"]): AutoLayoutTarget => ({
  layoutName,
  trigger,
  cycleSeconds: 20,
  actionType: "layout.display",
  actionParams: {},
  conditionType:
    trigger === "portrait-photo"
      ? "photo.orientation.portrait"
      : trigger === "landscape-photo"
        ? "photo.orientation.landscape"
        : null,
  conditionParams: {},
});

test("reports healthy runtime for a valid portrait/landscape graph", () => {
  const graph = createLayoutSetLogicGraphFromBranches({
    alwaysRules: [],
    portraitRules: [toRule("Portrait layout", "portrait-photo")],
    landscapeRules: [toRule("Landscape layout", "landscape-photo")],
  });

  const health = analyzeSetRuntimeHealth({
    graph,
    knownLayoutNames: new Set(["Portrait layout", "Landscape layout"]),
  });

  assert.equal(health.status, "ok");
  assert.equal(health.issues.length, 0);
  assert.equal(
    health.paths.find((entry) => entry.key === "portrait")?.sequence[0]?.layoutName,
    "Portrait layout",
  );
  assert.equal(
    health.paths.find((entry) => entry.key === "landscape")?.sequence[0]?.layoutName,
    "Landscape layout",
  );
});

test("flags broken graph edges as runtime errors", () => {
  const graph = {
    version: 1,
    entryNodeId: "start",
    nodes: [
      { id: "start", type: "start" },
      { id: "return", type: "return" },
    ],
    edges: [{ id: "edge-start-missing", from: "start", to: "missing", when: "always" }],
  } satisfies LayoutSetLogicGraph;

  const health = analyzeSetRuntimeHealth({
    graph,
    knownLayoutNames: new Set(),
  });

  assert.equal(health.status, "error");
  assert.ok(
    health.issues.some((issue) =>
      issue.message.includes('Edge "edge-start-missing" points to missing node'),
    ),
  );
});

test("warns when one orientation has no display path", () => {
  const graph = createLayoutSetLogicGraphFromBranches({
    alwaysRules: [],
    portraitRules: [toRule("Portrait only", "portrait-photo")],
    landscapeRules: [],
  });

  const health = analyzeSetRuntimeHealth({
    graph,
    knownLayoutNames: new Set(["Portrait only"]),
  });

  assert.equal(health.status, "warning");
  assert.ok(
    health.issues.some((issue) =>
      issue.message.includes("Landscape simulation resolves no display steps"),
    ),
  );
});

test("applies disconnected edge state in runtime simulation", () => {
  const graph = createLayoutSetLogicGraphFromBranches({
    alwaysRules: [toRule("Fallback", "always")],
    portraitRules: [],
    landscapeRules: [],
  });

  const health = analyzeSetRuntimeHealth({
    graph,
    knownLayoutNames: new Set(["Fallback"]),
    disconnectedEdgeIds: ["edge-start-photo"],
  });

  assert.equal(health.status, "warning");
  assert.ok(
    health.paths.every((path) => path.sequence.length === 0),
    "all simulated paths should be empty when start edge is disconnected",
  );
});

test("normalizes invalid edge overrides/disconnect ids", () => {
  const graph = createLayoutSetLogicGraphFromBranches({
    alwaysRules: [toRule("Fallback", "always")],
    portraitRules: [],
    landscapeRules: [],
  });

  const edgeState = normalizeLayoutSetLogicEdgeState({
    graph,
    edgeOverrides: {
      "edge-start-photo": { source: "start", target: "if-missing" },
      "edge-missing": { source: "start", target: "return" },
    },
    disconnectedEdgeIds: ["edge-missing", "edge-photo-else"],
  });

  assert.deepEqual(edgeState.edgeOverrides, {});
  assert.deepEqual(edgeState.disconnectedEdgeIds, ["edge-photo-else"]);
});

test("applies edge override to runtime resolution", () => {
  const graph = createLayoutSetLogicGraphFromBranches({
    alwaysRules: [toRule("Fallback", "always")],
    portraitRules: [toRule("Portrait", "portrait-photo")],
    landscapeRules: [],
  });

  const effectiveGraph = applyLayoutSetLogicEdgeState({
    graph,
    edgeOverrides: {
      "edge-portrait-yes": {
        source: "if-portrait",
        target: "display-fallback-0",
      },
    },
  });

  const portraitSequence = resolveDisplaySequenceFromLogicGraph({
    graph: effectiveGraph,
    orientation: "portrait",
  });

  assert.equal(portraitSequence[0]?.layoutName, "Fallback");
});

test("accepts time gate condition nodes in runtime analysis", () => {
  const graph = {
    version: 1,
    entryNodeId: "start",
    nodes: [
      { id: "start", type: "start" },
      {
        id: "if-time:morning:gate-1",
        type: "if-time",
        conditionType: "time.window.site-local",
        conditionParams: {
          startTime: "09:00",
          endTime: "10:00",
        },
      },
      {
        id: "display-match",
        type: "display",
        layoutName: "Morning",
        cycleSeconds: 20,
        actionType: "layout.display",
        actionParams: {},
        conditionType: null,
        conditionParams: {},
      },
      {
        id: "display-fallback",
        type: "display",
        layoutName: "Else",
        cycleSeconds: 20,
        actionType: "layout.display",
        actionParams: {},
        conditionType: null,
        conditionParams: {},
      },
      { id: "return", type: "return" },
    ],
    edges: [
      { id: "edge-start-time", from: "start", to: "if-time:morning:gate-1", when: "always" },
      { id: "edge-time-yes", from: "if-time:morning:gate-1", to: "display-match", when: "yes" },
      { id: "edge-time-no", from: "if-time:morning:gate-1", to: "display-fallback", when: "no" },
      { id: "edge-match-return", from: "display-match", to: "return", when: "always" },
      { id: "edge-fallback-return", from: "display-fallback", to: "return", when: "always" },
    ],
  } satisfies LayoutSetLogicGraph;

  const health = analyzeSetRuntimeHealth({
    graph,
    knownLayoutNames: new Set(["Morning", "Else"]),
  });

  assert.equal(health.status, "ok");
  assert.equal(health.issues.length, 0);
});
