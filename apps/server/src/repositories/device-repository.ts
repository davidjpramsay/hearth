import type Database from "better-sqlite3";
import {
  displayDeviceIdSchema,
  displayDeviceSchema,
  displayThemeIdSchema,
  reportScreenTargetSelectionSchema,
  updateDisplayDeviceRequestSchema,
  type DisplayDevice,
  type ReportScreenTargetSelection,
  type UpdateDisplayDeviceRequest,
} from "@hearth/shared";
import {
  DuplicateDeviceNameError,
  buildDefaultDeviceName,
  normalizeDeviceName,
  toUniqueDeviceName,
} from "./device-name.js";

interface DeviceRow {
  id: string;
  name: string;
  theme_id: string;
  target_selection_json: string | null;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
}

const DEFAULT_THEME_ID = displayThemeIdSchema.parse("default");

const parseTargetSelection = (
  rawValue: string | null,
): ReportScreenTargetSelection | null => {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue);
    const result = reportScreenTargetSelectionSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
};

export class DeviceRepository {
  constructor(private readonly db: Database.Database) {}

  private listUsedDeviceNames(excludeDeviceId?: string): Set<string> {
    const rows = excludeDeviceId
      ? this.db
          .prepare<{ excludeDeviceId: string }, { name: string }>(
            `
            SELECT name
            FROM devices
            WHERE id != @excludeDeviceId
            `,
          )
          .all({ excludeDeviceId })
      : this.db
          .prepare<[], { name: string }>(
            `
            SELECT name
            FROM devices
            `,
          )
          .all();

    return new Set(
      rows
        .map((row) => normalizeDeviceName(row.name))
        .filter((name) => name.length > 0),
    );
  }

  private ensureUniqueCustomName(name: string, excludeDeviceId?: string): string {
    const nextName = name.trim().slice(0, 80);
    const normalizedName = normalizeDeviceName(nextName);
    const usedNames = this.listUsedDeviceNames(excludeDeviceId);

    if (usedNames.has(normalizedName)) {
      throw new DuplicateDeviceNameError();
    }

    return nextName;
  }

  private buildUniqueDefaultName(deviceId: string): string {
    return toUniqueDeviceName(
      buildDefaultDeviceName(deviceId),
      this.listUsedDeviceNames(),
    );
  }

  private mapRow(row: DeviceRow): DisplayDevice {
    const parsedTheme = displayThemeIdSchema.safeParse(row.theme_id);

    return displayDeviceSchema.parse({
      id: row.id,
      name:
        row.name.trim().length > 0
          ? row.name.trim().slice(0, 80)
          : buildDefaultDeviceName(row.id),
      themeId: parsedTheme.success ? parsedTheme.data : DEFAULT_THEME_ID,
      targetSelection: parseTargetSelection(row.target_selection_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastSeenAt: row.last_seen_at,
    });
  }

  getDevice(deviceId: string): DisplayDevice | null {
    const normalizedDeviceId = displayDeviceIdSchema.parse(deviceId);
    const row = this.db
      .prepare<{ id: string }, DeviceRow>(
        `
        SELECT id, name, theme_id, target_selection_json, created_at, updated_at, last_seen_at
        FROM devices
        WHERE id = @id
        `,
      )
      .get({ id: normalizedDeviceId });

    return row ? this.mapRow(row) : null;
  }

  listDevices(): DisplayDevice[] {
    const rows = this.db
      .prepare<[], DeviceRow>(
        `
        SELECT id, name, theme_id, target_selection_json, created_at, updated_at, last_seen_at
        FROM devices
        ORDER BY last_seen_at DESC, created_at DESC, id ASC
        `,
      )
      .all();

    return rows.map((row) => this.mapRow(row));
  }

  recordSeen(input: {
    deviceId: string;
    reportedTargetSelection: ReportScreenTargetSelection | null;
    reportedThemeId: string | null | undefined;
  }): DisplayDevice {
    const normalizedDeviceId = displayDeviceIdSchema.parse(input.deviceId);
    const existing = this.getDevice(normalizedDeviceId);

    if (!existing) {
      const themeId = displayThemeIdSchema.safeParse(input.reportedThemeId);
      const targetSelection = input.reportedTargetSelection
        ? reportScreenTargetSelectionSchema.parse(input.reportedTargetSelection)
        : null;

      this.db
        .prepare(
          `
          INSERT INTO devices (
            id,
            name,
            theme_id,
            target_selection_json,
            created_at,
            updated_at,
            last_seen_at
          )
          VALUES (
            @id,
            @name,
            @themeId,
            @targetSelectionJson,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
          )
          `,
        )
        .run({
          id: normalizedDeviceId,
          name: this.buildUniqueDefaultName(normalizedDeviceId),
          themeId: themeId.success ? themeId.data : DEFAULT_THEME_ID,
          targetSelectionJson: targetSelection ? JSON.stringify(targetSelection) : null,
        });

      return this.getDevice(normalizedDeviceId) as DisplayDevice;
    }

    this.db
      .prepare(
        `
        UPDATE devices
        SET last_seen_at = CURRENT_TIMESTAMP
        WHERE id = @id
        `,
      )
      .run({ id: normalizedDeviceId });

    return this.getDevice(normalizedDeviceId) as DisplayDevice;
  }

  updateDevice(deviceId: string, input: UpdateDisplayDeviceRequest): DisplayDevice {
    const normalizedDeviceId = displayDeviceIdSchema.parse(deviceId);
    const parsedUpdate = updateDisplayDeviceRequestSchema.parse(input);
    const nextName = this.ensureUniqueCustomName(parsedUpdate.name, normalizedDeviceId);

    this.db
      .prepare(
        `
        UPDATE devices
        SET name = @name,
            theme_id = @themeId,
            target_selection_json = @targetSelectionJson,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = @id
        `,
      )
      .run({
        id: normalizedDeviceId,
        name: nextName,
        themeId: parsedUpdate.themeId,
        targetSelectionJson: parsedUpdate.targetSelection
          ? JSON.stringify(parsedUpdate.targetSelection)
          : null,
      });

    return this.getDevice(normalizedDeviceId) as DisplayDevice;
  }
}
