import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createDatabase } from "../src/db";
import { PlannerRepository } from "../src/repositories/planner-repository";

const createHarness = () => {
  const directory = mkdtempSync(join(tmpdir(), "hearth-planner-repository-"));
  const db = createDatabase(join(directory, "hearth.sqlite"));
  const repository = new PlannerRepository(db);

  return {
    directory,
    db,
    repository,
    cleanup: () => {
      db.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
};

test("planner repository duplicates templates with blocks", () => {
  const harness = createHarness();

  try {
    const alex = harness.repository.createUser({ name: "Alex" });
    const charlie = harness.repository.createUser({ name: "Charlie" });
    const template = harness.repository.createTemplate({
      name: "Monday core",
      repeatDays: [1, 3],
    });

    harness.repository.replaceTemplateBlocks(template.id, {
      dayWindow: { startTime: "08:00", endTime: "15:00" },
      blocks: [
        {
          userId: alex.id,
          name: "Maths",
          colour: "color-4",
          notes: "Workbook",
          startTime: "08:00",
          endTime: "09:00",
        },
        {
          userId: charlie.id,
          name: "Reading",
          colour: "color-7",
          notes: null,
          startTime: "09:15",
          endTime: "10:00",
        },
      ],
    });

    const duplicate = harness.repository.duplicateTemplate(template.id, {
      name: "Monday core copy",
    });

    assert.ok(duplicate);
    assert.notEqual(duplicate?.id, template.id);
    assert.deepEqual(duplicate?.repeatDays, []);
    const duplicateBlocks = harness.repository.listTemplateBlocks(duplicate!.id);
    assert.equal(duplicateBlocks.length, 2);
    assert.equal(duplicateBlocks[0]?.name, "Maths");
    assert.equal(duplicateBlocks[1]?.name, "Reading");
  } finally {
    harness.cleanup();
  }
});

test("planner repository rejects overlapping blocks in the same user column", () => {
  const harness = createHarness();

  try {
    const alex = harness.repository.createUser({ name: "Alex" });
    const template = harness.repository.createTemplate({ name: "Overlap test", repeatDays: [] });

    assert.throws(
      () =>
        harness.repository.replaceTemplateBlocks(template.id, {
          dayWindow: { startTime: "08:00", endTime: "15:00" },
          blocks: [
            {
              userId: alex.id,
              name: "Maths",
              colour: "color-4",
              notes: null,
              startTime: "08:00",
              endTime: "09:00",
            },
            {
              userId: alex.id,
              name: "Science",
              colour: "color-2",
              notes: null,
              startTime: "08:45",
              endTime: "09:30",
            },
          ],
        }),
      /cannot overlap/i,
    );
  } finally {
    harness.cleanup();
  }
});

test("planner repository allows adjacent blocks in the same user column", () => {
  const harness = createHarness();

  try {
    const alex = harness.repository.createUser({ name: "Alex" });
    const template = harness.repository.createTemplate({ name: "Adjacent test", repeatDays: [] });

    const blocks = harness.repository.replaceTemplateBlocks(template.id, {
      dayWindow: { startTime: "08:00", endTime: "15:00" },
      blocks: [
        {
          userId: alex.id,
          name: "Maths",
          colour: "color-4",
          notes: null,
          startTime: "08:00",
          endTime: "09:00",
        },
        {
          userId: alex.id,
          name: "Science",
          colour: "color-2",
          notes: null,
          startTime: "09:00",
          endTime: "09:45",
        },
      ],
    });

    assert.equal(blocks.length, 2);
    assert.equal(blocks[1]?.startTime, "09:00");
  } finally {
    harness.cleanup();
  }
});

test("planner repository preserves custom day window grid size in today plans", () => {
  const harness = createHarness();

  try {
    const alex = harness.repository.createUser({ name: "Alex" });
    const monday = harness.repository.createTemplate({ name: "Monday core", repeatDays: [1] });

    harness.repository.replaceTemplateBlocks(monday.id, {
      dayWindow: { startTime: "08:00", endTime: "15:00", slotMinutes: 30 },
      blocks: [
        {
          userId: alex.id,
          name: "Maths",
          colour: "color-4",
          notes: null,
          startTime: "08:00",
          endTime: "09:00",
        },
      ],
    });

    const today = harness.repository.getTodayPlan({
      siteDate: "2026-04-06",
      dayWindow: { startTime: "08:00", endTime: "15:00", slotMinutes: 30 },
    });
    assert.equal(today.dayWindow.slotMinutes, 30);
  } finally {
    harness.cleanup();
  }
});

test("planner repository prefers explicit assignments over weekday repeats", () => {
  const harness = createHarness();

  try {
    const alex = harness.repository.createUser({ name: "Alex" });
    const monday = harness.repository.createTemplate({ name: "Monday core", repeatDays: [1] });
    const friday = harness.repository.createTemplate({ name: "Friday core", repeatDays: [5] });

    harness.repository.replaceTemplateBlocks(monday.id, {
      dayWindow: { startTime: "08:00", endTime: "15:00" },
      blocks: [
        {
          userId: alex.id,
          name: "Maths",
          colour: "color-4",
          notes: null,
          startTime: "08:00",
          endTime: "09:00",
        },
      ],
    });

    harness.repository.upsertAssignment({
      date: "2026-04-03",
      templateId: friday.id,
    });

    const today = harness.repository.getTodayPlan({
      siteDate: "2026-04-03",
      dayWindow: { startTime: "08:00", endTime: "15:00", slotMinutes: 15 },
    });
    assert.equal(today.template?.name, "Friday core");
  } finally {
    harness.cleanup();
  }
});

test("planner repository returns weekly completion summaries", () => {
  const harness = createHarness();

  try {
    const alex = harness.repository.createUser({ name: "Alex" });
    const monday = harness.repository.createTemplate({ name: "Monday core", repeatDays: [1] });

    const [block] = harness.repository.replaceTemplateBlocks(monday.id, {
      dayWindow: { startTime: "08:00", endTime: "15:00" },
      blocks: [
        {
          userId: alex.id,
          name: "Maths",
          colour: "color-4",
          notes: null,
          startTime: "08:00",
          endTime: "09:00",
        },
      ],
    });

    harness.repository.setActivityCompletion({
      blockId: block.id,
      date: "2026-04-06",
      completed: true,
      dayWindow: { startTime: "08:00", endTime: "15:00", slotMinutes: 15 },
    });

    const summary = harness.repository.getWeekSummary({
      startDate: "2026-04-06",
      days: 7,
      dayWindow: { startTime: "08:00", endTime: "15:00", slotMinutes: 15 },
    });

    const mondaySummary = summary.days[0];
    assert.equal(mondaySummary?.blocks[0]?.completed, true);
    assert.equal(summary.days.length, 7);
  } finally {
    harness.cleanup();
  }
});

test("planner today plans stay stable after a template is edited", () => {
  const harness = createHarness();

  try {
    const ele = harness.repository.createUser({ name: "Ele" });
    const monday = harness.repository.createTemplate({ name: "Monday core", repeatDays: [1] });

    harness.repository.replaceTemplateBlocks(monday.id, {
      dayWindow: { startTime: "08:00", endTime: "15:00", slotMinutes: 15 },
      blocks: [
        {
          userId: ele.id,
          name: "Maths",
          colour: "color-4",
          notes: "Workbook",
          startTime: "08:00",
          endTime: "09:00",
        },
      ],
    });

    const original = harness.repository.getTodayPlan({
      siteDate: "2026-04-06",
      dayWindow: { startTime: "08:00", endTime: "15:00", slotMinutes: 15 },
    });

    harness.repository.replaceTemplateBlocks(monday.id, {
      dayWindow: { startTime: "08:00", endTime: "15:00", slotMinutes: 15 },
      blocks: [
        {
          userId: ele.id,
          name: "Science",
          colour: "color-6",
          notes: null,
          startTime: "10:00",
          endTime: "11:00",
        },
      ],
    });

    const afterEdit = harness.repository.getTodayPlan({
      siteDate: "2026-04-06",
      dayWindow: { startTime: "08:00", endTime: "15:00", slotMinutes: 15 },
    });

    assert.equal(original.blocks[0]?.name, "Maths");
    assert.equal(afterEdit.blocks[0]?.name, "Maths");
    assert.equal(afterEdit.blocks.length, 1);
  } finally {
    harness.cleanup();
  }
});

test("planner completion updates only activities from the requested school day", () => {
  const harness = createHarness();

  try {
    const ele = harness.repository.createUser({ name: "Ele" });
    const monday = harness.repository.createTemplate({ name: "Monday core", repeatDays: [1] });

    harness.repository.replaceTemplateBlocks(monday.id, {
      dayWindow: { startTime: "08:00", endTime: "15:00", slotMinutes: 15 },
      blocks: [
        {
          userId: ele.id,
          name: "Maths",
          colour: "color-4",
          notes: null,
          startTime: "08:00",
          endTime: "09:00",
        },
      ],
    });

    const mondayPlan = harness.repository.getTodayPlan({
      siteDate: "2026-04-06",
      dayWindow: { startTime: "08:00", endTime: "15:00", slotMinutes: 15 },
    });

    assert.throws(
      () =>
        harness.repository.setActivityCompletion({
          blockId: mondayPlan.blocks[0]!.id,
          date: "2026-04-07",
          completed: true,
          dayWindow: { startTime: "08:00", endTime: "15:00", slotMinutes: 15 },
        }),
      /school day/i,
    );
  } finally {
    harness.cleanup();
  }
});

test("planner latest week summary creates an archive record for the previous week", () => {
  const harness = createHarness();

  try {
    const ele = harness.repository.createUser({ name: "Ele" });
    const monday = harness.repository.createTemplate({ name: "Monday core", repeatDays: [1] });

    harness.repository.replaceTemplateBlocks(monday.id, {
      dayWindow: { startTime: "08:00", endTime: "15:00", slotMinutes: 15 },
      blocks: [
        {
          userId: ele.id,
          name: "Maths",
          colour: "color-4",
          notes: null,
          startTime: "08:00",
          endTime: "09:00",
        },
      ],
    });

    const summary = harness.repository.getLatestWeekSummary({
      siteToday: "2026-04-15",
      dayWindow: { startTime: "08:00", endTime: "15:00", slotMinutes: 15 },
    });
    const archive = harness.repository.getSummaryArchive("2026-04-06");
    const archives = harness.repository.listSummaryArchives();

    assert.equal(summary.startDate, "2026-04-06");
    assert.equal(summary.endDate, "2026-04-12");
    assert.equal(archive?.weekStartDate, "2026-04-06");
    assert.equal(archive?.pdfAvailable, false);
    assert.equal(archives.archives.length, 0);
  } finally {
    harness.cleanup();
  }
});

test("planner freezes the previous week before later template edits", () => {
  const harness = createHarness();

  try {
    const ele = harness.repository.createUser({ name: "Ele" });
    const monday = harness.repository.createTemplate({ name: "Monday core", repeatDays: [1] });

    harness.repository.replaceTemplateBlocks(monday.id, {
      dayWindow: { startTime: "08:00", endTime: "15:00", slotMinutes: 15 },
      blocks: [
        {
          userId: ele.id,
          name: "Maths",
          colour: "color-4",
          notes: null,
          startTime: "08:00",
          endTime: "09:00",
        },
      ],
    });

    harness.repository.freezeCompletedWeeksThrough({
      siteDate: "2026-04-15",
      dayWindow: { startTime: "08:00", endTime: "15:00", slotMinutes: 15 },
    });

    harness.repository.replaceTemplateBlocks(monday.id, {
      dayWindow: { startTime: "08:00", endTime: "15:00", slotMinutes: 15 },
      blocks: [
        {
          userId: ele.id,
          name: "Science",
          colour: "color-6",
          notes: null,
          startTime: "10:00",
          endTime: "11:00",
        },
      ],
    });

    const summary = harness.repository.getLatestWeekSummary({
      siteToday: "2026-04-15",
      dayWindow: { startTime: "08:00", endTime: "15:00", slotMinutes: 15 },
    });

    const mondaySummary = summary.days.find((day) => day.date === "2026-04-06");
    assert.equal(mondaySummary?.blocks[0]?.name, "Maths");
  } finally {
    harness.cleanup();
  }
});

test("planner weekly summaries keep snapshot child names after roster changes", () => {
  const harness = createHarness();

  try {
    const ele = harness.repository.createUser({ name: "Ele" });
    const monday = harness.repository.createTemplate({ name: "Monday core", repeatDays: [1] });

    harness.repository.replaceTemplateBlocks(monday.id, {
      dayWindow: { startTime: "08:00", endTime: "15:00", slotMinutes: 15 },
      blocks: [
        {
          userId: ele.id,
          name: "Maths",
          colour: "color-4",
          notes: null,
          startTime: "08:00",
          endTime: "09:00",
        },
      ],
    });

    harness.repository.freezeCompletedWeeksThrough({
      siteDate: "2026-04-15",
      dayWindow: { startTime: "08:00", endTime: "15:00", slotMinutes: 15 },
    });

    harness.repository.updateUser(ele.id, { name: "Eleanor" });

    const summary = harness.repository.getLatestWeekSummary({
      siteToday: "2026-04-15",
      dayWindow: { startTime: "08:00", endTime: "15:00", slotMinutes: 15 },
    });

    assert.equal(summary.users[0]?.name, "Ele");
  } finally {
    harness.cleanup();
  }
});

test("planner users with archived School history cannot be deleted", () => {
  const harness = createHarness();

  try {
    const ele = harness.repository.createUser({ name: "Ele" });
    const monday = harness.repository.createTemplate({ name: "Monday core", repeatDays: [1] });

    harness.repository.replaceTemplateBlocks(monday.id, {
      dayWindow: { startTime: "08:00", endTime: "15:00", slotMinutes: 15 },
      blocks: [
        {
          userId: ele.id,
          name: "Maths",
          colour: "color-4",
          notes: null,
          startTime: "08:00",
          endTime: "09:00",
        },
      ],
    });

    harness.repository.freezeCompletedWeeksThrough({
      siteDate: "2026-04-15",
      dayWindow: { startTime: "08:00", endTime: "15:00", slotMinutes: 15 },
    });

    assert.throws(() => harness.repository.deleteUser(ele.id), /School history/i);
  } finally {
    harness.cleanup();
  }
});

test("planner repeat days cannot overlap across templates", () => {
  const harness = createHarness();

  try {
    harness.repository.createTemplate({ name: "Monday core", repeatDays: [1, 3] });

    assert.throws(
      () => harness.repository.createTemplate({ name: "Excursion", repeatDays: [3, 5] }),
      /Repeat days already belong/i,
    );
  } finally {
    harness.cleanup();
  }
});

test("planner repeat days cannot be reassigned onto an occupied weekday", () => {
  const harness = createHarness();

  try {
    harness.repository.createTemplate({ name: "Monday core", repeatDays: [1] });
    const friday = harness.repository.createTemplate({ name: "Friday core", repeatDays: [5] });

    assert.throws(
      () => harness.repository.updateTemplate(friday.id, { repeatDays: [1, 5] }),
      /Repeat days already belong/i,
    );
  } finally {
    harness.cleanup();
  }
});

test("planner resolves today's plan from the repeated weekday", () => {
  const harness = createHarness();

  try {
    const alex = harness.repository.createUser({ name: "Alex" });
    const monday = harness.repository.createTemplate({ name: "Monday core", repeatDays: [1] });
    harness.repository.createTemplate({ name: "Friday core", repeatDays: [5] });

    harness.repository.replaceTemplateBlocks(monday.id, {
      dayWindow: { startTime: "08:00", endTime: "15:00" },
      blocks: [
        {
          userId: alex.id,
          name: "Maths",
          colour: "color-4",
          notes: null,
          startTime: "08:00",
          endTime: "09:00",
        },
      ],
    });

    const today = harness.repository.getTodayPlan({
      siteDate: "2026-04-06",
      dayWindow: { startTime: "08:00", endTime: "15:00" },
    });
    assert.equal(today.template?.name, "Monday core");
    assert.equal(today.blocks[0]?.name, "Maths");
  } finally {
    harness.cleanup();
  }
});
