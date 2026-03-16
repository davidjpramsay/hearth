import assert from "node:assert/strict";
import test from "node:test";
import { buildRollingMonthGrid } from "../src/modules/sdk/calendar.module";

test("month grid always renders four weeks anchored to the current week", () => {
  const referenceDate = new Date(2026, 2, 18, 14, 30, 0, 0);
  const grid = buildRollingMonthGrid(referenceDate);

  assert.equal(grid.weekCount, 4);
  assert.equal(grid.cells.length, 28);
  assert.deepEqual(grid.cells[0], new Date(2026, 2, 15, 0, 0, 0, 0));
  assert.deepEqual(grid.cells[27], new Date(2026, 3, 11, 0, 0, 0, 0));
});

test("month grid keeps the current day in the top row", () => {
  const referenceDate = new Date(2026, 10, 6, 9, 15, 0, 0);
  const grid = buildRollingMonthGrid(referenceDate);
  const referenceDayMs = new Date(2026, 10, 6, 0, 0, 0, 0).getTime();
  const topRow = grid.cells.slice(0, 7).map((day) => day.getTime());

  assert.ok(topRow.includes(referenceDayMs));
});
