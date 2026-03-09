import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createDatabase } from "../src/db";
import { ChoresRepository } from "../src/repositories/chores-repository";

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
      payoutConfig: {
        mode: "all-or-nothing",
        oneOffBonusEnabled: true,
        paydayDayOfWeek: 6,
      },
    });
    const tomorrowBoard = repository.getBoard({
      startDate: tomorrow,
      days: 1,
      enableMoneyTracking: true,
      payoutConfig: {
        mode: "all-or-nothing",
        oneOffBonusEnabled: true,
        paydayDayOfWeek: 6,
      },
    });

    assert.equal(todayBoard.board[0]?.items[0]?.completed, true);
    assert.equal(tomorrowBoard.board[0]?.items[0]?.completed, false);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
