import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createDatabase } from "../src/db";
import { ChoresRepository } from "../src/repositories/chores-repository";

const defaultPayoutConfig = {
  mode: "all-or-nothing" as const,
  oneOffBonusEnabled: true,
  paydayDayOfWeek: 6,
  siteTimezone: "Australia/Perth",
};

const toLocalIsoDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

test("daily chore completions do not carry into the next day", () => {
  const directory = mkdtempSync(join(tmpdir(), "hearth-chores-repository-"));
  const db = createDatabase(join(directory, "hearth.sqlite"));
  const repository = new ChoresRepository(db);

  try {
    const member = repository.createMember({
      name: "Alex",
      avatarUrl: null,
      weeklyAllowance: 10,
    });
    const chore = repository.createChore({
      name: "Dishes",
      memberId: member.id,
      schedule: { type: "daily" },
      valueAmount: null,
      active: true,
    });

    const today = toLocalIsoDate(new Date());
    const tomorrow = toLocalIsoDate(addDays(new Date(), 1));

    repository.setCompletion({
      choreId: chore.id,
      date: today,
      completed: true,
    });

    const todayBoard = repository.getBoard({
      startDate: today,
      days: 1,
      enableMoneyTracking: true,
      payoutConfig: defaultPayoutConfig,
    });
    const tomorrowBoard = repository.getBoard({
      startDate: tomorrow,
      days: 1,
      enableMoneyTracking: true,
      payoutConfig: defaultPayoutConfig,
    });

    assert.equal(todayBoard.board[0]?.items[0]?.completed, true);
    assert.equal(tomorrowBoard.board[0]?.items[0]?.completed, false);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("recurring chores only appear from their explicit startsOn date", () => {
  const directory = mkdtempSync(join(tmpdir(), "hearth-chores-repository-"));
  const db = createDatabase(join(directory, "hearth.sqlite"));
  const repository = new ChoresRepository(db);

  try {
    const member = repository.createMember({
      name: "Alex",
      avatarUrl: null,
      weeklyAllowance: 10,
    });
    const chore = repository.createChore({
      name: "Vacuum",
      memberId: member.id,
      schedule: { type: "daily" },
      startsOn: "2026-03-11",
      valueAmount: null,
      active: true,
      siteTimezone: defaultPayoutConfig.siteTimezone,
    });

    const beforeBoard = repository.getBoard({
      startDate: "2026-03-10",
      days: 1,
      enableMoneyTracking: true,
      payoutConfig: defaultPayoutConfig,
      siteTimezone: defaultPayoutConfig.siteTimezone,
    });
    const startBoard = repository.getBoard({
      startDate: "2026-03-11",
      days: 1,
      enableMoneyTracking: true,
      payoutConfig: defaultPayoutConfig,
      siteTimezone: defaultPayoutConfig.siteTimezone,
    });

    assert.equal(chore.startsOn, "2026-03-11");
    assert.equal(beforeBoard.board[0]?.items.length, 0);
    assert.equal(startBoard.board[0]?.items[0]?.choreId, chore.id);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
