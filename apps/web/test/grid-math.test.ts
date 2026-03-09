import assert from "node:assert/strict";
import test from "node:test";
import { getAdaptiveGridMetrics } from "../src/layout/grid-math";

test("16:9 resolves to an exactly divisible landscape grid", () => {
  const metrics = getAdaptiveGridMetrics({
    canvasWidth: 1920,
    canvasHeight: 1080,
    aspectWidth: 16,
    aspectHeight: 9,
  });

  assert.deepEqual(metrics, {
    cols: 48,
    rows: 27,
    rowHeight: 40,
  });
});

test("1:2 resolves to a clean tall grid without collapsing", () => {
  const metrics = getAdaptiveGridMetrics({
    canvasWidth: 1920,
    canvasHeight: 3840,
    aspectWidth: 1,
    aspectHeight: 2,
  });

  assert.deepEqual(metrics, {
    cols: 24,
    rows: 48,
    rowHeight: 80,
  });
});

test("4:3 stays evenly divisible on both axes", () => {
  const metrics = getAdaptiveGridMetrics({
    canvasWidth: 1920,
    canvasHeight: 1440,
    aspectWidth: 4,
    aspectHeight: 3,
  });

  assert.deepEqual(metrics, {
    cols: 32,
    rows: 24,
    rowHeight: 60,
  });
});

test("near-square portrait ratios stay readable without exploding the grid density", () => {
  const metrics = getAdaptiveGridMetrics({
    canvasWidth: 2000,
    canvasHeight: 2400,
    aspectWidth: 5,
    aspectHeight: 6,
  });

  assert.deepEqual(metrics, {
    cols: 25,
    rows: 30,
    rowHeight: 80,
  });
});

test("7:9 avoids oversized portrait grids", () => {
  const metrics = getAdaptiveGridMetrics({
    canvasWidth: 1920,
    canvasHeight: 2469,
    aspectWidth: 7,
    aspectHeight: 9,
  });

  assert.deepEqual(metrics, {
    cols: 28,
    rows: 36,
    rowHeight: 68.57142857142857,
  });
});

test("8:9 keeps portrait grids close to the target short-side density", () => {
  const metrics = getAdaptiveGridMetrics({
    canvasWidth: 1920,
    canvasHeight: 2160,
    aspectWidth: 8,
    aspectHeight: 9,
  });

  assert.deepEqual(metrics, {
    cols: 24,
    rows: 27,
    rowHeight: 80,
  });
});
