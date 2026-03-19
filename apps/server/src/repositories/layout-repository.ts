import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createEmptyLayoutConfig, validateLayoutConfig } from "@hearth/core";
import {
  layoutRecordSchema,
  type LayoutConfig,
  type LayoutRecord,
  type ModuleInstance,
} from "@hearth/shared";
import type Database from "better-sqlite3";

interface LayoutRow {
  id: number;
  name: string;
  config_json: string;
  active: number;
  version: number;
  created_at: string;
  updated_at: string;
}

interface LayoutConfigRow {
  id: number;
  config_json: string;
}

const CALENDAR_SOURCE_ENCRYPTED_PREFIX = "enc:v1:";
const CALENDAR_CIPHER_ALGORITHM = "aes-256-gcm";
const CALENDAR_CIPHER_NONCE_BYTES = 12;
const CALENDAR_CIPHER_TAG_BYTES = 16;

export class LayoutRepository {
  private readonly calendarKey: Buffer;

  constructor(
    private readonly db: Database.Database,
    options: { calendarEncryptionSecret: string },
  ) {
    this.calendarKey = createHash("sha256").update(options.calendarEncryptionSecret).digest();

    this.migrateStoredCalendarSources();
  }

  private encryptCalendarSource(source: string): string {
    if (source.startsWith(CALENDAR_SOURCE_ENCRYPTED_PREFIX)) {
      return source;
    }

    const nonce = randomBytes(CALENDAR_CIPHER_NONCE_BYTES);
    const cipher = createCipheriv(CALENDAR_CIPHER_ALGORITHM, this.calendarKey, nonce);
    const ciphertext = Buffer.concat([cipher.update(source, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const payload = Buffer.concat([nonce, authTag, ciphertext]).toString("base64url");
    return `${CALENDAR_SOURCE_ENCRYPTED_PREFIX}${payload}`;
  }

  private decryptCalendarSource(source: string): string | null {
    if (!source.startsWith(CALENDAR_SOURCE_ENCRYPTED_PREFIX)) {
      return source;
    }

    const encoded = source.slice(CALENDAR_SOURCE_ENCRYPTED_PREFIX.length);
    try {
      const payload = Buffer.from(encoded, "base64url");
      if (payload.length <= CALENDAR_CIPHER_NONCE_BYTES + CALENDAR_CIPHER_TAG_BYTES) {
        return null;
      }

      const nonce = payload.subarray(0, CALENDAR_CIPHER_NONCE_BYTES);
      const authTag = payload.subarray(
        CALENDAR_CIPHER_NONCE_BYTES,
        CALENDAR_CIPHER_NONCE_BYTES + CALENDAR_CIPHER_TAG_BYTES,
      );
      const ciphertext = payload.subarray(CALENDAR_CIPHER_NONCE_BYTES + CALENDAR_CIPHER_TAG_BYTES);
      const decipher = createDecipheriv(CALENDAR_CIPHER_ALGORITHM, this.calendarKey, nonce);
      decipher.setAuthTag(authTag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
        "utf8",
      );
      return plaintext;
    } catch {
      return null;
    }
  }

  private transformCalendarSources(
    config: LayoutConfig,
    direction: "encrypt" | "decrypt",
  ): LayoutConfig {
    const nextModules = config.modules.map((moduleInstance) => {
      if (moduleInstance.moduleId !== "calendar") {
        return moduleInstance;
      }

      const rawConfig = moduleInstance.config;
      if (!rawConfig || typeof rawConfig !== "object") {
        return moduleInstance;
      }

      const calendarSources = Array.isArray((rawConfig as { calendars?: unknown }).calendars)
        ? ((rawConfig as { calendars: unknown[] }).calendars as unknown[])
        : [];
      const transformedCalendars = calendarSources.map((entry) => {
        if (typeof entry !== "string") {
          return "";
        }

        const trimmedEntry = entry.trim();
        if (trimmedEntry.length === 0) {
          // Preserve blank rows so admin input fields stay visible during autosave.
          return "";
        }

        if (direction === "encrypt") {
          return this.encryptCalendarSource(trimmedEntry);
        }

        const decrypted = this.decryptCalendarSource(trimmedEntry);
        return decrypted && decrypted.trim().length > 0 ? decrypted.trim() : "";
      });

      return {
        ...moduleInstance,
        config: {
          ...rawConfig,
          calendars: transformedCalendars,
        },
      };
    });

    return {
      ...config,
      modules: nextModules,
    };
  }

  private parseLayoutConfig(configJson: string): LayoutConfig {
    try {
      const parsed = JSON.parse(configJson);
      const validated = validateLayoutConfig(parsed);
      return this.transformCalendarSources(validated, "decrypt");
    } catch {
      return createEmptyLayoutConfig();
    }
  }

  private serializeLayoutConfig(config: LayoutConfig): string {
    const validated = validateLayoutConfig(config);
    const encrypted = this.transformCalendarSources(validated, "encrypt");
    return JSON.stringify(encrypted);
  }

  private migrateStoredCalendarSources(): void {
    const rows = this.db.prepare<[], LayoutConfigRow>("SELECT id, config_json FROM layouts").all();
    const updates: Array<{ id: number; configJson: string }> = [];

    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.config_json);
        const validated = validateLayoutConfig(parsed);
        const encrypted = this.transformCalendarSources(validated, "encrypt");
        const nextConfigJson = JSON.stringify(encrypted);

        if (nextConfigJson !== row.config_json) {
          updates.push({
            id: row.id,
            configJson: nextConfigJson,
          });
        }
      } catch {
        // Leave malformed layout configs untouched.
      }
    }

    if (updates.length === 0) {
      return;
    }

    const transaction = this.db.transaction(
      (entries: Array<{ id: number; configJson: string }>) => {
        const updateStatement = this.db.prepare<{ id: number; configJson: string }>(
          `
        UPDATE layouts
        SET config_json = @configJson,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = @id
        `,
        );

        for (const entry of entries) {
          updateStatement.run(entry);
        }
      },
    );

    transaction(updates);
  }

  private toLayoutRecord(row: LayoutRow): LayoutRecord {
    return layoutRecordSchema.parse({
      id: row.id,
      name: row.name,
      config: this.parseLayoutConfig(row.config_json),
      active: row.active === 1,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  listLayouts(activeOnly = false): LayoutRecord[] {
    const sql = activeOnly
      ? "SELECT * FROM layouts WHERE active = 1 ORDER BY id ASC"
      : "SELECT * FROM layouts ORDER BY id ASC";

    const rows = this.db.prepare<[], LayoutRow>(sql).all();
    return rows.map((row) => this.toLayoutRecord(row));
  }

  getById(id: number): LayoutRecord | null {
    const row = this.db
      .prepare<{ id: number }, LayoutRow>("SELECT * FROM layouts WHERE id = @id")
      .get({ id });

    return row ? this.toLayoutRecord(row) : null;
  }

  getByName(name: string): LayoutRecord | null {
    const row = this.db
      .prepare<
        { name: string },
        LayoutRow
      >("SELECT * FROM layouts WHERE lower(name) = lower(@name) LIMIT 1")
      .get({ name });

    return row ? this.toLayoutRecord(row) : null;
  }

  getActiveLayout(): LayoutRecord | null {
    const row = this.db
      .prepare<[], LayoutRow>("SELECT * FROM layouts WHERE active = 1 LIMIT 1")
      .get();

    return row ? this.toLayoutRecord(row) : null;
  }

  findModuleInstance(
    instanceId: string,
    moduleId?: string,
  ): { layout: LayoutRecord; module: ModuleInstance } | null {
    const findInLayout = (
      layout: LayoutRecord | null,
    ): { layout: LayoutRecord; module: ModuleInstance } | null => {
      if (!layout) {
        return null;
      }

      const moduleInstance = layout.config.modules.find(
        (instance) =>
          instance.id === instanceId && (moduleId === undefined || instance.moduleId === moduleId),
      );

      if (!moduleInstance) {
        return null;
      }

      return {
        layout,
        module: moduleInstance,
      };
    };

    const activeLayout = this.getActiveLayout();
    const foundInActiveLayout = findInLayout(activeLayout);
    if (foundInActiveLayout) {
      return foundInActiveLayout;
    }

    const allLayouts = this.listLayouts(false);
    for (const layout of allLayouts) {
      if (activeLayout && layout.id === activeLayout.id) {
        continue;
      }

      const found = findInLayout(layout);
      if (found) {
        return found;
      }
    }

    return null;
  }

  createLayout(name: string, config: LayoutConfig): LayoutRecord {
    const configJson = this.serializeLayoutConfig(config);
    const hasActive = this.db
      .prepare<[], { id: number }>("SELECT id FROM layouts WHERE active = 1 LIMIT 1")
      .get();

    const active = hasActive ? 0 : 1;

    const result = this.db
      .prepare(
        `
        INSERT INTO layouts (name, config_json, active, version)
        VALUES (@name, @configJson, @active, 1)
        `,
      )
      .run({ name, configJson, active });

    const layoutId = Number(result.lastInsertRowid);

    this.db
      .prepare(
        `
        INSERT INTO layout_versions (layout_id, version, config_json)
        VALUES (@layoutId, 1, @configJson)
        `,
      )
      .run({ layoutId, configJson });

    const created = this.getById(layoutId);

    if (!created) {
      throw new Error("Failed to read created layout");
    }

    return created;
  }

  updateLayout(
    id: number,
    changes: {
      name?: string;
      config?: LayoutConfig;
    },
  ): LayoutRecord | null {
    const existing = this.db
      .prepare<{ id: number }, LayoutRow>("SELECT * FROM layouts WHERE id = @id")
      .get({ id });

    if (!existing) {
      return null;
    }

    const nextName = changes.name ?? existing.name;
    const nextConfig = changes.config
      ? validateLayoutConfig(changes.config)
      : this.parseLayoutConfig(existing.config_json);
    const nextConfigJson = this.serializeLayoutConfig(nextConfig);
    const nextVersion = existing.version + 1;

    const transaction = this.db.transaction(() => {
      this.db
        .prepare(
          `
          INSERT INTO layout_versions (layout_id, version, config_json)
          VALUES (@layoutId, @version, @configJson)
          `,
        )
        .run({
          layoutId: existing.id,
          version: existing.version,
          configJson: existing.config_json,
        });

      this.db
        .prepare(
          `
          UPDATE layouts
          SET name = @name,
              config_json = @configJson,
              version = @version,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = @id
          `,
        )
        .run({
          id,
          name: nextName,
          configJson: nextConfigJson,
          version: nextVersion,
        });
    });

    transaction();

    return this.getById(id);
  }

  activateLayout(id: number): LayoutRecord | null {
    const exists = this.db
      .prepare<{ id: number }, { id: number }>("SELECT id FROM layouts WHERE id = @id")
      .get({ id });

    if (!exists) {
      return null;
    }

    const transaction = this.db.transaction(() => {
      this.db.prepare("UPDATE layouts SET active = 0").run();
      this.db
        .prepare(
          `
          UPDATE layouts
          SET active = 1,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = @id
          `,
        )
        .run({ id });
    });

    transaction();

    return this.getById(id);
  }

  deleteLayout(
    id: number,
  ): { id: number; name: string; version: number; wasActive: boolean } | null {
    const existing = this.db
      .prepare<{ id: number }, LayoutRow>("SELECT * FROM layouts WHERE id = @id")
      .get({ id });

    if (!existing) {
      return null;
    }

    const transaction = this.db.transaction(() => {
      this.db.prepare<{ id: number }>("DELETE FROM layouts WHERE id = @id").run({ id });

      if (existing.active === 1) {
        const replacement = this.db
          .prepare<[], { id: number }>("SELECT id FROM layouts ORDER BY id ASC LIMIT 1")
          .get();

        if (replacement) {
          this.db
            .prepare<{ id: number }>(
              `
              UPDATE layouts
              SET active = 1,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = @id
              `,
            )
            .run({ id: replacement.id });
        }
      }
    });

    transaction();

    return {
      id: existing.id,
      name: existing.name,
      version: existing.version,
      wasActive: existing.active === 1,
    };
  }
}
