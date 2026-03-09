import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { createDatabase } from "../src/db.js";
import { SettingsRepository } from "../src/repositories/settings-repository.js";

test("site time config falls back to legacy chores timezone before migration", () => {
  const directory = mkdtempSync(join(tmpdir(), "hearth-site-time-settings-"));
  const filePath = join(directory, "hearth.sqlite");
  const rawDb = new Database(filePath);

  try {
    rawDb.exec(`
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    rawDb
      .prepare(
        `
        INSERT INTO settings (key, value)
        VALUES (?, ?)
        `,
      )
      .run(
        "chores_payout_config",
        JSON.stringify({
          mode: "all-or-nothing",
          oneOffBonusEnabled: true,
          paydayDayOfWeek: 6,
          siteTimezone: "Australia/Perth",
        }),
      );
  } finally {
    rawDb.close();
  }

  const db = createDatabase(filePath);
  const repository = new SettingsRepository(db);

  try {
    assert.equal(repository.getSiteTimeConfig().siteTimezone, "Australia/Perth");
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("site time config is shared across chores settings", () => {
  const directory = mkdtempSync(join(tmpdir(), "hearth-site-time-settings-"));
  const db = createDatabase(join(directory, "hearth.sqlite"));
  const repository = new SettingsRepository(db);

  try {
    repository.setChoresPayoutConfig({
      mode: "all-or-nothing",
      oneOffBonusEnabled: true,
      paydayDayOfWeek: 6,
      siteTimezone: "Australia/Perth",
    });

    assert.equal(repository.getSiteTimeConfig().siteTimezone, "Australia/Perth");

    repository.setSiteTimeConfig({
      siteTimezone: "America/Chicago",
    });

    assert.equal(repository.getChoresPayoutConfig().siteTimezone, "America/Chicago");
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
