import {
  choreCompletionSchema,
  choreMemberSchema,
  choreRecordSchema,
  choreScheduleSchema,
  choresBoardResponseSchema,
  choresPayoutConfigSchema,
  type ChoreCompletion,
  type ChoreMember,
  type ChoreRecord,
  type ChoreSchedule,
  type ChoresBoardResponse,
  type ChoresPayoutConfig,
} from "@hearth/shared";
import type Database from "better-sqlite3";

interface MemberRow {
  id: number;
  name: string;
  avatar_url: string | null;
  weekly_allowance: number;
  created_at: string;
  updated_at: string;
}

interface ChoreRow {
  id: number;
  name: string;
  member_id: number;
  schedule_json: string;
  value_amount: number | null;
  active: number;
  created_at: string;
  updated_at: string;
}

interface CompletionRow {
  id: number;
  chore_id: number;
  completion_date: string;
  value_amount: number | null;
  created_at: string;
  updated_at: string;
}

const toDateString = (date: Date): string => date.toISOString().slice(0, 10);

const parseDate = (date: string): Date => new Date(`${date}T00:00:00.000Z`);

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const toLocalDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseSqliteTimestampToLocalDateString = (timestamp: string): string => {
  const normalizedTimestamp = timestamp.includes("T")
    ? timestamp
    : timestamp.replace(" ", "T");
  const withTimezone = normalizedTimestamp.endsWith("Z")
    ? normalizedTimestamp
    : `${normalizedTimestamp}Z`;
  const parsed = new Date(withTimezone);

  if (Number.isNaN(parsed.getTime())) {
    return timestamp.slice(0, 10);
  }

  return toLocalDateString(parsed);
};

const startOfWeek = (dateString: string, paydayDayOfWeek: number): string => {
  const date = parseDate(dateString);
  const dayOfWeek = date.getUTCDay();
  const weekStartDayOfWeek = (paydayDayOfWeek + 1) % 7;
  const offsetFromStart = (dayOfWeek - weekStartDayOfWeek + 7) % 7;
  return toDateString(addDays(date, -offsetFromStart));
};

const isScheduledOnDate = (schedule: ChoreSchedule, date: string): boolean => {
  const dayOfWeek = parseDate(date).getUTCDay();

  switch (schedule.type) {
    case "one-off":
      return schedule.date === date;
    case "daily":
      return true;
    case "weekly":
      return schedule.dayOfWeek === dayOfWeek;
    case "specific-days":
      return schedule.days.includes(dayOfWeek);
    default:
      return false;
  }
};

const parseSchedule = (scheduleJson: string): ChoreSchedule => {
  try {
    return choreScheduleSchema.parse(JSON.parse(scheduleJson));
  } catch {
    return choreScheduleSchema.parse({ type: "daily" });
  }
};

const toMember = (row: MemberRow): ChoreMember =>
  choreMemberSchema.parse({
    id: row.id,
    name: row.name,
    avatarUrl: row.avatar_url,
    weeklyAllowance: row.weekly_allowance ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

const toChore = (row: ChoreRow): ChoreRecord =>
  choreRecordSchema.parse({
    id: row.id,
    name: row.name,
    memberId: row.member_id,
    schedule: parseSchedule(row.schedule_json),
    valueAmount: row.value_amount,
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

const toCompletion = (row: CompletionRow): ChoreCompletion =>
  choreCompletionSchema.parse({
    id: row.id,
    choreId: row.chore_id,
    date: row.completion_date,
    valueAmount: row.value_amount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

export class ChoresRepository {
  constructor(private readonly db: Database.Database) {}

  listMembers(): ChoreMember[] {
    const rows = this.db
      .prepare<[], MemberRow>("SELECT * FROM members ORDER BY name COLLATE NOCASE ASC")
      .all();
    return rows.map(toMember);
  }

  createMember(input: {
    name: string;
    avatarUrl: string | null;
    weeklyAllowance: number;
  }): ChoreMember {
    const result = this.db
      .prepare(
        `
        INSERT INTO members (name, avatar_url, weekly_allowance)
        VALUES (@name, @avatarUrl, @weeklyAllowance)
        `,
      )
      .run({
        name: input.name.trim(),
        avatarUrl: input.avatarUrl?.trim() || null,
        weeklyAllowance: Math.max(0, input.weeklyAllowance),
      });

    const created = this.getMemberById(Number(result.lastInsertRowid));
    if (!created) {
      throw new Error("Failed to create member");
    }

    return created;
  }

  updateMember(
    id: number,
    changes: { name?: string; avatarUrl?: string | null; weeklyAllowance?: number },
  ): ChoreMember | null {
    const existing = this.getMemberById(id);
    if (!existing) {
      return null;
    }

    const nextName = changes.name !== undefined ? changes.name.trim() : existing.name;
    const nextAvatarUrl =
      changes.avatarUrl !== undefined ? changes.avatarUrl?.trim() || null : existing.avatarUrl;
    const nextWeeklyAllowance =
      changes.weeklyAllowance !== undefined
        ? Math.max(0, changes.weeklyAllowance)
        : existing.weeklyAllowance;

    this.db
      .prepare(
        `
        UPDATE members
        SET name = @name,
            avatar_url = @avatarUrl,
            weekly_allowance = @weeklyAllowance,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = @id
        `,
      )
      .run({
        id,
        name: nextName,
        avatarUrl: nextAvatarUrl,
        weeklyAllowance: nextWeeklyAllowance,
      });

    return this.getMemberById(id);
  }

  deleteMember(id: number): boolean {
    const result = this.db
      .prepare("DELETE FROM members WHERE id = @id")
      .run({ id });
    return result.changes > 0;
  }

  getMemberById(id: number): ChoreMember | null {
    const row = this.db
      .prepare<{ id: number }, MemberRow>("SELECT * FROM members WHERE id = @id")
      .get({ id });

    return row ? toMember(row) : null;
  }

  listChores(): ChoreRecord[] {
    const rows = this.db
      .prepare<[], ChoreRow>("SELECT * FROM chores ORDER BY id ASC")
      .all();
    return rows.map(toChore);
  }

  getChoreById(id: number): ChoreRecord | null {
    const row = this.db
      .prepare<{ id: number }, ChoreRow>("SELECT * FROM chores WHERE id = @id")
      .get({ id });

    return row ? toChore(row) : null;
  }

  createChore(input: {
    name: string;
    memberId: number;
    schedule: ChoreSchedule;
    valueAmount: number | null;
    active: boolean;
  }): ChoreRecord {
    const result = this.db
      .prepare(
        `
        INSERT INTO chores (name, member_id, schedule_json, value_amount, active)
        VALUES (@name, @memberId, @scheduleJson, @valueAmount, @active)
        `,
      )
      .run({
        name: input.name.trim(),
        memberId: input.memberId,
        scheduleJson: JSON.stringify(input.schedule),
        valueAmount: input.valueAmount,
        active: input.active ? 1 : 0,
      });

    const created = this.getChoreById(Number(result.lastInsertRowid));
    if (!created) {
      throw new Error("Failed to create chore");
    }

    return created;
  }

  updateChore(
    id: number,
    changes: {
      name?: string;
      memberId?: number;
      schedule?: ChoreSchedule;
      valueAmount?: number | null;
      active?: boolean;
    },
  ): ChoreRecord | null {
    const existing = this.getChoreById(id);
    if (!existing) {
      return null;
    }

    const next = {
      name: changes.name !== undefined ? changes.name.trim() : existing.name,
      memberId: changes.memberId ?? existing.memberId,
      schedule: changes.schedule ?? existing.schedule,
      valueAmount:
        changes.valueAmount !== undefined ? changes.valueAmount : existing.valueAmount,
      active: changes.active ?? existing.active,
    };

    this.db
      .prepare(
        `
        UPDATE chores
        SET name = @name,
            member_id = @memberId,
            schedule_json = @scheduleJson,
            value_amount = @valueAmount,
            active = @active,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = @id
        `,
      )
      .run({
        id,
        name: next.name,
        memberId: next.memberId,
        scheduleJson: JSON.stringify(next.schedule),
        valueAmount: next.valueAmount,
        active: next.active ? 1 : 0,
      });

    return this.getChoreById(id);
  }

  deleteChore(id: number): boolean {
    const result = this.db
      .prepare("DELETE FROM chores WHERE id = @id")
      .run({ id });
    return result.changes > 0;
  }

  setCompletion(input: { choreId: number; date: string; completed: boolean }): void {
    if (!input.completed) {
      this.db
        .prepare(
          `
          DELETE FROM chore_completions
          WHERE chore_id = @choreId
            AND completion_date = @date
          `,
        )
        .run({
          choreId: input.choreId,
          date: input.date,
        });
      return;
    }

    const chore = this.getChoreById(input.choreId);
    if (!chore) {
      throw new Error("Chore not found");
    }

    const choreStartDate = parseSqliteTimestampToLocalDateString(chore.createdAt);
    if (input.date < choreStartDate) {
      throw new Error("Cannot complete a chore before its start date");
    }

    this.db
      .prepare(
        `
        INSERT INTO chore_completions (chore_id, completion_date, value_amount, created_at, updated_at)
        VALUES (@choreId, @date, @valueAmount, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(chore_id, completion_date)
        DO UPDATE SET value_amount = excluded.value_amount, updated_at = CURRENT_TIMESTAMP
        `,
      )
      .run({
        choreId: input.choreId,
        date: input.date,
        valueAmount: chore.valueAmount,
      });
  }

  listCompletionsInRange(startDate: string, endDate: string): ChoreCompletion[] {
    const rows = this.db
      .prepare<{ startDate: string; endDate: string }, CompletionRow>(
        `
        SELECT * FROM chore_completions
        WHERE completion_date >= @startDate
          AND completion_date <= @endDate
        ORDER BY completion_date ASC
        `,
      )
      .all({ startDate, endDate });

    return rows.map(toCompletion);
  }

  getBoard(input: {
    startDate: string;
    days: number;
    enableMoneyTracking: boolean;
    payoutConfig: ChoresPayoutConfig;
  }): ChoresBoardResponse {
    const payoutConfig = choresPayoutConfigSchema.parse(input.payoutConfig);
    const members = this.listMembers();
    const chores = this.listChores().filter((chore) => chore.active);
    const choreStartDateById = new Map(
      chores.map((chore) => [chore.id, parseSqliteTimestampToLocalDateString(chore.createdAt)]),
    );
    const memberById = new Map(members.map((member) => [member.id, member]));

    const rangeStart = input.startDate;
    const rangeEnd = toDateString(addDays(parseDate(input.startDate), input.days - 1));
    const completions = this.listCompletionsInRange(rangeStart, rangeEnd);
    const completionKey = (choreId: number, date: string): string => `${choreId}:${date}`;
    const completionMap = new Map(
      completions.map((completion) => [completionKey(completion.choreId, completion.date), completion]),
    );

    const board = Array.from({ length: input.days }, (_entry, dayOffset) => {
      const date = toDateString(addDays(parseDate(input.startDate), dayOffset));
      const items = chores
        .filter((chore) => {
          const choreStartDate = choreStartDateById.get(chore.id) ?? date;
          return date >= choreStartDate && isScheduledOnDate(chore.schedule, date);
        })
        .map((chore) => {
          const member = memberById.get(chore.memberId);
          const completion = completionMap.get(completionKey(chore.id, date));

          return {
            date,
            choreId: chore.id,
            choreName: chore.name,
            memberId: chore.memberId,
            memberName: member?.name ?? "Unknown member",
            memberAvatarUrl: member?.avatarUrl ?? null,
            schedule: chore.schedule,
            valueAmount: chore.valueAmount,
            completed: Boolean(completion),
          };
        });

      return {
        date,
        items,
      };
    });

    const todayItems = board[0]?.items ?? [];
    const todayCompleted = todayItems.filter((item) => item.completed).length;
    const dailyCompletionRate = todayItems.length === 0 ? 0 : todayCompleted / todayItems.length;

    const weekStart = startOfWeek(input.startDate, payoutConfig.paydayDayOfWeek);
    const weekEnd = toDateString(addDays(parseDate(weekStart), 6));
    const weeklyCompletions = this.listCompletionsInRange(weekStart, weekEnd);
    const weeklyCompletionSet = new Set(
      weeklyCompletions.map((completion) => completionKey(completion.choreId, completion.date)),
    );

    const weeklyByMemberMap = new Map<
      number,
      {
        memberId: number;
        memberName: string;
        memberAvatarUrl: string | null;
        completedCount: number;
        totalValue: number;
        recurringScheduledCount: number;
        recurringCompletedCount: number;
        completionRatio: number;
        baseAllowance: number;
        basePayout: number;
        bonusPayout: number;
        payoutTotal: number;
      }
    >();

    for (const member of members) {
      weeklyByMemberMap.set(member.id, {
        memberId: member.id,
        memberName: member.name,
        memberAvatarUrl: member.avatarUrl,
        completedCount: 0,
        totalValue: 0,
        recurringScheduledCount: 0,
        recurringCompletedCount: 0,
        completionRatio: 0,
        baseAllowance: member.weeklyAllowance,
        basePayout: 0,
        bonusPayout: 0,
        payoutTotal: 0,
      });
    }

    const datesInWeek = Array.from({ length: 7 }, (_entry, index) =>
      toDateString(addDays(parseDate(weekStart), index)),
    );

    for (const date of datesInWeek) {
      for (const chore of chores) {
        const choreStartDate = choreStartDateById.get(chore.id) ?? date;
        if (date < choreStartDate || !isScheduledOnDate(chore.schedule, date)) {
          continue;
        }

        const member = memberById.get(chore.memberId);
        const current = weeklyByMemberMap.get(chore.memberId) ?? {
          memberId: chore.memberId,
          memberName: member?.name ?? "Unknown member",
          memberAvatarUrl: member?.avatarUrl ?? null,
          completedCount: 0,
          totalValue: 0,
          recurringScheduledCount: 0,
          recurringCompletedCount: 0,
          completionRatio: 0,
          baseAllowance: member?.weeklyAllowance ?? 0,
          basePayout: 0,
          bonusPayout: 0,
          payoutTotal: 0,
        };

        const isOneOff = chore.schedule.type === "one-off";
        const isCompleted = weeklyCompletionSet.has(completionKey(chore.id, date));

        if (!isOneOff) {
          current.recurringScheduledCount += 1;
        }

        if (!isCompleted) {
          weeklyByMemberMap.set(chore.memberId, current);
          continue;
        }

        current.completedCount += 1;

        if (!isOneOff) {
          current.recurringCompletedCount += 1;
        }

        if (
          isOneOff &&
          input.enableMoneyTracking &&
          payoutConfig.oneOffBonusEnabled
        ) {
          current.bonusPayout += chore.valueAmount ?? 0;
        }

        weeklyByMemberMap.set(chore.memberId, current);
      }
    }

    const weeklyByMember = Array.from(weeklyByMemberMap.values())
      .map((member) => {
        const completionRatio =
          member.recurringScheduledCount === 0
            ? 1
            : member.recurringCompletedCount / member.recurringScheduledCount;

        const basePayout = input.enableMoneyTracking
          ? payoutConfig.mode === "all-or-nothing"
            ? completionRatio >= 1
              ? member.baseAllowance
              : 0
            : member.baseAllowance * completionRatio
          : 0;

        const payoutTotal = basePayout + (input.enableMoneyTracking ? member.bonusPayout : 0);

        return {
          ...member,
          completionRatio,
          basePayout,
          payoutTotal,
          totalValue: payoutTotal,
        };
      })
      .sort((left, right) => left.memberName.localeCompare(right.memberName));

    const weeklyCompletedCount = weeklyByMember.reduce(
      (total, member) => total + member.completedCount,
      0,
    );
    const weeklyTotalValue = weeklyByMember.reduce(
      (total, member) => total + member.totalValue,
      0,
    );

    return choresBoardResponseSchema.parse({
      generatedAt: new Date().toISOString(),
      startDate: input.startDate,
      days: input.days,
      payoutConfig,
      members,
      chores,
      board,
      stats: {
        dailyCompletionRate,
        weeklyCompletedCount,
        weeklyTotalValue,
        weeklyByMember,
      },
    });
  }
}
