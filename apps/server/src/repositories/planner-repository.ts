import {
  findPlannerBlockConflict,
  normalizePlannerRepeatDays,
  plannerDateToDayOfWeek,
  plannerActivityBlockDraftSchema,
  plannerActivityBlockSchema,
  plannerDashboardResponseSchema,
  plannerDateAssignmentSchema,
  plannerDayWindowConfigSchema,
  plannerTemplateDetailSchema,
  plannerTemplateSchema,
  plannerTodayResponseSchema,
  plannerUserSchema,
  plannerBlocksFitDayWindow,
  type PlannerActivityBlock,
  type PlannerActivityBlockDraft,
  type PlannerDashboardResponse,
  type PlannerDateAssignment,
  type PlannerDayWindowConfig,
  type PlannerTemplate,
  type PlannerTemplateDetail,
  type PlannerTodayResponse,
  type PlannerUser,
} from "@hearth/shared";
import type Database from "better-sqlite3";

interface PlannerUserRow {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
}

interface PlannerTemplateRow {
  id: number;
  name: string;
  repeat_days_json: string;
  created_at: string;
  updated_at: string;
}

interface PlannerBlockRow {
  id: number;
  template_id: number;
  user_id: number;
  name: string;
  colour: string;
  notes: string | null;
  start_time: string;
  end_time: string;
  created_at: string;
  updated_at: string;
}

interface PlannerAssignmentRow {
  assignment_date: string;
  template_id: number;
  created_at: string;
  updated_at: string;
  template_name?: string;
}

const toPlannerUser = (row: PlannerUserRow): PlannerUser =>
  plannerUserSchema.parse({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

const toPlannerTemplate = (row: PlannerTemplateRow): PlannerTemplate =>
  plannerTemplateSchema.parse({
    id: row.id,
    name: row.name,
    repeatDays: (() => {
      try {
        return normalizePlannerRepeatDays(JSON.parse(row.repeat_days_json));
      } catch {
        return [];
      }
    })(),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

const toPlannerBlock = (row: PlannerBlockRow): PlannerActivityBlock =>
  plannerActivityBlockSchema.parse({
    id: row.id,
    templateId: row.template_id,
    userId: row.user_id,
    name: row.name,
    colour: row.colour,
    notes: row.notes,
    startTime: row.start_time,
    endTime: row.end_time,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

const toPlannerAssignment = (row: PlannerAssignmentRow): PlannerDateAssignment =>
  plannerDateAssignmentSchema.parse({
    date: row.assignment_date,
    templateId: row.template_id,
    templateName: row.template_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

export class PlannerRepository {
  constructor(private readonly db: Database.Database) {}

  private assertRepeatDaysAvailable(repeatDays: number[], excludeTemplateId?: number): void {
    const normalizedRepeatDays = normalizePlannerRepeatDays(repeatDays);
    if (normalizedRepeatDays.length === 0) {
      return;
    }

    const templates = this.listTemplates().filter((template) => template.id !== excludeTemplateId);
    const conflicts = templates.filter((template) =>
      template.repeatDays.some((day) => normalizedRepeatDays.includes(day)),
    );

    if (conflicts.length === 0) {
      return;
    }

    const conflictingDays = normalizePlannerRepeatDays(
      conflicts.flatMap((template) => template.repeatDays),
    ).filter((day) => normalizedRepeatDays.includes(day));
    const dayLabels = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    throw new Error(
      `Repeat days already belong to another school plan: ${conflictingDays
        .map((day) => dayLabels[day] ?? String(day))
        .join(", ")}`,
    );
  }

  listUsers(): PlannerUser[] {
    const rows = this.db
      .prepare<[], PlannerUserRow>(
        `
        SELECT id, name, created_at, updated_at
        FROM members
        ORDER BY name COLLATE NOCASE ASC
        `,
      )
      .all();
    return rows.map(toPlannerUser);
  }

  getUserById(id: number): PlannerUser | null {
    const row = this.db
      .prepare<{ id: number }, PlannerUserRow>(
        `
        SELECT id, name, created_at, updated_at
        FROM members
        WHERE id = @id
        `,
      )
      .get({ id });
    return row ? toPlannerUser(row) : null;
  }

  createUser(input: { name: string }): PlannerUser {
    const result = this.db
      .prepare(
        `
        INSERT INTO members (name, avatar_url, weekly_allowance)
        VALUES (@name, NULL, 0)
        `,
      )
      .run({
        name: input.name.trim(),
      });

    const created = this.getUserById(Number(result.lastInsertRowid));
    if (!created) {
      throw new Error("Failed to create planner user");
    }

    return created;
  }

  updateUser(id: number, input: { name: string }): PlannerUser | null {
    const existing = this.getUserById(id);
    if (!existing) {
      return null;
    }

    this.db
      .prepare(
        `
        UPDATE members
        SET name = @name,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = @id
        `,
      )
      .run({
        id,
        name: input.name.trim(),
      });

    return this.getUserById(id);
  }

  deleteUser(id: number): boolean {
    const result = this.db.prepare("DELETE FROM members WHERE id = @id").run({ id });
    return result.changes > 0;
  }

  listTemplates(): PlannerTemplate[] {
    const rows = this.db
      .prepare<
        [],
        PlannerTemplateRow
      >("SELECT * FROM planner_templates ORDER BY created_at ASC, id ASC")
      .all();
    return rows.map(toPlannerTemplate);
  }

  getTemplateById(id: number): PlannerTemplate | null {
    const row = this.db
      .prepare<{ id: number }, PlannerTemplateRow>("SELECT * FROM planner_templates WHERE id = @id")
      .get({ id });
    return row ? toPlannerTemplate(row) : null;
  }

  createTemplate(input: { name: string; repeatDays?: number[] }): PlannerTemplate {
    const repeatDays = normalizePlannerRepeatDays(input.repeatDays ?? []);
    this.assertRepeatDaysAvailable(repeatDays);

    const result = this.db
      .prepare(
        `
        INSERT INTO planner_templates (name, repeat_days_json)
        VALUES (@name, @repeatDaysJson)
        `,
      )
      .run({
        name: input.name.trim(),
        repeatDaysJson: JSON.stringify(repeatDays),
      });

    const created = this.getTemplateById(Number(result.lastInsertRowid));
    if (!created) {
      throw new Error("Failed to create planner template");
    }

    return created;
  }

  updateTemplate(
    id: number,
    input: { name?: string; repeatDays?: number[] },
  ): PlannerTemplate | null {
    const existing = this.getTemplateById(id);
    if (!existing) {
      return null;
    }

    const nextName = input.name?.trim() || existing.name;
    const nextRepeatDays =
      input.repeatDays !== undefined
        ? normalizePlannerRepeatDays(input.repeatDays)
        : existing.repeatDays;
    this.assertRepeatDaysAvailable(nextRepeatDays, id);

    this.db
      .prepare(
        `
        UPDATE planner_templates
        SET name = @name,
            repeat_days_json = @repeatDaysJson,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = @id
        `,
      )
      .run({
        id,
        name: nextName,
        repeatDaysJson: JSON.stringify(nextRepeatDays),
      });

    return this.getTemplateById(id);
  }

  deleteTemplate(id: number): boolean {
    const result = this.db.prepare("DELETE FROM planner_templates WHERE id = @id").run({ id });
    return result.changes > 0;
  }

  duplicateTemplate(id: number, input: { name: string }): PlannerTemplate | null {
    const existing = this.getTemplateById(id);
    if (!existing) {
      return null;
    }

    const sourceBlocks = this.listTemplateBlocks(id);
    const transaction = this.db.transaction(() => {
      const result = this.db
        .prepare(
          `
          INSERT INTO planner_templates (name, repeat_days_json)
          VALUES (@name, '[]')
          `,
        )
        .run({
          name: input.name.trim(),
        });
      const nextTemplateId = Number(result.lastInsertRowid);

      const insertBlock = this.db.prepare(
        `
        INSERT INTO planner_template_blocks (
          template_id,
          user_id,
          name,
          colour,
          notes,
          start_time,
          end_time
        )
        VALUES (
          @templateId,
          @userId,
          @name,
          @colour,
          @notes,
          @startTime,
          @endTime
        )
        `,
      );

      for (const block of sourceBlocks) {
        insertBlock.run({
          templateId: nextTemplateId,
          userId: block.userId,
          name: block.name,
          colour: block.colour,
          notes: block.notes,
          startTime: block.startTime,
          endTime: block.endTime,
        });
      }

      return nextTemplateId;
    });

    const nextTemplateId = transaction();
    return this.getTemplateById(nextTemplateId);
  }

  listTemplateBlocks(templateId: number): PlannerActivityBlock[] {
    const rows = this.db
      .prepare<{ templateId: number }, PlannerBlockRow>(
        `
        SELECT *
        FROM planner_template_blocks
        WHERE template_id = @templateId
        ORDER BY start_time ASC, end_time ASC, id ASC
        `,
      )
      .all({ templateId });
    return rows.map(toPlannerBlock);
  }

  replaceTemplateBlocks(
    templateId: number,
    input: { blocks: PlannerActivityBlockDraft[]; dayWindow: PlannerDayWindowConfig },
  ): PlannerActivityBlock[] {
    const template = this.getTemplateById(templateId);
    if (!template) {
      throw new Error("Planner template not found");
    }

    const dayWindow = plannerDayWindowConfigSchema.parse(input.dayWindow);
    const blocks = input.blocks.map((block) => plannerActivityBlockDraftSchema.parse(block));

    if (!plannerBlocksFitDayWindow(blocks, dayWindow)) {
      throw new Error("Planner blocks must fit within the configured day window");
    }

    const conflict = findPlannerBlockConflict(blocks);
    if (conflict) {
      throw new Error("Planner activities cannot overlap within the same user column");
    }

    const knownUserIds = new Set(this.listUsers().map((user) => user.id));
    for (const block of blocks) {
      if (!knownUserIds.has(block.userId)) {
        throw new Error("Planner block references an unknown user");
      }
    }

    const transaction = this.db.transaction(() => {
      this.db
        .prepare("DELETE FROM planner_template_blocks WHERE template_id = @templateId")
        .run({ templateId });

      const insertStatement = this.db.prepare(
        `
        INSERT INTO planner_template_blocks (
          template_id,
          user_id,
          name,
          colour,
          notes,
          start_time,
          end_time
        )
        VALUES (
          @templateId,
          @userId,
          @name,
          @colour,
          @notes,
          @startTime,
          @endTime
        )
        `,
      );

      for (const block of blocks) {
        insertStatement.run({
          templateId,
          userId: block.userId,
          name: block.name,
          colour: block.colour,
          notes: block.notes ?? null,
          startTime: block.startTime,
          endTime: block.endTime,
        });
      }

      this.db
        .prepare(
          `
          UPDATE planner_templates
          SET updated_at = CURRENT_TIMESTAMP
          WHERE id = @templateId
          `,
        )
        .run({ templateId });
    });

    transaction();
    return this.listTemplateBlocks(templateId);
  }

  listAssignments(): PlannerDateAssignment[] {
    const rows = this.db
      .prepare<[], PlannerAssignmentRow>(
        `
        SELECT
          planner_date_assignments.assignment_date,
          planner_date_assignments.template_id,
          planner_date_assignments.created_at,
          planner_date_assignments.updated_at,
          planner_templates.name AS template_name
        FROM planner_date_assignments
        INNER JOIN planner_templates ON planner_templates.id = planner_date_assignments.template_id
        ORDER BY planner_date_assignments.assignment_date ASC
        `,
      )
      .all();
    return rows.map(toPlannerAssignment);
  }

  getAssignment(date: string): PlannerDateAssignment | null {
    const row = this.db
      .prepare<{ date: string }, PlannerAssignmentRow>(
        `
        SELECT
          planner_date_assignments.assignment_date,
          planner_date_assignments.template_id,
          planner_date_assignments.created_at,
          planner_date_assignments.updated_at,
          planner_templates.name AS template_name
        FROM planner_date_assignments
        INNER JOIN planner_templates ON planner_templates.id = planner_date_assignments.template_id
        WHERE planner_date_assignments.assignment_date = @date
        `,
      )
      .get({ date });
    return row ? toPlannerAssignment(row) : null;
  }

  upsertAssignment(input: { date: string; templateId: number }): PlannerDateAssignment {
    if (!this.getTemplateById(input.templateId)) {
      throw new Error("Planner template not found");
    }

    this.db
      .prepare(
        `
        INSERT INTO planner_date_assignments (assignment_date, template_id)
        VALUES (@date, @templateId)
        ON CONFLICT(assignment_date)
        DO UPDATE SET template_id = excluded.template_id, updated_at = CURRENT_TIMESTAMP
        `,
      )
      .run({
        date: input.date,
        templateId: input.templateId,
      });

    const assignment = this.getAssignment(input.date);
    if (!assignment) {
      throw new Error("Failed to save planner date assignment");
    }

    return assignment;
  }

  deleteAssignment(date: string): boolean {
    const result = this.db
      .prepare("DELETE FROM planner_date_assignments WHERE assignment_date = @date")
      .run({ date });
    return result.changes > 0;
  }

  listTemplateDetails(): PlannerTemplateDetail[] {
    const blocksByTemplateId = new Map<number, PlannerActivityBlock[]>();
    const blockRows = this.db
      .prepare<[], PlannerBlockRow>(
        `
        SELECT *
        FROM planner_template_blocks
        ORDER BY template_id ASC, start_time ASC, end_time ASC, id ASC
        `,
      )
      .all();

    for (const row of blockRows) {
      const existing = blocksByTemplateId.get(row.template_id) ?? [];
      existing.push(toPlannerBlock(row));
      blocksByTemplateId.set(row.template_id, existing);
    }

    return this.listTemplates().map((template) =>
      plannerTemplateDetailSchema.parse({
        ...template,
        blocks: blocksByTemplateId.get(template.id) ?? [],
      }),
    );
  }

  getDashboard(input: {
    siteToday: string;
    dayWindow: PlannerDayWindowConfig;
  }): PlannerDashboardResponse {
    return plannerDashboardResponseSchema.parse({
      siteToday: input.siteToday,
      dayWindow: input.dayWindow,
      users: this.listUsers(),
      templates: this.listTemplateDetails(),
      assignments: this.listAssignments(),
    });
  }

  getTodayPlan(input: {
    siteDate: string;
    dayWindow: PlannerDayWindowConfig;
  }): PlannerTodayResponse {
    const dayOfWeek = plannerDateToDayOfWeek(input.siteDate);
    const template =
      this.listTemplates().find((entry) => entry.repeatDays.includes(dayOfWeek)) ?? null;
    const blocks = template ? this.listTemplateBlocks(template.id) : [];

    return plannerTodayResponseSchema.parse({
      generatedAt: new Date().toISOString(),
      siteDate: input.siteDate,
      dayWindow: input.dayWindow,
      users: this.listUsers(),
      template,
      blocks,
    });
  }
}
