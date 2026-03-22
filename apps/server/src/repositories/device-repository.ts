import type Database from "better-sqlite3";
import {
  displayDeviceIdSchema,
  displayDeviceInfoSchema,
  displayDeviceSchema,
  displayThemeIdSchema,
  reportScreenTargetSelectionSchema,
  updateDisplayDeviceRequestSchema,
  type DisplayDevice,
  type DisplayDeviceInfo,
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
  last_seen_ip: string | null;
  device_info_json: string | null;
}

const DEFAULT_THEME_ID = displayThemeIdSchema.parse("default");
const MAX_DEVICE_IP_LENGTH = 255;

const parseTargetSelection = (rawValue: string | null): ReportScreenTargetSelection | null => {
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

const parseDeviceInfo = (rawValue: string | null): DisplayDeviceInfo | null => {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue);
    const result = displayDeviceInfoSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
};

export class DeviceRepository {
  constructor(private readonly db: Database.Database) {}

  private normalizeLastSeenIp(value: string | null | undefined): string | null {
    if (typeof value !== "string") {
      return null;
    }

    const nextValue = value.trim().slice(0, MAX_DEVICE_IP_LENGTH);
    return nextValue.length > 0 ? nextValue : null;
  }

  private normalizeDeviceInfo(
    value: DisplayDeviceInfo | null | undefined,
  ): DisplayDeviceInfo | null {
    const result = displayDeviceInfoSchema.safeParse(value);
    return result.success ? result.data : null;
  }

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
      rows.map((row) => normalizeDeviceName(row.name)).filter((name) => name.length > 0),
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

  private buildUniqueDefaultName(deviceId: string, deviceInfo?: DisplayDeviceInfo | null): string {
    return toUniqueDeviceName(
      buildDefaultDeviceName(deviceId, deviceInfo?.label ?? null),
      this.listUsedDeviceNames(),
    );
  }

  private mapRow(row: DeviceRow): DisplayDevice {
    const parsedTheme = displayThemeIdSchema.safeParse(row.theme_id);
    const parsedDeviceInfo = parseDeviceInfo(row.device_info_json);

    return displayDeviceSchema.parse({
      id: row.id,
      name:
        row.name.trim().length > 0
          ? row.name.trim().slice(0, 80)
          : buildDefaultDeviceName(row.id, parsedDeviceInfo?.label ?? null),
      themeId: parsedTheme.success ? parsedTheme.data : DEFAULT_THEME_ID,
      targetSelection: parseTargetSelection(row.target_selection_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastSeenAt: row.last_seen_at,
      lastSeenIp: this.normalizeLastSeenIp(row.last_seen_ip),
      deviceInfo: parsedDeviceInfo,
    });
  }

  getDevice(deviceId: string): DisplayDevice | null {
    const normalizedDeviceId = displayDeviceIdSchema.parse(deviceId);
    const row = this.db
      .prepare<{ id: string }, DeviceRow>(
        `
        SELECT
          id,
          name,
          theme_id,
          target_selection_json,
          created_at,
          updated_at,
          last_seen_at,
          last_seen_ip,
          device_info_json
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
        SELECT
          id,
          name,
          theme_id,
          target_selection_json,
          created_at,
          updated_at,
          last_seen_at,
          last_seen_ip,
          device_info_json
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
    lastSeenIp?: string | null;
    reportedDeviceInfo?: DisplayDeviceInfo | null;
  }): DisplayDevice {
    const normalizedDeviceId = displayDeviceIdSchema.parse(input.deviceId);
    const existing = this.getDevice(normalizedDeviceId);
    const nextLastSeenIp = this.normalizeLastSeenIp(input.lastSeenIp);
    const nextDeviceInfo = this.normalizeDeviceInfo(input.reportedDeviceInfo);

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
            last_seen_at,
            last_seen_ip,
            device_info_json
          )
          VALUES (
            @id,
            @name,
            @themeId,
            @targetSelectionJson,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP,
            @lastSeenIp,
            @deviceInfoJson
          )
          `,
        )
        .run({
          id: normalizedDeviceId,
          name: this.buildUniqueDefaultName(normalizedDeviceId, nextDeviceInfo),
          themeId: themeId.success ? themeId.data : DEFAULT_THEME_ID,
          targetSelectionJson: targetSelection ? JSON.stringify(targetSelection) : null,
          lastSeenIp: nextLastSeenIp,
          deviceInfoJson: nextDeviceInfo ? JSON.stringify(nextDeviceInfo) : null,
        });

      return this.getDevice(normalizedDeviceId) as DisplayDevice;
    }

    const updates = ["last_seen_at = CURRENT_TIMESTAMP"];
    const statementParams: Record<string, string | null> = {
      id: normalizedDeviceId,
    };

    if (nextLastSeenIp !== null) {
      updates.push("last_seen_ip = @lastSeenIp");
      statementParams.lastSeenIp = nextLastSeenIp;
    }

    if (nextDeviceInfo !== null) {
      updates.push("device_info_json = @deviceInfoJson");
      statementParams.deviceInfoJson = JSON.stringify(nextDeviceInfo);
    }

    this.db
      .prepare(
        `
        UPDATE devices
        SET ${updates.join(",\n            ")}
        WHERE id = @id
        `,
      )
      .run(statementParams);

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

  deleteDevice(deviceId: string): boolean {
    const normalizedDeviceId = displayDeviceIdSchema.parse(deviceId);
    const result = this.db
      .prepare<{ id: string }>(
        `
        DELETE FROM devices
        WHERE id = @id
        `,
      )
      .run({ id: normalizedDeviceId });

    return result.changes > 0;
  }
}
