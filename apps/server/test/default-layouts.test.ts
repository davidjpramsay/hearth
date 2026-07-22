import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createDatabase } from "../src/db.js";

test("fresh installs seed the polished interactive home layout", () => {
  const directory = mkdtempSync(join(tmpdir(), "hearth-default-layouts-"));
  try {
    const db = createDatabase(join(directory, "hearth.sqlite"));
    const row = db
      .prepare("SELECT config_json FROM layouts WHERE name = ?")
      .get("16:9 Standard Landscape") as { config_json: string };
    const config = JSON.parse(row.config_json) as {
      items: Array<{ i: string; x: number; y: number; w: number; h: number }>;
    };

    assert.deepEqual(
      config.items.find((item) => item.i === "mod-37fc8626-bafa-4d11-a155-fd8c64d0a31e"),
      { i: "mod-37fc8626-bafa-4d11-a155-fd8c64d0a31e", x: 0, y: 4, w: 25, h: 16 },
    );
    assert.deepEqual(
      config.items.find((item) => item.i === "mod-871c01c0-6597-47b7-8439-26a8b16f6338"),
      { i: "mod-871c01c0-6597-47b7-8439-26a8b16f6338", x: 25, y: 0, w: 10, h: 10 },
    );
    db.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("fresh installs include photo-aware smart layouts for common screen ratios", () => {
  const directory = mkdtempSync(join(tmpdir(), "hearth-smart-layouts-"));
  try {
    const db = createDatabase(join(directory, "hearth.sqlite"));
    const photoRow = db
      .prepare("SELECT config_json FROM layouts WHERE name = ?")
      .get("Hearth Photo · 16:9") as { config_json: string };
    const photoConfig = JSON.parse(photoRow.config_json) as {
      items: Array<{ i: string; x: number; y: number; w: number; h: number }>;
    };

    assert.deepEqual(
      photoConfig.items.find((item) => item.i === "starter-wide-16-9-portrait-photo-photos"),
      { i: "starter-wide-16-9-portrait-photo-photos", x: 19, y: 0, w: 13, h: 18 },
    );

    const settingsRow = db
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get("screen_profile_layouts") as { value: string };
    const settings = JSON.parse(settingsRow.value) as {
      families: Record<
        string,
        {
          name: string;
          staticLayoutName: string;
          autoLayoutTargets: Array<{ layoutName: string; trigger: string }>;
          logicGraph: { nodes: Array<{ type: string; layoutName?: string }> };
        }
      >;
    };
    const wideSet = settings.families["starter-wide-16-9"];

    assert.equal(wideSet.name, "Smart · 16:9");
    assert.equal(wideSet.staticLayoutName, "Hearth Week · 16:9");
    assert.deepEqual(
      wideSet.autoLayoutTargets.map(({ layoutName, trigger }) => ({ layoutName, trigger })),
      [
        { layoutName: "Hearth Week · 16:9", trigger: "always" },
        { layoutName: "Hearth Photo · 16:9", trigger: "portrait-photo" },
      ],
    );
    assert.ok(
      wideSet.logicGraph.nodes.some(
        (node) => node.type === "display" && node.layoutName === "Hearth Photo · 16:9",
      ),
    );
    db.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("untouched starter layouts migrate to the polished arrangement", () => {
  const directory = mkdtempSync(join(tmpdir(), "hearth-starter-migration-"));
  const filePath = join(directory, "hearth.sqlite");
  try {
    const db = createDatabase(filePath);
    const row = db
      .prepare("SELECT id, config_json FROM layouts WHERE name = ?")
      .get("Hearth Week · 16:9") as { id: number; config_json: string };
    const oldConfig = JSON.parse(row.config_json) as { items: unknown[] };
    oldConfig.items = [];
    db.prepare("UPDATE layouts SET config_json = ?, version = 1 WHERE id = ?").run(
      JSON.stringify(oldConfig),
      row.id,
    );
    db.close();

    const migratedDb = createDatabase(filePath);
    const migrated = migratedDb
      .prepare("SELECT version, config_json FROM layouts WHERE id = ?")
      .get(row.id) as { version: number; config_json: string };
    const migratedConfig = JSON.parse(migrated.config_json) as {
      items: Array<{ i: string; y: number }>;
    };
    assert.equal(migrated.version, 2);
    assert.equal(migratedConfig.items.find((item) => item.i === "starter-wide-16-9-photos")?.y, 0);
    assert.equal(migratedConfig.items.find((item) => item.i === "starter-wide-16-9-chores")?.y, 9);
    migratedDb.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("untouched starter sets upgrade to photo-aware switching without replacing custom sets", () => {
  const directory = mkdtempSync(join(tmpdir(), "hearth-starter-set-migration-"));
  const filePath = join(directory, "hearth.sqlite");
  try {
    const db = createDatabase(filePath);
    const settingsRow = db
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get("screen_profile_layouts") as { value: string };
    const settings = JSON.parse(settingsRow.value) as {
      families: Record<string, Record<string, unknown>>;
    };
    settings.families["starter-wide-16-9"] = {
      name: "16:9 Starter",
      targetAspectRatio: 16 / 9,
      staticLayoutName: "Hearth Week · 16:9",
    };
    settings.families["custom-family"] = {
      name: "My custom set",
      staticLayoutName: "16:9 Standard Landscape",
    };
    db.prepare("UPDATE settings SET value = ? WHERE key = ?").run(
      JSON.stringify(settings),
      "screen_profile_layouts",
    );
    db.close();

    const migratedDb = createDatabase(filePath);
    const migratedRow = migratedDb
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get("screen_profile_layouts") as { value: string };
    const migrated = JSON.parse(migratedRow.value) as {
      families: Record<string, Record<string, unknown>>;
    };

    assert.equal(migrated.families["starter-wide-16-9"]?.name, "Smart · 16:9");
    assert.ok(Array.isArray(migrated.families["starter-wide-16-9"]?.autoLayoutTargets));
    assert.deepEqual(migrated.families["custom-family"], settings.families["custom-family"]);
    migratedDb.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
