import type Database from "better-sqlite3";

interface ModuleStateRow {
  value: string;
}

const escapeSqlLikePattern = (value: string): string =>
  value.replace(/[\\%_]/g, (match) => `\\${match}`);

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

  deleteExpiredStatesByPrefix(prefix: string, maxAgeMs: number): number {
    const trimmedPrefix = prefix.trim();
    if (!trimmedPrefix || !Number.isFinite(maxAgeMs) || maxAgeMs <= 0) {
      return 0;
    }

    const maxAgeSeconds = Math.max(1, Math.floor(maxAgeMs / 1000));
    const result = this.db
      .prepare<{ keyPattern: string; maxAgeModifier: string }>(
        `
        DELETE FROM module_state
        WHERE key LIKE @keyPattern ESCAPE '\\'
          AND updated_at < datetime('now', @maxAgeModifier)
        `,
      )
      .run({
        keyPattern: `${escapeSqlLikePattern(trimmedPrefix)}%`,
        maxAgeModifier: `-${maxAgeSeconds} seconds`,
      });

    return result.changes;
  }
}
