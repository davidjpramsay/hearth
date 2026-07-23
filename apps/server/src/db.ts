import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { createLayoutSetLogicGraphFromBranches, type AutoLayoutTarget } from "@hearth/shared";
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

CREATE TABLE IF NOT EXISTS planner_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  repeat_days_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS planner_template_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  colour TEXT NOT NULL,
  notes TEXT,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(template_id) REFERENCES planner_templates(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_planner_template_blocks_template_id
  ON planner_template_blocks(template_id);

CREATE INDEX IF NOT EXISTS idx_planner_template_blocks_user_id
  ON planner_template_blocks(user_id);

CREATE TABLE IF NOT EXISTS planner_activity_completions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  block_id INTEGER NOT NULL,
  completion_date TEXT NOT NULL,
  completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(block_id) REFERENCES planner_template_blocks(id) ON DELETE CASCADE,
  UNIQUE(block_id, completion_date)
);

CREATE INDEX IF NOT EXISTS idx_planner_activity_completions_date
  ON planner_activity_completions(completion_date);

CREATE TABLE IF NOT EXISTS planner_daily_plan_snapshots (
  snapshot_date TEXT PRIMARY KEY,
  week_start_date TEXT NOT NULL,
  week_end_date TEXT NOT NULL,
  template_id INTEGER,
  template_name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_planner_daily_plan_snapshots_week_start
  ON planner_daily_plan_snapshots(week_start_date);

CREATE TABLE IF NOT EXISTS planner_daily_plan_snapshot_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_date TEXT NOT NULL,
  template_id INTEGER NOT NULL,
  source_block_id INTEGER,
  user_id INTEGER NOT NULL,
  user_name TEXT NOT NULL,
  name TEXT NOT NULL,
  colour TEXT NOT NULL,
  notes TEXT,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(snapshot_date) REFERENCES planner_daily_plan_snapshots(snapshot_date) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES members(id) ON DELETE CASCADE,
  FOREIGN KEY(source_block_id) REFERENCES planner_template_blocks(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_planner_snapshot_blocks_date
  ON planner_daily_plan_snapshot_blocks(snapshot_date);

CREATE UNIQUE INDEX IF NOT EXISTS idx_planner_snapshot_blocks_source
  ON planner_daily_plan_snapshot_blocks(snapshot_date, source_block_id)
  WHERE source_block_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS planner_snapshot_activity_completions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_block_id INTEGER NOT NULL,
  completion_date TEXT NOT NULL,
  completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(snapshot_block_id) REFERENCES planner_daily_plan_snapshot_blocks(id) ON DELETE CASCADE,
  UNIQUE(snapshot_block_id, completion_date)
);

CREATE INDEX IF NOT EXISTS idx_planner_snapshot_activity_completions_date
  ON planner_snapshot_activity_completions(completion_date);

CREATE TABLE IF NOT EXISTS planner_weekly_summary_archives (
  week_start_date TEXT PRIMARY KEY,
  week_end_date TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  pdf_relative_path TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS planner_date_assignments (
  assignment_date TEXT PRIMARY KEY,
  template_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(template_id) REFERENCES planner_templates(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  theme_id TEXT NOT NULL DEFAULT 'default',
  target_selection_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_ip TEXT,
  device_info_json TEXT
);
`;

const ensureColumnExists = (
  db: Database.Database,
  table: string,
  column: string,
  alterSql: string,
): void => {
  const columns = db.prepare<[], { name: string }>(`PRAGMA table_info(${table})`).all();

  if (columns.some((entry) => entry.name === column)) {
    return;
  }

  db.exec(alterSql);
};

const tableExists = (db: Database.Database, table: string): boolean =>
  Boolean(
    db
      .prepare<{ table: string }, { name: string }>(
        `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name = @table
        `,
      )
      .get({ table }),
  );

const ensurePlannerBlocksReferenceMembers = (db: Database.Database): void => {
  if (!tableExists(db, "planner_template_blocks")) {
    return;
  }

  const foreignKeys = db
    .prepare<
      [],
      { table: string; from: string }
    >("PRAGMA foreign_key_list(planner_template_blocks)")
    .all();
  const userIdTarget = foreignKeys.find((entry) => entry.from === "user_id")?.table;

  if (userIdTarget === "members") {
    return;
  }

  const legacyUsers = tableExists(db, "planner_users")
    ? db
        .prepare<[], { id: number; name: string; created_at: string; updated_at: string }>(
          `
          SELECT id, name, created_at, updated_at
          FROM planner_users
          ORDER BY id ASC
          `,
        )
        .all()
    : [];
  const legacyBlocks = db
    .prepare<
      [],
      {
        id: number;
        template_id: number;
        user_id: number;
        name: string;
        colour: string;
        notes: string | null;
        start_time: string;
        end_time: string;
        created_at: string;
        updated_at: string;
      }
    >(
      `
      SELECT *
      FROM planner_template_blocks
      ORDER BY id ASC
      `,
    )
    .all();

  const findMemberById = db.prepare<{ id: number }, { id: number }>(
    "SELECT id FROM members WHERE id = @id",
  );
  const findMemberByName = db.prepare<{ name: string }, { id: number }>(
    `
    SELECT id
    FROM members
    WHERE name = @name COLLATE NOCASE
    ORDER BY id ASC
    LIMIT 1
    `,
  );
  const insertMemberWithId = db.prepare(
    `
    INSERT INTO members (id, name, avatar_url, weekly_allowance, created_at, updated_at)
    VALUES (@id, @name, NULL, 0, @createdAt, @updatedAt)
    `,
  );
  const idMapping = new Map<number, number>();

  for (const user of legacyUsers) {
    const existingById = findMemberById.get({ id: user.id });
    if (existingById) {
      idMapping.set(user.id, existingById.id);
      continue;
    }

    const existingByName = findMemberByName.get({ name: user.name.trim() });
    if (existingByName) {
      idMapping.set(user.id, existingByName.id);
      continue;
    }

    insertMemberWithId.run({
      id: user.id,
      name: user.name.trim(),
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    });
    idMapping.set(user.id, user.id);
  }

  for (const block of legacyBlocks) {
    const mappedUserId = idMapping.get(block.user_id) ?? block.user_id;
    if (findMemberById.get({ id: mappedUserId })) {
      continue;
    }

    insertMemberWithId.run({
      id: mappedUserId,
      name: `Child ${mappedUserId}`,
      createdAt: block.created_at,
      updatedAt: block.updated_at,
    });
  }

  db.exec("ALTER TABLE planner_template_blocks RENAME TO planner_template_blocks_legacy");
  db.exec(`
    CREATE TABLE planner_template_blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      colour TEXT NOT NULL,
      notes TEXT,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(template_id) REFERENCES planner_templates(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES members(id) ON DELETE CASCADE
    )
  `);

  const insertBlock = db.prepare(
    `
    INSERT INTO planner_template_blocks (
      id,
      template_id,
      user_id,
      name,
      colour,
      notes,
      start_time,
      end_time,
      created_at,
      updated_at
    )
    VALUES (
      @id,
      @templateId,
      @userId,
      @name,
      @colour,
      @notes,
      @startTime,
      @endTime,
      @createdAt,
      @updatedAt
    )
    `,
  );

  for (const block of legacyBlocks) {
    insertBlock.run({
      id: block.id,
      templateId: block.template_id,
      userId: idMapping.get(block.user_id) ?? block.user_id,
      name: block.name,
      colour: block.colour,
      notes: block.notes,
      startTime: block.start_time,
      endTime: block.end_time,
      createdAt: block.created_at,
      updatedAt: block.updated_at,
    });
  }

  db.exec("DROP TABLE planner_template_blocks_legacy");
  db.exec("DROP INDEX IF EXISTS idx_planner_template_blocks_template_id");
  db.exec("DROP INDEX IF EXISTS idx_planner_template_blocks_user_id");
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_planner_template_blocks_template_id ON planner_template_blocks(template_id)",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_planner_template_blocks_user_id ON planner_template_blocks(user_id)",
  );
};

const MAX_LAYOUT_NAME_LENGTH = 80;

const normalizeLayoutName = (value: string): string => value.trim().toLowerCase();

const toUniqueLayoutName = (baseName: string, used: Set<string>): string => {
  const trimmedBase = baseName.trim();
  const normalizedBase = trimmedBase.length > 0 ? trimmedBase : "Layout";
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
    .prepare<[], { id: number; name: string }>("SELECT id, name FROM layouts ORDER BY id ASC")
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
        { i: "mod-cfac714f-dca1-4474-99c5-fd5d330f0174", x: 0, y: 0, w: 7, h: 4 },
        { i: "mod-c0df2f00-b51b-44b2-a09a-30e5dd7a381b", x: 7, y: 0, w: 6, h: 4 },
        { i: "mod-37fc8626-bafa-4d11-a155-fd8c64d0a31e", x: 0, y: 4, w: 25, h: 16 },
        { i: "mod-871c01c0-6597-47b7-8439-26a8b16f6338", x: 25, y: 0, w: 10, h: 10 },
        { i: "mod-be8d6a1a-16c9-491d-871b-5d49efd2393f", x: 25, y: 10, w: 10, h: 10 },
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
        { i: "mod-b7b3d37d-6305-427c-a651-a4804da36a87", x: 0, y: 0, w: 8, h: 4 },
        { i: "mod-be0136c8-b34b-45d6-b7b1-23f4d5e157d0", x: 8, y: 0, w: 12, h: 20 },
        { i: "mod-8123d00e-1782-4aec-94b5-89b89a5c3f10", x: 20, y: 0, w: 15, h: 11 },
        { i: "mod-481fd8c4-ef25-4482-b95f-62ab3ef1dbea", x: 0, y: 4, w: 8, h: 5 },
        { i: "mod-348d50e7-ff55-4d90-82c8-353a71ef3a7d", x: 0, y: 9, w: 8, h: 5 },
        { i: "mod-1e692127-17d0-437f-9ea0-59df713f9733", x: 20, y: 11, w: 15, h: 9 },
        { i: "mod-2bf2f15e-9efd-4f92-9594-0106517e8a8e", x: 0, y: 14, w: 8, h: 6 },
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

type StarterLayoutItem = {
  i: "clock" | "weather" | "welcome" | "calendar" | "chores" | "photos";
  x: number;
  y: number;
  w: number;
  h: number;
};

type StarterLayoutDefinition = {
  id: string;
  name: string;
  ratioLabel: string;
  cols: number;
  rows: number;
  calendarView: "week" | "list";
  daysToShow: number;
  items: StarterLayoutItem[];
  portraitPhotoItems: StarterLayoutItem[];
};

const STARTER_LAYOUT_DEFINITIONS: StarterLayoutDefinition[] = [
  {
    id: "wide-16-9",
    name: "Hearth Week · 16:9",
    ratioLabel: "16:9",
    cols: 32,
    rows: 18,
    calendarView: "week",
    daysToShow: 7,
    items: [
      { i: "clock", x: 0, y: 0, w: 7, h: 4 },
      { i: "weather", x: 7, y: 0, w: 7, h: 4 },
      { i: "welcome", x: 14, y: 0, w: 18, h: 4 },
      { i: "calendar", x: 0, y: 4, w: 23, h: 14 },
      { i: "photos", x: 23, y: 4, w: 9, h: 7 },
      { i: "chores", x: 23, y: 11, w: 9, h: 7 },
    ],
    portraitPhotoItems: [
      { i: "clock", x: 0, y: 0, w: 7, h: 3 },
      { i: "weather", x: 7, y: 0, w: 6, h: 3 },
      { i: "calendar", x: 0, y: 3, w: 19, h: 11 },
      { i: "chores", x: 0, y: 14, w: 19, h: 4 },
      { i: "photos", x: 19, y: 0, w: 13, h: 18 },
    ],
  },
  {
    id: "classic-4-3",
    name: "Hearth Week · 4:3",
    ratioLabel: "4:3",
    cols: 20,
    rows: 15,
    calendarView: "week",
    daysToShow: 7,
    items: [
      { i: "clock", x: 0, y: 0, w: 5, h: 3 },
      { i: "weather", x: 5, y: 0, w: 5, h: 3 },
      { i: "welcome", x: 10, y: 0, w: 10, h: 3 },
      { i: "calendar", x: 0, y: 3, w: 14, h: 12 },
      { i: "photos", x: 14, y: 3, w: 6, h: 5 },
      { i: "chores", x: 14, y: 8, w: 6, h: 7 },
    ],
    portraitPhotoItems: [
      { i: "clock", x: 0, y: 0, w: 5, h: 3 },
      { i: "weather", x: 5, y: 0, w: 4, h: 3 },
      { i: "calendar", x: 0, y: 3, w: 12, h: 9 },
      { i: "chores", x: 0, y: 12, w: 12, h: 3 },
      { i: "photos", x: 12, y: 0, w: 8, h: 15 },
    ],
  },
  {
    id: "balanced-3-2",
    name: "Hearth Week · 3:2",
    ratioLabel: "3:2",
    cols: 21,
    rows: 14,
    calendarView: "week",
    daysToShow: 7,
    items: [
      { i: "clock", x: 0, y: 0, w: 5, h: 3 },
      { i: "weather", x: 5, y: 0, w: 5, h: 3 },
      { i: "welcome", x: 10, y: 0, w: 11, h: 3 },
      { i: "calendar", x: 0, y: 3, w: 15, h: 11 },
      { i: "photos", x: 15, y: 3, w: 6, h: 5 },
      { i: "chores", x: 15, y: 8, w: 6, h: 6 },
    ],
    portraitPhotoItems: [
      { i: "clock", x: 0, y: 0, w: 5, h: 3 },
      { i: "weather", x: 5, y: 0, w: 4, h: 3 },
      { i: "calendar", x: 0, y: 3, w: 13, h: 8 },
      { i: "chores", x: 0, y: 11, w: 13, h: 3 },
      { i: "photos", x: 13, y: 0, w: 8, h: 14 },
    ],
  },
  {
    id: "portrait-9-16",
    name: "Hearth Agenda · 9:16",
    ratioLabel: "9:16",
    cols: 18,
    rows: 32,
    calendarView: "list",
    daysToShow: 5,
    items: [
      { i: "clock", x: 0, y: 0, w: 10, h: 4 },
      { i: "weather", x: 10, y: 0, w: 8, h: 4 },
      { i: "photos", x: 1, y: 4, w: 16, h: 12 },
      { i: "calendar", x: 0, y: 16, w: 18, h: 10 },
      { i: "chores", x: 0, y: 26, w: 18, h: 6 },
    ],
    portraitPhotoItems: [
      { i: "clock", x: 0, y: 0, w: 10, h: 4 },
      { i: "weather", x: 10, y: 0, w: 8, h: 4 },
      { i: "photos", x: 3, y: 4, w: 12, h: 16 },
      { i: "calendar", x: 0, y: 20, w: 18, h: 7 },
      { i: "chores", x: 0, y: 27, w: 18, h: 5 },
    ],
  },
  {
    id: "portrait-3-4",
    name: "Hearth Agenda · 3:4",
    ratioLabel: "3:4",
    cols: 15,
    rows: 20,
    calendarView: "list",
    daysToShow: 5,
    items: [
      { i: "clock", x: 0, y: 0, w: 8, h: 3 },
      { i: "weather", x: 8, y: 0, w: 7, h: 3 },
      { i: "photos", x: 1, y: 3, w: 13, h: 10 },
      { i: "calendar", x: 0, y: 13, w: 15, h: 4 },
      { i: "chores", x: 0, y: 17, w: 15, h: 3 },
    ],
    portraitPhotoItems: [
      { i: "clock", x: 0, y: 0, w: 8, h: 3 },
      { i: "weather", x: 8, y: 0, w: 7, h: 3 },
      { i: "photos", x: 3, y: 3, w: 9, h: 12 },
      { i: "calendar", x: 0, y: 15, w: 10, h: 5 },
      { i: "chores", x: 10, y: 15, w: 5, h: 5 },
    ],
  },
  {
    id: "square-1-1",
    name: "Hearth Focus · 1:1",
    ratioLabel: "1:1",
    cols: 16,
    rows: 16,
    calendarView: "week",
    daysToShow: 3,
    items: [
      { i: "clock", x: 0, y: 0, w: 9, h: 3 },
      { i: "weather", x: 9, y: 0, w: 7, h: 3 },
      { i: "calendar", x: 0, y: 3, w: 16, h: 7 },
      { i: "chores", x: 0, y: 10, w: 8, h: 6 },
      { i: "photos", x: 8, y: 10, w: 8, h: 6 },
    ],
    portraitPhotoItems: [
      { i: "clock", x: 0, y: 0, w: 9, h: 3 },
      { i: "weather", x: 9, y: 0, w: 7, h: 3 },
      { i: "photos", x: 0, y: 3, w: 7, h: 13 },
      { i: "calendar", x: 7, y: 3, w: 9, h: 8 },
      { i: "chores", x: 7, y: 11, w: 9, h: 5 },
    ],
  },
];

const buildStarterLayoutSeed = (
  definition: StarterLayoutDefinition,
  variant: "home" | "portrait-photo",
  homeItemsOverride?: StarterLayoutItem[],
  photoOrientationOverride?: "landscape" | "portrait",
): DefaultLayoutSeed => {
  const instanceId = (module: StarterLayoutItem["i"]) =>
    variant === "home"
      ? `starter-${definition.id}-${module}`
      : `starter-${definition.id}-portrait-photo-${module}`;
  const isPhotoVariant = variant === "portrait-photo";

  return {
    name: isPhotoVariant ? `Hearth Photo · ${definition.ratioLabel}` : definition.name,
    active: 0,
    config: {
      cols: definition.cols,
      rows: definition.rows,
      rowHeight: 54,
      items: (isPhotoVariant
        ? definition.portraitPhotoItems
        : (homeItemsOverride ?? definition.items)
      ).map((item) => ({
        ...item,
        i: instanceId(item.i),
      })),
      modules: [
        {
          id: instanceId("clock"),
          moduleId: "clock",
          config: { use24Hour: true, showSeconds: false, showDate: true },
        },
        {
          id: instanceId("weather"),
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
        ...(!isPhotoVariant &&
        (homeItemsOverride ?? definition.items).some((item) => item.i === "welcome")
          ? [
              {
                id: instanceId("welcome"),
                moduleId: "welcome",
                config: { message: "Our Family" },
              },
            ]
          : []),
        {
          id: instanceId("calendar"),
          moduleId: "calendar",
          config: {
            viewMode: definition.calendarView,
            calendars: [],
            calendarLabels: [],
            calendarColors: [],
            daysToShow: definition.daysToShow,
            use24Hour: true,
            refreshIntervalSeconds: 300,
          },
        },
        {
          id: instanceId("chores"),
          moduleId: "chores",
          config: { enableMoneyTracking: true, showStats: false },
        },
        {
          id: instanceId("photos"),
          moduleId: "photos",
          config: {
            folderPath: "/photos",
            collectionId: null,
            intervalSeconds: 20,
            shuffle: true,
            layoutOrientation:
              photoOrientationOverride ?? (isPhotoVariant ? "portrait" : "landscape"),
          },
        },
      ],
    },
  };
};

const STARTER_LAYOUT_SEEDS: DefaultLayoutSeed[] = STARTER_LAYOUT_DEFINITIONS.flatMap(
  (definition) => [
    buildStarterLayoutSeed(definition, "home"),
    buildStarterLayoutSeed(definition, "portrait-photo"),
  ],
);

const toStarterRule = (
  layoutName: string,
  trigger: AutoLayoutTarget["trigger"],
): AutoLayoutTarget => ({
  layoutName,
  trigger,
  cycleSeconds: 20,
  actionType: "layout.display",
  actionParams: {},
  conditionType: trigger === "portrait-photo" ? "photo.orientation.portrait" : null,
  conditionParams: {},
});

const STARTER_SCREEN_SETS = Object.fromEntries(
  STARTER_LAYOUT_DEFINITIONS.map((definition) => {
    const portraitPhotoLayoutName = `Hearth Photo · ${definition.ratioLabel}`;
    const alwaysRules = [toStarterRule(definition.name, "always")];
    const portraitRules = [toStarterRule(portraitPhotoLayoutName, "portrait-photo")];
    const logicGraph = createLayoutSetLogicGraphFromBranches({
      alwaysRules,
      portraitRules,
      landscapeRules: [],
    });

    return [
      `starter-${definition.id}`,
      {
        name: `Smart · ${definition.ratioLabel}`,
        targetAspectRatio: definition.cols / definition.rows,
        staticLayoutName: definition.name,
        logicGraph,
        logicEdgeOverrides: {},
        logicDisconnectedEdgeIds: [],
        autoLayoutTargets: [...alwaysRules, ...portraitRules],
        portraitPhotoLayoutName,
        landscapePhotoLayoutName: definition.name,
        portraitPhotoLayoutNames: [portraitPhotoLayoutName],
        landscapePhotoLayoutNames: [definition.name],
      },
    ];
  }),
);

const DEFAULT_SCREEN_PROFILE_LAYOUTS = {
  switchMode: "auto",
  autoCycleSeconds: 20,
  families: {
    ...STARTER_SCREEN_SETS,
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
      portraitPhotoLayoutNames: ["16:9 Standard Landscape", "16:9 Standard Portrait"],
      landscapePhotoLayoutNames: ["16:9 Standard Landscape"],
    },
  },
};

const SCREEN_PROFILE_LAYOUTS_KEY = "screen_profile_layouts";

const seedDefaultLayoutsAndSettings = (db: Database.Database): void => {
  const transaction = db.transaction(() => {
    const existingLayoutNames = new Set(
      db
        .prepare<[], { name: string }>("SELECT name FROM layouts")
        .all()
        .map((row) => row.name),
    );
    const hadExistingLayouts = existingLayoutNames.size > 0;
    const legacyDefaultNames = new Set(DEFAULT_LAYOUT_SEEDS.map((seed) => seed.name));
    const seeds = [...DEFAULT_LAYOUT_SEEDS, ...STARTER_LAYOUT_SEEDS];

    for (const seed of seeds) {
      if (existingLayoutNames.has(seed.name)) {
        const existing = db
          .prepare<
            { name: string },
            { id: number; version: number; config_json: string }
          >("SELECT id, version, config_json FROM layouts WHERE name = @name")
          .get({ name: seed.name });
        if (existing && existing.version < 3) {
          try {
            const existingConfig = JSON.parse(existing.config_json) as {
              modules?: Array<{ id?: unknown }>;
            };
            const seedConfig = seed.config as { modules?: Array<{ id?: unknown }> };
            const expectedModuleIds = new Set(
              seedConfig.modules?.flatMap((module) =>
                typeof module.id === "string" ? [module.id] : [],
              ) ?? [],
            );
            const hasCanonicalModules =
              expectedModuleIds.size > 0 &&
              existingConfig.modules?.length !== 0 &&
              existingConfig.modules?.every(
                (module) => typeof module.id === "string" && expectedModuleIds.has(module.id),
              );
            // Starter layouts are product-owned templates. Older releases normalized
            // their JSON (for example typography and legacyCalendars), so byte-for-byte
            // comparisons could leave the visibly old composition behind. Canonical
            // module IDs distinguish these templates from user-created layouts.
            const isUntouchedStarter = existing.version <= 2 && hasCanonicalModules;
            const configJson = JSON.stringify(seed.config);
            if (isUntouchedStarter && existing.config_json !== configJson) {
              db.prepare(
                "UPDATE layouts SET config_json = @configJson, version = 3, updated_at = CURRENT_TIMESTAMP WHERE id = @id",
              ).run({ id: existing.id, configJson });
              db.prepare(
                "INSERT OR IGNORE INTO layout_versions (layout_id, version, config_json) VALUES (@layoutId, 3, @configJson)",
              ).run({ layoutId: existing.id, configJson });
            }
          } catch {
            // Preserve malformed or user-modified layouts for manual recovery.
          }
        }
        continue;
      }

      if (hadExistingLayouts && legacyDefaultNames.has(seed.name)) {
        continue;
      }

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

    const existingSettings = db
      .prepare<{ key: string }, { value: string }>("SELECT value FROM settings WHERE key = @key")
      .get({ key: SCREEN_PROFILE_LAYOUTS_KEY });
    let screenProfileLayoutsValue = JSON.stringify(DEFAULT_SCREEN_PROFILE_LAYOUTS);

    if (existingSettings?.value) {
      try {
        const parsed = JSON.parse(existingSettings.value) as Record<string, unknown>;
        const currentFamilies =
          parsed.families && typeof parsed.families === "object" && !Array.isArray(parsed.families)
            ? (parsed.families as Record<string, unknown>)
            : {};
        const upgradedFamilies = Object.fromEntries(
          Object.entries(currentFamilies).map(([id, value]) => {
            const starter = STARTER_SCREEN_SETS[id];
            if (!starter || !value || typeof value !== "object" || Array.isArray(value)) {
              return [id, value];
            }
            const current = value as Record<string, unknown>;
            const nodes =
              current.logicGraph &&
              typeof current.logicGraph === "object" &&
              !Array.isArray(current.logicGraph) &&
              Array.isArray((current.logicGraph as { nodes?: unknown }).nodes)
                ? ((current.logicGraph as { nodes: Array<{ type?: unknown }> }).nodes ?? [])
                : [];
            const hasDisplayNodes = nodes.some((node) => node?.type === "display");
            const hasAuthoredTargets =
              Array.isArray(current.autoLayoutTargets) && current.autoLayoutTargets.length > 0;
            const isUntouchedStarter =
              current.staticLayoutName === starter.staticLayoutName &&
              !hasDisplayNodes &&
              !hasAuthoredTargets;
            return [id, isUntouchedStarter ? starter : value];
          }),
        );
        screenProfileLayoutsValue = JSON.stringify({
          ...parsed,
          families: {
            ...STARTER_SCREEN_SETS,
            ...upgradedFamilies,
          },
        });
      } catch {
        // Replace invalid historical settings with a valid starter configuration.
      }
    }

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
    "planner_templates",
    "repeat_days_json",
    "ALTER TABLE planner_templates ADD COLUMN repeat_days_json TEXT NOT NULL DEFAULT '[]'",
  );
  ensureColumnExists(db, "chores", "starts_on", "ALTER TABLE chores ADD COLUMN starts_on TEXT");
  ensureColumnExists(
    db,
    "devices",
    "last_seen_ip",
    "ALTER TABLE devices ADD COLUMN last_seen_ip TEXT",
  );
  ensureColumnExists(
    db,
    "devices",
    "device_info_json",
    "ALTER TABLE devices ADD COLUMN device_info_json TEXT",
  );

  ensureUniqueLayoutNames(db);
  ensureLayoutNameUniqueIndex(db);
  ensureUniqueDeviceNames(db);
  ensureDeviceNameUniqueIndex(db);
  ensurePlannerBlocksReferenceMembers(db);
  seedDefaultLayoutsAndSettings(db);

  return db;
};
