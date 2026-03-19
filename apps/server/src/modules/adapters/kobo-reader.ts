import { createReadStream, existsSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import Database from "better-sqlite3";
import {
  koboReaderCoverParamsSchema,
  koboReaderCurrentQuerySchema,
  koboReaderCurrentResponseSchema,
  koboReaderUsersResponseSchema,
  type KoboReaderCurrentResponse,
  type KoboReaderUser,
} from "@hearth/shared";
import type { ModuleServerAdapter } from "../types.js";
import { config } from "../../config.js";

const COVER_MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

class KoboReaderConfigurationError extends Error {}
class KoboReaderUnavailableError extends Error {}

interface KoboReaderPaths {
  appDbPath: string;
  libraryDbPath: string;
  libraryRoot: string;
}

interface KoboReadingStateRow {
  id: number;
  bookId: number;
}

interface KoboBookmarkRow {
  progressPercent: number | null;
  locationType: string | null;
  locationValue: string | null;
}

interface KoboStatisticsRow {
  remainingTimeMinutes: number | null;
  spentReadingMinutes: number | null;
}

interface KoboBookRow {
  id: number;
  title: string;
  path: string;
  hasCover: number;
  authorLabel: string | null;
  lastModified: string | null;
}

const resolveConfiguredKoboReaderPaths = (): KoboReaderPaths => {
  if (!config.koboReaderAppDbPath) {
    throw new KoboReaderConfigurationError(
      "Kobo Reader is not configured. Set KOBO_READER_APP_DB_PATH and mount the Calibre-Web config folder read-only into the Hearth container.",
    );
  }

  if (!config.koboReaderLibraryDbPath) {
    throw new KoboReaderConfigurationError(
      "Kobo Reader is not configured. Set KOBO_READER_LIBRARY_DB_PATH and mount the Calibre library read-only into the Hearth container.",
    );
  }

  const libraryRoot = config.koboReaderLibraryRoot ?? dirname(config.koboReaderLibraryDbPath);

  if (!existsSync(dirname(config.koboReaderAppDbPath)) || !existsSync(config.koboReaderAppDbPath)) {
    throw new KoboReaderUnavailableError(
      "Kobo Reader data is not available in this environment. Check that the Calibre-Web config folder is mounted and KOBO_READER_APP_DB_PATH points to a real file.",
    );
  }

  if (
    !existsSync(dirname(config.koboReaderLibraryDbPath)) ||
    !existsSync(config.koboReaderLibraryDbPath)
  ) {
    throw new KoboReaderUnavailableError(
      "Kobo Reader library data is not available in this environment. Check that the Calibre library is mounted and KOBO_READER_LIBRARY_DB_PATH points to a real file.",
    );
  }

  if (!existsSync(libraryRoot)) {
    throw new KoboReaderUnavailableError(
      "Kobo Reader library root is not available in this environment. Check that KOBO_READER_LIBRARY_ROOT points to the mounted Calibre library.",
    );
  }

  return {
    appDbPath: config.koboReaderAppDbPath,
    libraryDbPath: config.koboReaderLibraryDbPath,
    libraryRoot,
  };
};

const openReadonlyDatabase = (filePath: string): Database.Database =>
  new Database(filePath, {
    readonly: true,
    fileMustExist: true,
  });

const classifyKoboReaderError = (error: unknown): Error => {
  if (
    error instanceof KoboReaderConfigurationError ||
    error instanceof KoboReaderUnavailableError
  ) {
    return error;
  }

  if (!(error instanceof Error)) {
    return new Error("Failed to load Kobo reading data.");
  }

  const normalizedMessage = error.message.toLowerCase();
  if (
    normalizedMessage.includes("unable to open database file") ||
    normalizedMessage.includes("directory does not exist") ||
    normalizedMessage.includes("no such file or directory") ||
    normalizedMessage.includes("cannot open database")
  ) {
    return new KoboReaderUnavailableError(
      "Kobo Reader data is not available in this environment. Check that the Kobo and Calibre folders are mounted and reachable by the server.",
    );
  }

  return error;
};

const withReadonlyDatabase = <T>(filePath: string, run: (db: Database.Database) => T): T => {
  const db = openReadonlyDatabase(filePath);

  try {
    return run(db);
  } finally {
    db.close();
  }
};

const resolveContainedPath = (rootPath: string, ...segments: string[]): string | null => {
  const resolvedRoot = resolve(rootPath);
  const candidatePath = resolve(rootPath, ...segments);

  if (candidatePath === resolvedRoot || candidatePath.startsWith(`${resolvedRoot}${sep}`)) {
    return candidatePath;
  }

  return null;
};

const listUsers = (paths: KoboReaderPaths): KoboReaderUser[] =>
  withReadonlyDatabase(paths.appDbPath, (db) => {
    const rows = db
      .prepare<[], { id: number; name: string | null }>(
        `
        SELECT id, name
        FROM user
        WHERE TRIM(COALESCE(name, '')) <> ''
        ORDER BY name COLLATE NOCASE ASC
        `,
      )
      .all();

    return rows.flatMap((row) => {
      const name = row.name?.trim() ?? "";
      if (name.length === 0) {
        return [];
      }

      return [{ id: row.id, name }];
    });
  });

const findLatestReadingState = (
  db: Database.Database,
  userName: string,
): KoboReadingStateRow | null =>
  db
    .prepare<[string], KoboReadingStateRow>(
      `
      SELECT
        rs.id AS id,
        rs.book_id AS bookId
      FROM kobo_reading_state rs
      INNER JOIN user u ON u.id = rs.user_id
      WHERE u.name = ?
      ORDER BY (
        SELECT MAX(ts)
        FROM (
          SELECT rs.last_modified AS ts
          UNION ALL
          SELECT rs.priority_timestamp AS ts
          UNION ALL
          SELECT MAX(last_modified) AS ts
          FROM kobo_bookmark
          WHERE kobo_reading_state_id = rs.id
          UNION ALL
          SELECT MAX(last_modified) AS ts
          FROM kobo_statistics
          WHERE kobo_reading_state_id = rs.id
        )
      ) DESC,
      rs.id DESC
      LIMIT 1
      `,
    )
    .get(userName) ?? null;

const findLatestBookmark = (db: Database.Database, stateId: number): KoboBookmarkRow | null =>
  db
    .prepare<[number], KoboBookmarkRow>(
      `
      SELECT
        progress_percent AS progressPercent,
        location_type AS locationType,
        location_value AS locationValue
      FROM kobo_bookmark
      WHERE kobo_reading_state_id = ?
      ORDER BY COALESCE(last_modified, '') DESC, id DESC
      LIMIT 1
      `,
    )
    .get(stateId) ?? null;

const findLatestStatistics = (db: Database.Database, stateId: number): KoboStatisticsRow | null =>
  db
    .prepare<[number], KoboStatisticsRow>(
      `
      SELECT
        remaining_time_minutes AS remainingTimeMinutes,
        spent_reading_minutes AS spentReadingMinutes
      FROM kobo_statistics
      WHERE kobo_reading_state_id = ?
      ORDER BY COALESCE(last_modified, '') DESC, id DESC
      LIMIT 1
      `,
    )
    .get(stateId) ?? null;

const findBookById = (db: Database.Database, bookId: number): KoboBookRow | null =>
  db
    .prepare<[number], KoboBookRow>(
      `
      SELECT
        b.id AS id,
        b.title AS title,
        b.path AS path,
        b.has_cover AS hasCover,
        COALESCE(GROUP_CONCAT(a.name, ', '), 'Unknown author') AS authorLabel,
        b.last_modified AS lastModified
      FROM books b
      LEFT JOIN books_authors_link bal ON bal.book = b.id
      LEFT JOIN authors a ON a.id = bal.author
      WHERE b.id = ?
      GROUP BY b.id
      `,
    )
    .get(bookId) ?? null;

const resolveCoverFilePath = (
  paths: KoboReaderPaths,
  bookId: number,
): { coverFilePath: string; version: string | null } | null =>
  withReadonlyDatabase(paths.libraryDbPath, (db) => {
    const book = findBookById(db, bookId);
    if (!book || book.hasCover !== 1) {
      return null;
    }

    const coverFilePath = resolveContainedPath(paths.libraryRoot, book.path, "cover.jpg");
    if (!coverFilePath) {
      return null;
    }

    if (!existsSync(coverFilePath)) {
      return null;
    }

    return {
      coverFilePath,
      version: book.lastModified ?? null,
    };
  });

export const readLatestKoboBook = (userName: string): KoboReaderCurrentResponse => {
  const paths = resolveConfiguredKoboReaderPaths();
  const trimmedUserName = userName.trim();

  if (trimmedUserName.length === 0) {
    return koboReaderCurrentResponseSchema.parse({
      generatedAt: new Date().toISOString(),
      userName,
      book: null,
      warning: "Select a Kobo user to view reading progress.",
    });
  }

  const state = withReadonlyDatabase(paths.appDbPath, (db) => {
    const latestState = findLatestReadingState(db, trimmedUserName);
    if (!latestState) {
      return null;
    }

    return {
      state: latestState,
      bookmark: findLatestBookmark(db, latestState.id),
      statistics: findLatestStatistics(db, latestState.id),
    };
  });

  if (!state) {
    return koboReaderCurrentResponseSchema.parse({
      generatedAt: new Date().toISOString(),
      userName: trimmedUserName,
      book: null,
      warning: `No Kobo reading data found for '${trimmedUserName}'.`,
    });
  }

  const book = withReadonlyDatabase(paths.libraryDbPath, (db) =>
    findBookById(db, state.state.bookId),
  );
  if (!book) {
    return koboReaderCurrentResponseSchema.parse({
      generatedAt: new Date().toISOString(),
      userName: trimmedUserName,
      book: null,
      warning: `Book ${state.state.bookId} exists in Calibre-Web but was not found in the Calibre library database.`,
    });
  }

  const coverImage = book.hasCover === 1 ? resolveCoverFilePath(paths, book.id) : null;

  return koboReaderCurrentResponseSchema.parse({
    generatedAt: new Date().toISOString(),
    userName: trimmedUserName,
    book: {
      id: book.id,
      title: book.title,
      authorLabel: book.authorLabel ?? "Unknown author",
      coverImageUrl: coverImage
        ? `/api/modules/kobo-reader/cover/${book.id}?v=${encodeURIComponent(coverImage.version ?? "1")}`
        : null,
    },
    progressPercent: state.bookmark?.progressPercent ?? 0,
    locationType: state.bookmark?.locationType ?? null,
    locationValue: state.bookmark?.locationValue ?? null,
    spentReadingMinutes: state.statistics?.spentReadingMinutes ?? null,
    remainingReadingMinutes: state.statistics?.remainingTimeMinutes ?? null,
  });
};

export const readKoboUsers = () => {
  const paths = resolveConfiguredKoboReaderPaths();

  return koboReaderUsersResponseSchema.parse({
    generatedAt: new Date().toISOString(),
    users: listUsers(paths),
  });
};

export const koboReaderAdapter: ModuleServerAdapter = {
  id: "kobo-reader",
  registerRoutes: (app) => {
    app.get("/users", async (request, reply) => {
      try {
        return reply.header("cache-control", "no-store").send(readKoboUsers());
      } catch (error) {
        const classifiedError = classifyKoboReaderError(error);
        const message = classifiedError.message || "Failed to load Kobo users.";
        const statusCode =
          classifiedError instanceof KoboReaderConfigurationError ||
          classifiedError instanceof KoboReaderUnavailableError
            ? 503
            : 500;
        return reply.code(statusCode).send({ message });
      }
    });

    app.get("/current", async (request, reply) => {
      const parsedQuery = koboReaderCurrentQuerySchema.safeParse(request.query ?? {});
      if (!parsedQuery.success) {
        return reply.code(400).send({ message: parsedQuery.error.message });
      }

      try {
        return reply
          .header("cache-control", "no-store")
          .send(readLatestKoboBook(parsedQuery.data.userName));
      } catch (error) {
        const classifiedError = classifyKoboReaderError(error);
        const message = classifiedError.message || "Failed to load Kobo reading data.";
        const statusCode =
          classifiedError instanceof KoboReaderConfigurationError ||
          classifiedError instanceof KoboReaderUnavailableError
            ? 503
            : 500;
        return reply.code(statusCode).send({ message });
      }
    });

    app.get("/cover/:bookId", async (request, reply) => {
      const parsedParams = koboReaderCoverParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.code(400).send({ message: parsedParams.error.message });
      }

      try {
        const paths = resolveConfiguredKoboReaderPaths();
        const cover = resolveCoverFilePath(paths, parsedParams.data.bookId);
        if (!cover) {
          return reply.code(404).send({ message: "Cover image not found." });
        }

        const mimeType =
          COVER_MIME_TYPES[extname(cover.coverFilePath).toLowerCase()] ?? "image/jpeg";
        reply.header("Cache-Control", "public, max-age=31536000, immutable");
        reply.type(mimeType);
        return reply.send(createReadStream(cover.coverFilePath));
      } catch (error) {
        const classifiedError = classifyKoboReaderError(error);
        const message = classifiedError.message || "Failed to load Kobo cover image.";
        const statusCode =
          classifiedError instanceof KoboReaderConfigurationError ||
          classifiedError instanceof KoboReaderUnavailableError
            ? 503
            : 500;
        return reply.code(statusCode).send({ message });
      }
    });
  },
  healthCheck: () => {
    try {
      const paths = resolveConfiguredKoboReaderPaths();
      const users = listUsers(paths);
      return {
        ok: true,
        details: {
          users: users.length,
        },
      };
    } catch (error) {
      return {
        ok: false,
        details: {
          message: error instanceof Error ? error.message : "Kobo Reader not configured.",
        },
      };
    }
  },
};
