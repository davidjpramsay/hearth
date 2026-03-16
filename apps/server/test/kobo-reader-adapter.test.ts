import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import Fastify from "fastify";
import { config } from "../src/config.js";
import { koboReaderAdapter } from "../src/modules/adapters/kobo-reader.js";

const createAppDatabase = (filePath: string): void => {
  const db = new Database(filePath);

  try {
    db.exec(`
      CREATE TABLE user (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(64)
      );
      CREATE TABLE kobo_reading_state (
        id INTEGER PRIMARY KEY,
        user_id INTEGER,
        book_id INTEGER,
        last_modified DATETIME,
        priority_timestamp DATETIME
      );
      CREATE TABLE kobo_bookmark (
        id INTEGER PRIMARY KEY,
        kobo_reading_state_id INTEGER,
        last_modified DATETIME,
        location_type VARCHAR,
        location_value VARCHAR,
        progress_percent FLOAT
      );
      CREATE TABLE kobo_statistics (
        id INTEGER PRIMARY KEY,
        kobo_reading_state_id INTEGER,
        last_modified DATETIME,
        remaining_time_minutes INTEGER,
        spent_reading_minutes INTEGER
      );
    `);

    db.prepare(`INSERT INTO user (id, name) VALUES (?, ?), (?, ?)`).run(1, "admin", 2, "guest");
    db.prepare(
      `
      INSERT INTO kobo_reading_state (id, user_id, book_id, last_modified, priority_timestamp)
      VALUES
        (1, 1, 45, '2026-03-10 13:13:17.211949', '2026-03-10 13:13:17.212546'),
        (2, 2, 72, '2026-03-09 08:51:44.940198', '2026-03-09 08:51:44.941461')
      `,
    ).run();
    db.prepare(
      `
      INSERT INTO kobo_bookmark (id, kobo_reading_state_id, last_modified, location_type, location_value, progress_percent)
      VALUES
        (1, 1, '2026-03-10 13:13:17.209231', 'KoboSpan', 'kobo.20.11', 23.0),
        (2, 2, '2026-03-09 08:51:44.941762', 'KoboSpan', 'kobo.1.1', 5.0)
      `,
    ).run();
    db.prepare(
      `
      INSERT INTO kobo_statistics (id, kobo_reading_state_id, last_modified, remaining_time_minutes, spent_reading_minutes)
      VALUES
        (1, 1, '2026-03-10 13:13:17.210802', 362, 175),
        (2, 2, '2026-03-09 08:51:44.942035', 900, 30)
      `,
    ).run();
  } finally {
    db.close();
  }
};

const createLibraryDatabase = (libraryRoot: string, filePath: string): void => {
  const db = new Database(filePath);

  try {
    db.exec(`
      CREATE TABLE books (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        path TEXT NOT NULL DEFAULT '',
        has_cover BOOL DEFAULT 0,
        last_modified TIMESTAMP NOT NULL DEFAULT '2000-01-01 00:00:00+00:00'
      );
      CREATE TABLE authors (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL
      );
      CREATE TABLE books_authors_link (
        id INTEGER PRIMARY KEY,
        book INTEGER NOT NULL,
        author INTEGER NOT NULL
      );
    `);

    db.prepare(
      `
      INSERT INTO books (id, title, path, has_cover, last_modified)
      VALUES
        (45, 'The Adventures of Huckleberry Finn', 'Mark Twain/The Adventures of Huckleberry Finn (45)', 1, '2026-03-10 13:13:17'),
        (72, 'The Swiss Family Robinson', 'Johann David Wyss/The Swiss Family Robinson (72)', 0, '2026-03-09 08:51:44'),
        (99, 'Escape Attempt', '../../escape-attempt', 1, '2026-03-10 14:00:00')
      `,
    ).run();
    db.prepare(
      `
      INSERT INTO authors (id, name)
      VALUES
        (1, 'Mark Twain'),
        (2, 'Johann David Wyss')
      `,
    ).run();
    db.prepare(
      `
      INSERT INTO books_authors_link (id, book, author)
      VALUES
        (1, 45, 1),
        (2, 72, 2)
      `,
    ).run();
  } finally {
    db.close();
  }

  const coverPath = join(
    libraryRoot,
    "Mark Twain",
    "The Adventures of Huckleberry Finn (45)",
    "cover.jpg",
  );
  mkdirSync(dirname(coverPath), { recursive: true });
  writeFileSync(coverPath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

  const escapedCoverPath = join(dirname(libraryRoot), "escape-attempt", "cover.jpg");
  mkdirSync(dirname(escapedCoverPath), { recursive: true });
  writeFileSync(escapedCoverPath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
};

const createHarness = async () => {
  const directory = mkdtempSync(join(tmpdir(), "hearth-kobo-reader-"));
  const appDbPath = join(directory, "app.db");
  const libraryRoot = join(directory, "library");
  const libraryDbPath = join(libraryRoot, "metadata.db");

  mkdirSync(libraryRoot, { recursive: true });
  createAppDatabase(appDbPath);
  createLibraryDatabase(libraryRoot, libraryDbPath);

  const originalConfig = {
    koboReaderAppDbPath: config.koboReaderAppDbPath,
    koboReaderLibraryDbPath: config.koboReaderLibraryDbPath,
    koboReaderLibraryRoot: config.koboReaderLibraryRoot,
  };

  config.koboReaderAppDbPath = appDbPath;
  config.koboReaderLibraryDbPath = libraryDbPath;
  config.koboReaderLibraryRoot = libraryRoot;

  const app = Fastify();
  koboReaderAdapter.registerRoutes(app, {
    eventBus: {
      publish: () => {},
      subscribe: () => () => {},
    },
    processStartedAtMs: Date.now(),
  });
  await app.ready();

  return {
    app,
    dispose: async () => {
      config.koboReaderAppDbPath = originalConfig.koboReaderAppDbPath;
      config.koboReaderLibraryDbPath = originalConfig.koboReaderLibraryDbPath;
      config.koboReaderLibraryRoot = originalConfig.koboReaderLibraryRoot;
      await app.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
};

test("kobo reader adapter lists users and returns the latest book for a user", async () => {
  const harness = await createHarness();

  try {
    const usersResponse = await harness.app.inject({
      method: "GET",
      url: "/users",
    });
    assert.equal(usersResponse.statusCode, 200);
    assert.deepEqual(usersResponse.json().users, [
      { id: 1, name: "admin" },
      { id: 2, name: "guest" },
    ]);

    const currentResponse = await harness.app.inject({
      method: "GET",
      url: "/current?userName=admin",
    });
    assert.equal(currentResponse.statusCode, 200);

    const currentPayload = currentResponse.json();
    assert.equal(currentPayload.userName, "admin");
    assert.equal(currentPayload.book.title, "The Adventures of Huckleberry Finn");
    assert.equal(currentPayload.book.authorLabel, "Mark Twain");
    assert.match(currentPayload.book.coverImageUrl, /\/api\/modules\/kobo-reader\/cover\/45\?v=/);
    assert.equal(currentPayload.progressPercent, 23);
    assert.equal(currentPayload.spentReadingMinutes, 175);
    assert.equal(currentPayload.remainingReadingMinutes, 362);
  } finally {
    await harness.dispose();
  }
});

test("kobo reader adapter streams cover art for the latest book", async () => {
  const harness = await createHarness();

  try {
    const response = await harness.app.inject({
      method: "GET",
      url: "/cover/45",
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["content-type"], "image/jpeg");
    assert.ok(response.rawPayload.length > 0);
  } finally {
    await harness.dispose();
  }
});

test("kobo reader adapter rejects cover paths that escape the library root", async () => {
  const harness = await createHarness();

  try {
    const response = await harness.app.inject({
      method: "GET",
      url: "/cover/99",
    });

    assert.equal(response.statusCode, 404);
  } finally {
    await harness.dispose();
  }
});

test("kobo reader adapter returns a friendly unavailable message when mounted paths are missing", async () => {
  const harness = await createHarness();
  const originalPaths = {
    appDbPath: config.koboReaderAppDbPath,
    libraryDbPath: config.koboReaderLibraryDbPath,
    libraryRoot: config.koboReaderLibraryRoot,
  };

  try {
    config.koboReaderAppDbPath = "/tmp/hearth-missing-kobo-share/app.db";
    config.koboReaderLibraryDbPath = "/tmp/hearth-missing-kobo-share/metadata.db";
    config.koboReaderLibraryRoot = "/tmp/hearth-missing-kobo-share/library";

    const response = await harness.app.inject({
      method: "GET",
      url: "/current?userName=admin",
    });

    assert.equal(response.statusCode, 503);
    assert.match(
      response.json().message,
      /Kobo Reader data is not available in this environment|Kobo Reader library data is not available in this environment/,
    );
  } finally {
    config.koboReaderAppDbPath = originalPaths.appDbPath;
    config.koboReaderLibraryDbPath = originalPaths.libraryDbPath;
    config.koboReaderLibraryRoot = originalPaths.libraryRoot;
    await harness.dispose();
  }
});
