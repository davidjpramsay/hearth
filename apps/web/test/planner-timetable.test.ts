import assert from "node:assert/strict";
import test from "node:test";
import { getPlannerTimetableSlotHeight } from "../src/components/admin/planner-timetable";

test("school planner editor uses taller rows for wider grid sizes", () => {
  assert.equal(getPlannerTimetableSlotHeight(15), 32);
  assert.equal(getPlannerTimetableSlotHeight(30), 48);
  assert.equal(getPlannerTimetableSlotHeight(60), 84);
});
