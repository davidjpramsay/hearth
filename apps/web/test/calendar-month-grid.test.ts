import assert from "node:assert/strict";
import test from "node:test";
import { buildRollingMonthGrid } from "../src/modules/sdk/calendar.module";

test("month grid always renders four weeks anchored to the current week", () => {
  const grid = buildRollingMonthGrid("2026-03-18");

  assert.equal(grid.weekCount, 4);
  assert.equal(grid.cells.length, 28);
  assert.equal(grid.cells[0], "2026-03-15");
  assert.equal(grid.cells[27], "2026-04-11");
});

test("month grid keeps the current day in the top row", () => {
  const grid = buildRollingMonthGrid("2026-11-06");
  const topRow = grid.cells.slice(0, 7);

  assert.ok(topRow.includes("2026-11-06"));
});
