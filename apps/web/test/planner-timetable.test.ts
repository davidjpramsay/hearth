import assert from "node:assert/strict";
import test from "node:test";
import {
  arePlannerEditorBlocksEqual,
  getPlannerTimetableSlotHeight,
} from "../src/components/admin/planner-timetable";

test("school planner editor uses taller rows for wider grid sizes", () => {
  assert.equal(getPlannerTimetableSlotHeight(15), 32);
  assert.equal(getPlannerTimetableSlotHeight(30), 48);
  assert.equal(getPlannerTimetableSlotHeight(60), 84);
});

test("school planner data sync recognizes equivalent editor blocks", () => {
  const block = {
    clientId: "block-1",
    userId: 1,
    name: "Maths",
    colour: "teal",
    notes: null,
    startTime: "08:00",
    endTime: "09:00",
  };

  assert.equal(arePlannerEditorBlocksEqual([block], [{ ...block }]), true);
  assert.equal(arePlannerEditorBlocksEqual([block], [{ ...block, endTime: "09:30" }]), false);
});
