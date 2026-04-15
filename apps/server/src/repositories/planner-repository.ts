import {
  addPlannerUtcDays,
  plannerActivityCompletionSchema,
  findPlannerBlockConflict,
  getPlannerWeekEndDate,
  getPlannerWeekStartDate,
  getPreviousPlannerWeekStartDate,
  normalizePlannerRepeatDays,
  plannerDateToDayOfWeek,
  plannerActivityBlockDraftSchema,
  plannerActivityBlockSchema,
  plannerSummaryArchiveListResponseSchema,
  plannerSummaryArchiveSchema,
  plannerDashboardResponseSchema,
  plannerDateAssignmentSchema,
  plannerDayWindowConfigSchema,
  plannerTemplateDetailSchema,
  plannerTemplateSchema,
  plannerTodayResponseSchema,
  plannerWeeklyBlockSummarySchema,
  plannerWeekSummaryResponseSchema,
  plannerUserSchema,
  plannerBlocksFitDayWindow,
  type PlannerActivityBlock,
  type PlannerActivityBlockDraft,
  type PlannerActivityCompletion,
  type PlannerSummaryArchive,
  type PlannerSummaryArchiveListResponse,
  type PlannerDashboardResponse,
  type PlannerDateAssignment,
  type PlannerDayWindowConfig,
  type PlannerTemplate,
  type PlannerTemplateDetail,
  type PlannerTodayResponse,
  type PlannerWeekSummaryResponse,
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

interface PlannerActivityCompletionRow {
  id: number;
  block_id: number;
  completion_date: string;
  completed_at: string;
  created_at: string;
  updated_at: string;
}

interface PlannerSnapshotRow {
  snapshot_date: string;
  week_start_date: string;
  week_end_date: string;
  template_id: number | null;
  template_name: string | null;
  created_at: string;
  updated_at: string;
}

interface PlannerSnapshotBlockRow {
  id: number;
  snapshot_date: string;
  template_id: number | null;
  source_block_id: number | null;
  user_id: number;
  user_name: string;
  name: string;
  colour: string;
  notes: string | null;
  start_time: string;
  end_time: string;
  created_at: string;
  updated_at: string;
}

interface PlannerArchiveRow {
  week_start_date: string;
  week_end_date: string;
  generated_at: string;
  pdf_relative_path: string | null;
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

const toPlannerActivityCompletion = (
  row: PlannerActivityCompletionRow,
): PlannerActivityCompletion =>
  plannerActivityCompletionSchema.parse({
    blockId: row.block_id,
    date: row.completion_date,
    completedAt: row.completed_at,
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
    const hasHistory = this.db
      .prepare<{ id: number }, { found: number }>(
        `
        SELECT 1 AS found
        FROM planner_daily_plan_snapshot_blocks
        WHERE user_id = @id
        LIMIT 1
        `,
      )
      .get({ id });

    if (hasHistory) {
      throw new Error("Child has School history and cannot be deleted");
    }

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

  private resolveTemplateForDate(siteDate: string): PlannerTemplate | null {
    const dayOfWeek = plannerDateToDayOfWeek(siteDate);
    const assignment = this.getAssignment(siteDate);
    const assignedTemplate = assignment ? this.getTemplateById(assignment.templateId) : null;
    return (
      assignedTemplate ??
      this.listTemplates().find((entry) => entry.repeatDays.includes(dayOfWeek)) ??
      null
    );
  }

  private getSnapshot(siteDate: string): PlannerSnapshotRow | null {
    return (
      this.db
        .prepare<{ siteDate: string }, PlannerSnapshotRow>(
          `
          SELECT *
          FROM planner_daily_plan_snapshots
          WHERE snapshot_date = @siteDate
          `,
        )
        .get({ siteDate }) ?? null
    );
  }

  private listSnapshotBlocks(siteDate: string): PlannerActivityBlock[] {
    const rows = this.db
      .prepare<{ siteDate: string }, PlannerSnapshotBlockRow>(
        `
        SELECT *
        FROM planner_daily_plan_snapshot_blocks
        WHERE snapshot_date = @siteDate
        ORDER BY start_time ASC, end_time ASC, id ASC
        `,
      )
      .all({ siteDate });

    return rows.map((row) =>
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
      }),
    );
  }

  private listLegacyActivityCompletions(date: string): PlannerActivityCompletion[] {
    const rows = this.db
      .prepare<{ date: string }, PlannerActivityCompletionRow>(
        `
        SELECT *
        FROM planner_activity_completions
        WHERE completion_date = @date
        ORDER BY block_id ASC, completed_at DESC, id ASC
        `,
      )
      .all({ date });
    return rows.map(toPlannerActivityCompletion);
  }

  listActivityCompletions(date: string): PlannerActivityCompletion[] {
    const rows = this.db
      .prepare<{ date: string }, PlannerActivityCompletionRow>(
        `
        SELECT
          id,
          snapshot_block_id AS block_id,
          completion_date,
          completed_at,
          created_at,
          updated_at
        FROM planner_snapshot_activity_completions
        WHERE completion_date = @date
        ORDER BY snapshot_block_id ASC, completed_at DESC, id ASC
        `,
      )
      .all({ date });
    return rows.map(toPlannerActivityCompletion);
  }

  private listActivityCompletionsInRange(
    startDate: string,
    endDate: string,
  ): PlannerActivityCompletion[] {
    const rows = this.db
      .prepare<{ startDate: string; endDate: string }, PlannerActivityCompletionRow>(
        `
        SELECT
          id,
          snapshot_block_id AS block_id,
          completion_date,
          completed_at,
          created_at,
          updated_at
        FROM planner_snapshot_activity_completions
        WHERE completion_date >= @startDate
          AND completion_date <= @endDate
        ORDER BY completion_date ASC, snapshot_block_id ASC, completed_at DESC, id ASC
        `,
      )
      .all({ startDate, endDate });
    return rows.map(toPlannerActivityCompletion);
  }

  private ensureDailySnapshot(input: {
    siteDate: string;
    dayWindow: PlannerDayWindowConfig;
  }): PlannerSnapshotRow {
    const existing = this.getSnapshot(input.siteDate);
    if (existing) {
      return existing;
    }

    const template = this.resolveTemplateForDate(input.siteDate);
    const usersById = new Map(this.listUsers().map((user) => [user.id, user]));
    const blocks = template ? this.listTemplateBlocks(template.id) : [];
    const weekStartDate = getPlannerWeekStartDate(input.siteDate);
    const weekEndDate = getPlannerWeekEndDate(input.siteDate);

    const transaction = this.db.transaction(() => {
      this.db
        .prepare(
          `
          INSERT INTO planner_daily_plan_snapshots (
            snapshot_date,
            week_start_date,
            week_end_date,
            template_id,
            template_name
          )
          VALUES (
            @siteDate,
            @weekStartDate,
            @weekEndDate,
            @templateId,
            @templateName
          )
          `,
        )
        .run({
          siteDate: input.siteDate,
          weekStartDate,
          weekEndDate,
          templateId: template?.id ?? null,
          templateName: template?.name ?? null,
        });

      if (template) {
        const insertBlock = this.db.prepare(
          `
          INSERT INTO planner_daily_plan_snapshot_blocks (
            snapshot_date,
            template_id,
            source_block_id,
            user_id,
            user_name,
            name,
            colour,
            notes,
            start_time,
            end_time
          )
          VALUES (
            @snapshotDate,
            @templateId,
            @sourceBlockId,
            @userId,
            @userName,
            @name,
            @colour,
            @notes,
            @startTime,
            @endTime
          )
          `,
        );

        for (const block of blocks) {
          insertBlock.run({
            snapshotDate: input.siteDate,
            templateId: template.id,
            sourceBlockId: block.id,
            userId: block.userId,
            userName: usersById.get(block.userId)?.name ?? `Child ${block.userId}`,
            name: block.name,
            colour: block.colour,
            notes: block.notes ?? null,
            startTime: block.startTime,
            endTime: block.endTime,
          });
        }
      }

      const snapshotBlocks = this.db
        .prepare(
          `
          SELECT id, source_block_id
          FROM planner_daily_plan_snapshot_blocks
          WHERE snapshot_date = @siteDate
            AND source_block_id IS NOT NULL
          `,
        )
        .all({ siteDate: input.siteDate }) as Array<{ id: number; source_block_id: number }>;
      const snapshotBlockIdBySourceBlockId = new Map<number, number>(
        snapshotBlocks.map((row) => [row.source_block_id, row.id]),
      );
      const insertCompletion = this.db.prepare(
        `
        INSERT INTO planner_snapshot_activity_completions (
          snapshot_block_id,
          completion_date,
          completed_at
        )
        VALUES (
          @snapshotBlockId,
          @date,
          @completedAt
        )
        ON CONFLICT(snapshot_block_id, completion_date)
        DO UPDATE SET completed_at = excluded.completed_at, updated_at = CURRENT_TIMESTAMP
        `,
      );

      for (const completion of this.listLegacyActivityCompletions(input.siteDate)) {
        const snapshotBlockId = snapshotBlockIdBySourceBlockId.get(completion.blockId);
        if (!snapshotBlockId) {
          continue;
        }

        insertCompletion.run({
          snapshotBlockId,
          date: completion.date,
          completedAt: completion.completedAt,
        });
      }
    });

    transaction();
    const snapshot = this.getSnapshot(input.siteDate);
    if (!snapshot) {
      throw new Error("Failed to create planner day snapshot");
    }

    return snapshot;
  }

  freezeElapsedDatesThrough(input: { siteDate: string; dayWindow: PlannerDayWindowConfig }): void {
    const weekStartDate = getPlannerWeekStartDate(input.siteDate);
    const normalizedEndDate = input.siteDate;

    for (let date = weekStartDate; date <= normalizedEndDate; date = addPlannerUtcDays(date, 1)) {
      this.ensureDailySnapshot({
        siteDate: date,
        dayWindow: input.dayWindow,
      });
    }
  }

  private getLatestArchivedWeekStartDate(): string | null {
    const row = this.db
      .prepare<[], { week_start_date: string | null }>(
        `
        SELECT week_start_date
        FROM planner_weekly_summary_archives
        ORDER BY week_start_date DESC
        LIMIT 1
        `,
      )
      .get();
    return row?.week_start_date ?? null;
  }

  private getEarliestSnapshotWeekStartDate(): string | null {
    const row = this.db
      .prepare<[], { week_start_date: string | null }>(
        `
        SELECT week_start_date
        FROM planner_daily_plan_snapshots
        ORDER BY week_start_date ASC
        LIMIT 1
        `,
      )
      .get();
    return row?.week_start_date ?? null;
  }

  freezeCompletedWeeksThrough(input: {
    siteDate: string;
    dayWindow: PlannerDayWindowConfig;
  }): PlannerSummaryArchiveListResponse {
    const currentWeekStartDate = getPlannerWeekStartDate(input.siteDate);
    const latestArchivedWeekStartDate = this.getLatestArchivedWeekStartDate();
    const earliestSnapshotWeekStartDate = this.getEarliestSnapshotWeekStartDate();
    let weekStartDate =
      latestArchivedWeekStartDate !== null
        ? addPlannerUtcDays(latestArchivedWeekStartDate, 7)
        : (earliestSnapshotWeekStartDate ?? getPreviousPlannerWeekStartDate(input.siteDate));

    while (weekStartDate < currentWeekStartDate) {
      const weekEndDate = getPlannerWeekEndDate(weekStartDate);
      for (let date = weekStartDate; date <= weekEndDate; date = addPlannerUtcDays(date, 1)) {
        this.ensureDailySnapshot({
          siteDate: date,
          dayWindow: input.dayWindow,
        });
      }
      this.ensureArchiveRecord(weekStartDate, weekEndDate);
      weekStartDate = addPlannerUtcDays(weekStartDate, 7);
    }

    return this.listSummaryArchives();
  }

  setActivityCompletion(input: {
    blockId: number;
    date: string;
    completed: boolean;
    dayWindow: PlannerDayWindowConfig;
  }): PlannerActivityCompletion[] {
    this.ensureDailySnapshot({
      siteDate: input.date,
      dayWindow: input.dayWindow,
    });

    const block = this.db
      .prepare<{ blockId: number; date: string }, PlannerSnapshotBlockRow>(
        `
        SELECT *
        FROM planner_daily_plan_snapshot_blocks
        WHERE id = @blockId
          AND snapshot_date = @date
        `,
      )
      .get({ blockId: input.blockId, date: input.date });

    if (!block) {
      throw new Error("Planner activity is not part of that school day");
    }

    if (input.completed) {
      this.db
        .prepare(
          `
          INSERT INTO planner_snapshot_activity_completions (
            snapshot_block_id,
            completion_date,
            completed_at
          )
          VALUES (@blockId, @date, CURRENT_TIMESTAMP)
          ON CONFLICT(snapshot_block_id, completion_date)
          DO UPDATE SET completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          `,
        )
        .run({
          blockId: input.blockId,
          date: input.date,
        });
    } else {
      this.db
        .prepare(
          `
          DELETE FROM planner_snapshot_activity_completions
          WHERE snapshot_block_id = @blockId
            AND completion_date = @date
          `,
        )
        .run({
          blockId: input.blockId,
          date: input.date,
        });
    }

    return this.listActivityCompletions(input.date);
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
    const snapshot = this.ensureDailySnapshot(input);
    const currentTemplate =
      snapshot.template_id !== null ? this.getTemplateById(snapshot.template_id) : null;
    const template =
      snapshot.template_id === null
        ? null
        : plannerTemplateSchema.parse({
            id: snapshot.template_id,
            name: snapshot.template_name ?? currentTemplate?.name ?? "School plan",
            repeatDays: currentTemplate?.repeatDays ?? [],
            createdAt: currentTemplate?.createdAt ?? snapshot.created_at,
            updatedAt: currentTemplate?.updatedAt ?? snapshot.updated_at,
          });
    const blocks = this.listSnapshotBlocks(input.siteDate);
    const completions = this.listActivityCompletions(input.siteDate);

    return plannerTodayResponseSchema.parse({
      generatedAt: new Date().toISOString(),
      siteDate: input.siteDate,
      dayWindow: input.dayWindow,
      users: this.listUsers(),
      template,
      blocks,
      completions,
    });
  }

  private ensureArchiveRecord(weekStartDate: string, weekEndDate: string): PlannerArchiveRow {
    const existing = this.db
      .prepare<{ weekStartDate: string }, PlannerArchiveRow>(
        `
        SELECT week_start_date, week_end_date, generated_at, pdf_relative_path
        FROM planner_weekly_summary_archives
        WHERE week_start_date = @weekStartDate
        `,
      )
      .get({ weekStartDate });

    if (existing) {
      return existing;
    }

    const generatedAt = new Date().toISOString();
    this.db
      .prepare(
        `
        INSERT INTO planner_weekly_summary_archives (
          week_start_date,
          week_end_date,
          generated_at,
          pdf_relative_path
        )
        VALUES (
          @weekStartDate,
          @weekEndDate,
          @generatedAt,
          NULL
        )
        `,
      )
      .run({
        weekStartDate,
        weekEndDate,
        generatedAt,
      });

    return this.db
      .prepare<{ weekStartDate: string }, PlannerArchiveRow>(
        `
        SELECT week_start_date, week_end_date, generated_at, pdf_relative_path
        FROM planner_weekly_summary_archives
        WHERE week_start_date = @weekStartDate
        `,
      )
      .get({ weekStartDate }) as PlannerArchiveRow;
  }

  listSummaryArchives(): PlannerSummaryArchiveListResponse {
    const rows = this.db
      .prepare<[], PlannerArchiveRow>(
        `
        SELECT week_start_date, week_end_date, generated_at, pdf_relative_path
        FROM planner_weekly_summary_archives
        ORDER BY week_start_date DESC
        `,
      )
      .all();

    return plannerSummaryArchiveListResponseSchema.parse({
      archives: rows.map((row) =>
        plannerSummaryArchiveSchema.parse({
          weekStartDate: row.week_start_date,
          weekEndDate: row.week_end_date,
          generatedAt: row.generated_at,
          pdfAvailable: Boolean(row.pdf_relative_path),
        }),
      ),
    });
  }

  getSummaryArchive(weekStartDate: string): PlannerSummaryArchive | null {
    const row = this.db
      .prepare<{ weekStartDate: string }, PlannerArchiveRow>(
        `
        SELECT week_start_date, week_end_date, generated_at, pdf_relative_path
        FROM planner_weekly_summary_archives
        WHERE week_start_date = @weekStartDate
        `,
      )
      .get({ weekStartDate });

    return row
      ? plannerSummaryArchiveSchema.parse({
          weekStartDate: row.week_start_date,
          weekEndDate: row.week_end_date,
          generatedAt: row.generated_at,
          pdfAvailable: Boolean(row.pdf_relative_path),
        })
      : null;
  }

  getSummaryArchivePdfRelativePath(weekStartDate: string): string | null {
    const row = this.db
      .prepare<{ weekStartDate: string }, { pdf_relative_path: string | null }>(
        `
        SELECT pdf_relative_path
        FROM planner_weekly_summary_archives
        WHERE week_start_date = @weekStartDate
        `,
      )
      .get({ weekStartDate });

    return row?.pdf_relative_path ?? null;
  }

  setSummaryArchivePdfRelativePath(weekStartDate: string, pdfRelativePath: string): void {
    this.db
      .prepare(
        `
        UPDATE planner_weekly_summary_archives
        SET pdf_relative_path = @pdfRelativePath,
            updated_at = CURRENT_TIMESTAMP
        WHERE week_start_date = @weekStartDate
        `,
      )
      .run({
        weekStartDate,
        pdfRelativePath,
      });
  }

  getLatestWeekSummary(input: {
    siteToday: string;
    dayWindow: PlannerDayWindowConfig;
  }): PlannerWeekSummaryResponse {
    this.freezeCompletedWeeksThrough({
      siteDate: input.siteToday,
      dayWindow: input.dayWindow,
    });
    const weekStartDate = getPreviousPlannerWeekStartDate(input.siteToday);
    return this.getWeekSummary({
      startDate: weekStartDate,
      days: 7,
      dayWindow: input.dayWindow,
    });
  }

  getWeekSummary(input: {
    startDate: string;
    days: number;
    dayWindow: PlannerDayWindowConfig;
  }): PlannerWeekSummaryResponse {
    const normalizedDays = Math.max(1, Math.min(31, Math.round(input.days)));
    const endDate = addPlannerUtcDays(input.startDate, normalizedDays - 1);
    const dates = Array.from({ length: normalizedDays }, (_, index) =>
      addPlannerUtcDays(input.startDate, index),
    );

    for (const date of dates) {
      this.ensureDailySnapshot({
        siteDate: date,
        dayWindow: input.dayWindow,
      });
    }

    const archive =
      normalizedDays === 7 ? this.ensureArchiveRecord(input.startDate, endDate) : null;
    const snapshots = this.db
      .prepare<{ startDate: string; endDate: string }, PlannerSnapshotRow>(
        `
        SELECT *
        FROM planner_daily_plan_snapshots
        WHERE snapshot_date >= @startDate
          AND snapshot_date <= @endDate
        ORDER BY snapshot_date ASC
        `,
      )
      .all({ startDate: input.startDate, endDate });
    const snapshotByDate = new Map<string, PlannerSnapshotRow>(
      snapshots.map((snapshot) => [snapshot.snapshot_date, snapshot]),
    );
    const blocksByDate = new Map<string, PlannerActivityBlock[]>();
    const blockRows = this.db
      .prepare<{ startDate: string; endDate: string }, PlannerSnapshotBlockRow>(
        `
        SELECT *
        FROM planner_daily_plan_snapshot_blocks
        WHERE snapshot_date >= @startDate
          AND snapshot_date <= @endDate
        ORDER BY snapshot_date ASC, start_time ASC, end_time ASC, id ASC
        `,
      )
      .all({ startDate: input.startDate, endDate });

    for (const row of blockRows) {
      const existing = blocksByDate.get(row.snapshot_date) ?? [];
      existing.push(
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
        }),
      );
      blocksByDate.set(row.snapshot_date, existing);
    }

    const completionsByDate = new Map<string, Set<number>>();
    for (const completion of this.listActivityCompletionsInRange(input.startDate, endDate)) {
      const existing = completionsByDate.get(completion.date) ?? new Set<number>();
      existing.add(completion.blockId);
      completionsByDate.set(completion.date, existing);
    }

    const summaryUsersById = new Map<number, PlannerUser>();
    for (const row of blockRows) {
      if (summaryUsersById.has(row.user_id)) {
        continue;
      }

      const liveUser = this.getUserById(row.user_id);
      summaryUsersById.set(
        row.user_id,
        plannerUserSchema.parse({
          id: row.user_id,
          name: row.user_name,
          createdAt: liveUser?.createdAt ?? row.created_at,
          updatedAt: liveUser?.updatedAt ?? row.updated_at,
        }),
      );
    }

    const days = dates.map((date) => {
      const snapshot = snapshotByDate.get(date) ?? null;
      const currentTemplate =
        snapshot?.template_id !== null && snapshot?.template_id !== undefined
          ? this.getTemplateById(snapshot.template_id)
          : null;
      const template =
        snapshot?.template_id === null || snapshot === null
          ? null
          : plannerTemplateSchema.parse({
              id: snapshot.template_id,
              name: snapshot.template_name ?? currentTemplate?.name ?? "School plan",
              repeatDays: currentTemplate?.repeatDays ?? [],
              createdAt: currentTemplate?.createdAt ?? snapshot.created_at,
              updatedAt: currentTemplate?.updatedAt ?? snapshot.updated_at,
            });
      const completedBlockIds = completionsByDate.get(date) ?? new Set<number>();
      const blocks = blocksByDate.get(date) ?? [];
      return plannerWeekSummaryResponseSchema.shape.days.element.parse({
        date,
        template,
        blocks: blocks.map((block) =>
          plannerWeeklyBlockSummarySchema.parse({
            ...block,
            completed: completedBlockIds.has(block.id),
          }),
        ),
      });
    });

    return plannerWeekSummaryResponseSchema.parse({
      generatedAt: archive?.generated_at ?? new Date().toISOString(),
      startDate: input.startDate,
      endDate,
      dayWindow: input.dayWindow,
      users: Array.from(summaryUsersById.values()).sort((left, right) => left.id - right.id),
      days,
    });
  }
}
