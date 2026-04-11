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
