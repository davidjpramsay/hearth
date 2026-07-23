import assert from "node:assert/strict";
import test from "node:test";
import { getAdaptiveGridMetrics, sanitizeGridItems } from "../src/layout/grid-math";

test("grid scaling preserves shared edges without creating rounding collisions", () => {
  const items = sanitizeGridItems({
    items: [
      { i: "clock", x: 0, y: 0, w: 7, h: 4 },
      { i: "weather", x: 7, y: 0, w: 7, h: 4 },
      { i: "family", x: 14, y: 0, w: 18, h: 4 },
    ],
    modules: [],
    sourceCols: 32,
    sourceRows: 18,
    targetCols: 48,
    targetRows: 27,
  });

  assert.deepEqual(items, [
    { i: "clock", x: 0, y: 0, w: 11, h: 6 },
    { i: "weather", x: 11, y: 0, w: 10, h: 6 },
    { i: "family", x: 21, y: 0, w: 27, h: 6 },
  ]);
});

test("photo ratio locking stays inside the module's intended right-side region", () => {
  const items = sanitizeGridItems({
    items: [
      { i: "calendar", x: 0, y: 4, w: 23, h: 14 },
      { i: "photos", x: 23, y: 4, w: 9, h: 9 },
      { i: "chores", x: 23, y: 13, w: 9, h: 5 },
    ],
    modules: [
      {
        id: "photos",
        moduleId: "photos",
        config: { layoutOrientation: "landscape" },
      },
    ],
    sourceCols: 32,
    sourceRows: 18,
    targetCols: 32,
    targetRows: 18,
  });

  const photo = items.find((item) => item.i === "photos");
  assert.ok(photo);
  assert.equal(photo.x, 23);
  assert.equal(photo.y, 4);
  assert.ok(photo.x + photo.w <= 32);
  assert.ok(photo.y + photo.h <= 13);
  assert.deepEqual(
    items.find((item) => item.i === "chores"),
    {
      i: "chores",
      x: 23,
      y: 13,
      w: 9,
      h: 5,
    },
  );
});

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
