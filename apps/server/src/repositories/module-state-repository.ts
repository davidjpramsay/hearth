import type Database from "better-sqlite3";

interface ModuleStateRow {
  value: string;
}

export class ModuleStateRepository {
  constructor(private readonly db: Database.Database) {}

  getState<T>(key: string): T | null {
    const row = this.db
      .prepare<{ key: string }, ModuleStateRow>("SELECT value FROM module_state WHERE key = @key")
      .get({ key });

    if (!row) {
      return null;
    }

    try {
      return JSON.parse(row.value) as T;
    } catch {
      return null;
    }
  }

  setState(key: string, value: unknown): void {
    this.db
      .prepare(
        `
        INSERT INTO module_state (key, value, updated_at)
        VALUES (@key, @value, CURRENT_TIMESTAMP)
        ON CONFLICT(key)
        DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
        `,
      )
      .run({
        key,
        value: JSON.stringify(value),
      });
  }
}
