import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import {
  buildDefaultDeviceName,
  normalizeDeviceName,
  toUniqueDeviceName,
} from "./repositories/device-name.js";

const schemaSql = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS layouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  config_json TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_layout_active ON layouts(active) WHERE active = 1;

CREATE TABLE IF NOT EXISTS layout_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  layout_id INTEGER NOT NULL,
  version INTEGER NOT NULL,
  config_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(layout_id) REFERENCES layouts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS module_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS module_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  module_instance_id TEXT NOT NULL UNIQUE,
  module_id TEXT NOT NULL,
  config_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  avatar_url TEXT,
  weekly_allowance REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  member_id INTEGER NOT NULL,
  schedule_json TEXT NOT NULL,
  starts_on TEXT,
  value_amount REAL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chore_completions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chore_id INTEGER NOT NULL,
  completion_date TEXT NOT NULL,
  value_amount REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(chore_id) REFERENCES chores(id) ON DELETE CASCADE,
  UNIQUE(chore_id, completion_date)
);

CREATE INDEX IF NOT EXISTS idx_chore_completions_date ON chore_completions(completion_date);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  theme_id TEXT NOT NULL DEFAULT 'default',
  target_selection_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_ip TEXT
);
`;

const ensureColumnExists = (
  db: Database.Database,
  table: string,
  column: string,
  alterSql: string,
): void => {
  const columns = db
    .prepare<[], { name: string }>(`PRAGMA table_info(${table})`)
    .all();

  if (columns.some((entry) => entry.name === column)) {
    return;
  }

  db.exec(alterSql);
};

const MAX_LAYOUT_NAME_LENGTH = 80;

const normalizeLayoutName = (value: string): string => value.trim().toLowerCase();

const toUniqueLayoutName = (baseName: string, used: Set<string>): string => {
  const trimmedBase = baseName.trim();
  const normalizedBase =
    trimmedBase.length > 0 ? trimmedBase : "Layout";
  const cappedBase = normalizedBase.slice(0, MAX_LAYOUT_NAME_LENGTH);

  let candidate = cappedBase;
  let suffixCounter = 2;

  while (used.has(normalizeLayoutName(candidate))) {
    const suffix = ` (${suffixCounter})`;
    const maxBaseLength = Math.max(1, MAX_LAYOUT_NAME_LENGTH - suffix.length);
    candidate = `${cappedBase.slice(0, maxBaseLength).trimEnd()}${suffix}`;
    suffixCounter += 1;
  }

  return candidate;
};

const ensureUniqueLayoutNames = (db: Database.Database): void => {
  const rows = db
    .prepare<[], { id: number; name: string }>(
      "SELECT id, name FROM layouts ORDER BY id ASC",
    )
    .all();

  if (rows.length === 0) {
    return;
  }

  const usedNames = new Set<string>();
  const updates: Array<{ id: number; name: string }> = [];

  for (const row of rows) {
    const baseName = row.name.trim() || `Layout ${row.id}`;
    const uniqueName = toUniqueLayoutName(baseName, usedNames);
    usedNames.add(normalizeLayoutName(uniqueName));

    if (uniqueName !== row.name) {
      updates.push({ id: row.id, name: uniqueName });
    }
  }

  if (updates.length === 0) {
    return;
  }

  const transaction = db.transaction((entries: Array<{ id: number; name: string }>) => {
    const statement = db.prepare<{ id: number; name: string }>(
      `
      UPDATE layouts
      SET name = @name,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
      `,
    );

    for (const entry of entries) {
      statement.run(entry);
    }
  });

  transaction(updates);
};

const ensureLayoutNameUniqueIndex = (db: Database.Database): void => {
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_layout_name_unique_nocase ON layouts(name COLLATE NOCASE);",
  );
};

const ensureUniqueDeviceNames = (db: Database.Database): void => {
  const rows = db
    .prepare<[], { id: string; name: string }>(
      `
      SELECT id, name
      FROM devices
      ORDER BY created_at ASC, id ASC
      `,
    )
    .all();

  if (rows.length === 0) {
    return;
  }

  const usedNames = new Set<string>();
  const updates: Array<{ id: string; name: string }> = [];

  for (const row of rows) {
    const baseName = row.name.trim() || buildDefaultDeviceName(row.id);
    const uniqueName = toUniqueDeviceName(baseName, usedNames);
    usedNames.add(normalizeDeviceName(uniqueName));

    if (uniqueName !== row.name) {
      updates.push({ id: row.id, name: uniqueName });
    }
  }

  if (updates.length === 0) {
    return;
  }

  const transaction = db.transaction((entries: Array<{ id: string; name: string }>) => {
    const statement = db.prepare<{ id: string; name: string }>(
      `
      UPDATE devices
      SET name = @name,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
      `,
    );

    for (const entry of entries) {
      statement.run(entry);
    }
  });

  transaction(updates);
};

const ensureDeviceNameUniqueIndex = (db: Database.Database): void => {
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_name_unique_nocase ON devices(name COLLATE NOCASE);",
  );
};

interface DefaultLayoutSeed {
  name: string;
  active: 0 | 1;
  config: Record<string, unknown>;
}

const DEFAULT_LAYOUT_SEEDS: DefaultLayoutSeed[] = [
  {
    name: "16:9 Standard Landscape",
    active: 1,
    config: {
      cols: 35,
      rows: 20,
      rowHeight: 54,
      items: [
        { i: "mod-cfac714f-dca1-4474-99c5-fd5d330f0174", x: 0, y: 0, w: 6, h: 2 },
        { i: "mod-c0df2f00-b51b-44b2-a09a-30e5dd7a381b", x: 7, y: 0, w: 4, h: 2 },
        { i: "mod-37fc8626-bafa-4d11-a155-fd8c64d0a31e", x: 12, y: 0, w: 23, h: 20 },
        { i: "mod-871c01c0-6597-47b7-8439-26a8b16f6338", x: 0, y: 3, w: 11, h: 8 },
        { i: "mod-be8d6a1a-16c9-491d-871b-5d49efd2393f", x: 0, y: 12, w: 11, h: 8 },
      ],
      modules: [
        {
          id: "mod-cfac714f-dca1-4474-99c5-fd5d330f0174",
          moduleId: "clock",
          config: {
            use24Hour: true,
            showSeconds: true,
            showDate: true,
          },
        },
        {
          id: "mod-c0df2f00-b51b-44b2-a09a-30e5dd7a381b",
          moduleId: "weather",
          config: {
            locationQuery: "Dunsborough, Western Australia, AU",
            latitude: -33.61476,
            longitude: 115.10445,
            temperatureUnit: "celsius",
            windSpeedUnit: "knots",
            refreshIntervalSeconds: 600,
            showForecast: false,
            showTodayHumidity: false,
            showTodayWind: false,
          },
        },
        {
          id: "mod-871c01c0-6597-47b7-8439-26a8b16f6338",
          moduleId: "photos",
          config: {
            folderPath: "/photos",
            collectionId: null,
            intervalSeconds: 20,
            shuffle: true,
            layoutOrientation: "landscape",
          },
        },
        {
          id: "mod-37fc8626-bafa-4d11-a155-fd8c64d0a31e",
          moduleId: "calendar",
          config: {
            viewMode: "month",
            calendars: [],
            calendarLabels: [],
            calendarColors: [],
            daysToShow: 14,
            use24Hour: true,
            refreshIntervalSeconds: 300,
          },
        },
        {
          id: "mod-be8d6a1a-16c9-491d-871b-5d49efd2393f",
          moduleId: "chores",
          config: {
            enableMoneyTracking: true,
            showStats: true,
          },
        },
      ],
    },
  },
  {
    name: "16:9 Standard Portrait",
    active: 0,
    config: {
      cols: 35,
      rows: 20,
      rowHeight: 54,
      items: [
        { i: "mod-b7b3d37d-6305-427c-a651-a4804da36a87", x: 0, y: 0, w: 9, h: 3 },
        { i: "mod-be0136c8-b34b-45d6-b7b1-23f4d5e157d0", x: 10, y: 0, w: 15, h: 20 },
        { i: "mod-8123d00e-1782-4aec-94b5-89b89a5c3f10", x: 26, y: 0, w: 9, h: 10 },
        { i: "mod-481fd8c4-ef25-4482-b95f-62ab3ef1dbea", x: 0, y: 4, w: 9, h: 5 },
        { i: "mod-348d50e7-ff55-4d90-82c8-353a71ef3a7d", x: 0, y: 10, w: 9, h: 5 },
        { i: "mod-1e692127-17d0-437f-9ea0-59df713f9733", x: 26, y: 11, w: 9, h: 9 },
        { i: "mod-2bf2f15e-9efd-4f92-9594-0106517e8a8e", x: 0, y: 16, w: 9, h: 4 },
      ],
      modules: [
        {
          id: "mod-be0136c8-b34b-45d6-b7b1-23f4d5e157d0",
          moduleId: "photos",
          config: {
            folderPath: "/photos",
            collectionId: null,
            intervalSeconds: 20,
            shuffle: true,
            layoutOrientation: "portrait",
          },
        },
        {
          id: "mod-b7b3d37d-6305-427c-a651-a4804da36a87",
          moduleId: "clock",
          config: {
            use24Hour: true,
            showSeconds: true,
            showDate: true,
          },
        },
        {
          id: "mod-481fd8c4-ef25-4482-b95f-62ab3ef1dbea",
          moduleId: "weather",
          config: {
            locationQuery: "Dunsborough, Western Australia, AU",
            latitude: -33.61476,
            longitude: 115.10445,
            temperatureUnit: "celsius",
            windSpeedUnit: "knots",
            refreshIntervalSeconds: 600,
            showForecast: true,
            showTodayHumidity: false,
            showTodayWind: true,
          },
        },
        {
          id: "mod-8123d00e-1782-4aec-94b5-89b89a5c3f10",
          moduleId: "calendar",
          config: {
            viewMode: "list",
            calendars: [],
            calendarLabels: [],
            calendarColors: [],
            daysToShow: 2,
            use24Hour: true,
            refreshIntervalSeconds: 300,
          },
        },
        {
          id: "mod-1e692127-17d0-437f-9ea0-59df713f9733",
          moduleId: "chores",
          config: {
            enableMoneyTracking: true,
            showStats: true,
          },
        },
        {
          id: "mod-348d50e7-ff55-4d90-82c8-353a71ef3a7d",
          moduleId: "count-down",
          config: {
            eventName: "",
            mode: "date",
            targetDate: "2026-03-09",
            days: 0,
            hours: 0,
            minutes: 0,
            seconds: 10,
          },
        },
        {
          id: "mod-2bf2f15e-9efd-4f92-9594-0106517e8a8e",
          moduleId: "bible-verse",
          config: {
            refreshIntervalSeconds: 21600,
            showReference: true,
            showSource: false,
          },
        },
      ],
    },
  },
];

const DEFAULT_SCREEN_PROFILE_LAYOUTS = {
  switchMode: "auto",
  autoCycleSeconds: 20,
  families: {
    "set-1": {
      name: "16:9 Family Set",
      staticLayoutName: "16:9 Standard Landscape",
      defaultPhotoCollectionId: null,
      photoActionCollectionId: null,
      photoActionType: "photo.select-next",
      logicNodePositions: {
        start: { x: 702, y: 24 },
        "select-photo": { x: 590, y: 198 },
        "if-portrait": { x: 670, y: 312 },
        "rule-portrait-photo-0": { x: 170, y: 586 },
        "rule-always-0": { x: 970, y: 586 },
        return: { x: 702, y: 752 },
      },
      logicGraph: {
        version: 1,
        entryNodeId: "start",
        nodes: [
          { id: "start", type: "start" },
          { id: "select-photo", type: "select-photo" },
          { id: "return", type: "return" },
          {
            id: "if-portrait",
            type: "if-portrait",
            conditionType: "photo.orientation.portrait",
            conditionParams: {},
          },
          { id: "if-else", type: "else" },
          {
            id: "display-portrait-0",
            type: "display",
            layoutName: "16:9 Standard Portrait",
            cycleSeconds: 20,
            actionType: "layout.display",
            actionParams: {},
            conditionType: "photo.orientation.portrait",
            conditionParams: {},
          },
          {
            id: "display-fallback-0",
            type: "display",
            layoutName: "16:9 Standard Landscape",
            cycleSeconds: 20,
            actionType: "layout.display",
            actionParams: {},
            conditionType: null,
            conditionParams: {},
          },
        ],
        edges: [
          {
            id: "edge-start-photo",
            from: "start",
            to: "select-photo",
            when: "always",
          },
          {
            id: "edge-photo-portrait",
            from: "select-photo",
            to: "if-portrait",
            when: "always",
          },
          {
            id: "edge-portrait-yes",
            from: "if-portrait",
            to: "display-portrait-0",
            when: "yes",
          },
          {
            id: "edge-portrait-no",
            from: "if-portrait",
            to: "if-else",
            when: "no",
          },
          {
            id: "edge-else-fallback",
            from: "if-else",
            to: "display-fallback-0",
            when: "always",
          },
          {
            id: "portrait-return",
            from: "display-portrait-0",
            to: "return",
            when: "always",
          },
          {
            id: "fallback-return",
            from: "display-fallback-0",
            to: "return",
            when: "always",
          },
        ],
      },
      logicEdgeOverrides: {},
      logicDisconnectedEdgeIds: [],
      autoLayoutTargets: [
        {
          layoutName: "16:9 Standard Landscape",
          trigger: "always",
          cycleSeconds: 20,
          actionType: "layout.display",
          actionParams: {},
          conditionType: null,
          conditionParams: {},
        },
        {
          layoutName: "16:9 Standard Portrait",
          trigger: "portrait-photo",
          cycleSeconds: 20,
          actionType: "layout.display",
          actionParams: {},
          conditionType: "photo.orientation.portrait",
          conditionParams: {},
        },
      ],
      portraitPhotoLayoutName: "16:9 Standard Landscape",
      landscapePhotoLayoutName: "16:9 Standard Landscape",
      portraitPhotoLayoutNames: [
        "16:9 Standard Landscape",
        "16:9 Standard Portrait",
      ],
      landscapePhotoLayoutNames: ["16:9 Standard Landscape"],
    },
  },
};

const SCREEN_PROFILE_LAYOUTS_KEY = "screen_profile_layouts";

const seedDefaultLayoutsAndSettings = (db: Database.Database): void => {
  const existingLayoutCount = db
    .prepare<[], { count: number }>("SELECT COUNT(*) AS count FROM layouts")
    .get()?.count;

  if ((existingLayoutCount ?? 0) > 0) {
    return;
  }

  const transaction = db.transaction(() => {
    for (const seed of DEFAULT_LAYOUT_SEEDS) {
      const configJson = JSON.stringify(seed.config);
      const result = db
        .prepare(
          `
          INSERT INTO layouts (name, config_json, active, version)
          VALUES (@name, @configJson, @active, 1)
          `,
        )
        .run({
          name: seed.name,
          configJson,
          active: seed.active,
        });

      const layoutId = Number(result.lastInsertRowid);
      db.prepare(
        `
        INSERT INTO layout_versions (layout_id, version, config_json)
        VALUES (@layoutId, 1, @configJson)
        `,
      ).run({
        layoutId,
        configJson,
      });
    }

    const screenProfileLayoutsValue = JSON.stringify(DEFAULT_SCREEN_PROFILE_LAYOUTS);

    db.prepare(
      `
      INSERT INTO settings (key, value, updated_at)
      VALUES (@key, @value, CURRENT_TIMESTAMP)
      ON CONFLICT(key)
      DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `,
    ).run({
      key: SCREEN_PROFILE_LAYOUTS_KEY,
      value: screenProfileLayoutsValue,
    });
  });

  transaction();
};

export const createDatabase = (filePath: string): Database.Database => {
  mkdirSync(dirname(filePath), { recursive: true });

  const db = new Database(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(schemaSql);

  ensureColumnExists(
    db,
    "members",
    "weekly_allowance",
    "ALTER TABLE members ADD COLUMN weekly_allowance REAL NOT NULL DEFAULT 0",
  );
  ensureColumnExists(
    db,
    "chores",
    "starts_on",
    "ALTER TABLE chores ADD COLUMN starts_on TEXT",
  );
  ensureColumnExists(
    db,
    "devices",
    "last_seen_ip",
    "ALTER TABLE devices ADD COLUMN last_seen_ip TEXT",
  );

  ensureUniqueLayoutNames(db);
  ensureLayoutNameUniqueIndex(db);
  ensureUniqueDeviceNames(db);
  ensureDeviceNameUniqueIndex(db);
  seedDefaultLayoutsAndSettings(db);

  return db;
};
