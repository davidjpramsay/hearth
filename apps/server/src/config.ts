import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isValidIanaTimeZone } from "@hearth/shared";

const currentDir = dirname(fileURLToPath(import.meta.url));

const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

const parseEnvEntry = (line: string): { key: string; value: string } | null => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const body = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
  const separatorIndex = body.indexOf("=");
  if (separatorIndex <= 0) {
    return null;
  }

  const key = body.slice(0, separatorIndex).trim();
  if (!ENV_KEY_PATTERN.test(key)) {
    return null;
  }

  let value = body.slice(separatorIndex + 1).trim();
  const isSingleQuoted = value.startsWith("'") && value.endsWith("'");
  const isDoubleQuoted = value.startsWith('"') && value.endsWith('"');
  if (isSingleQuoted || isDoubleQuoted) {
    value = value.slice(1, -1);
  } else {
    const commentIndex = value.indexOf(" #");
    if (commentIndex >= 0) {
      value = value.slice(0, commentIndex).trim();
    }
  }

  return {
    key,
    value: value.replace(/\\n/g, "\n"),
  };
};

const loadEnvDefaults = (): void => {
  const externalEnvKeys = new Set(Object.keys(process.env));
  const workspaceRoot = resolve(currentDir, "../../..");
  const serverRoot = resolve(currentDir, "..");
  const candidatePaths = [
    resolve(workspaceRoot, ".env"),
    resolve(serverRoot, ".env"),
    resolve(workspaceRoot, ".env.local"),
    resolve(serverRoot, ".env.local"),
  ];

  const seen = new Set<string>();
  const loadedFileKeys = new Set<string>();
  const localOverrideKeys = new Set<string>();

  for (const candidatePath of candidatePaths) {
    const normalized = resolve(candidatePath);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);

    const contents = existsSync(normalized) ? readFileSync(normalized, "utf8") : null;
    if (contents === null) {
      continue;
    }

    const isLocalOverride = normalized.endsWith(".env.local");

    for (const line of contents.split(/\r?\n/)) {
      const entry = parseEnvEntry(line);
      if (!entry) {
        continue;
      }
      if (externalEnvKeys.has(entry.key)) {
        continue;
      }
      if (!isLocalOverride && (loadedFileKeys.has(entry.key) || localOverrideKeys.has(entry.key))) {
        continue;
      }
      process.env[entry.key] = entry.value;
      if (isLocalOverride) {
        localOverrideKeys.add(entry.key);
      } else {
        loadedFileKeys.add(entry.key);
      }
    }
  }
};

loadEnvDefaults();

const resolvePath = (value: string): string =>
  isAbsolute(value) ? value : resolve(process.cwd(), value);

const resolveOptionalPath = (value: string | undefined): string | null => {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? resolvePath(trimmed) : null;
};

const parsePositiveNumber = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
};

const parseBoolean = (value: string | undefined): boolean => {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
};

const parseCsv = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

const parseOptionalTimeZone = (value: string | undefined): string | null => {
  const candidate = (value ?? "").trim();
  if (candidate.length === 0 || !isValidIanaTimeZone(candidate)) {
    return null;
  }

  return candidate;
};

const readOrCreateSecret = (filePath: string): string => {
  const existing = existsSync(filePath) ? readFileSync(filePath, "utf8").trim() : "";
  if (existing.length >= 32) {
    return existing;
  }

  const generated = randomBytes(48).toString("base64url");
  writeFileSync(filePath, `${generated}\n`, {
    mode: 0o600,
    encoding: "utf8",
  });

  return generated;
};

const legacyDataDir = resolve(currentDir, "../../../data");
const homeDataDir = join(homedir(), ".hearth");
const defaultDataDir =
  existsSync(join(legacyDataDir, "hearth.db")) || existsSync(join(legacyDataDir, "family-hub.db"))
    ? legacyDataDir
    : homeDataDir;
const dataDir = resolvePath(process.env.DATA_DIR ?? defaultDataDir);
mkdirSync(dataDir, { recursive: true });

const legacyDbPath = join(dataDir, "family-hub.db");
const defaultDbPath =
  existsSync(legacyDbPath) && !existsSync(join(dataDir, "hearth.db"))
    ? legacyDbPath
    : join(dataDir, "hearth.db");

const jwtSecret =
  (process.env.JWT_SECRET ?? "").trim() || readOrCreateSecret(join(dataDir, ".jwt-secret"));
const calendarEncryptionSecret =
  (process.env.CALENDAR_ENCRYPTION_KEY ?? "").trim() ||
  readOrCreateSecret(join(dataDir, ".calendar-key"));
const backupDir = resolvePath(process.env.BACKUP_DIR ?? join(dataDir, "backups"));
mkdirSync(backupDir, { recursive: true });

export const config = {
  nodeEnv: (process.env.NODE_ENV ?? "development").trim() || "development",
  appName: process.env.APP_NAME ?? "Hearth",
  host: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 3000),
  dataDir,
  dbPath: resolvePath(process.env.DB_PATH ?? defaultDbPath),
  adminBootstrapPassword: (process.env.ADMIN_PASSWORD ?? "").trim(),
  jwtSecret,
  calendarEncryptionSecret,
  backupDir,
  backupIntervalMinutes: parsePositiveNumber(process.env.BACKUP_INTERVAL_MINUTES, 360),
  backupRetentionDays: parsePositiveNumber(process.env.BACKUP_RETENTION_DAYS, 30),
  defaultSiteTimeZone:
    parseOptionalTimeZone(process.env.DEFAULT_SITE_TIMEZONE) ??
    parseOptionalTimeZone(process.env.TZ),
  corsOrigins: parseCsv(process.env.CORS_ORIGINS),
  esvApiKey: (process.env.ESV_API_KEY ?? "").trim(),
  koboReaderAppDbPath: resolveOptionalPath(process.env.KOBO_READER_APP_DB_PATH),
  koboReaderLibraryDbPath: resolveOptionalPath(process.env.KOBO_READER_LIBRARY_DB_PATH),
  koboReaderLibraryRoot: resolveOptionalPath(process.env.KOBO_READER_LIBRARY_ROOT),
  localWarningDevForceActive:
    (process.env.NODE_ENV ?? "development").trim() !== "production" &&
    parseBoolean(process.env.LOCAL_WARNING_DEV_FORCE_ACTIVE),
  webDistPath: resolve(currentDir, "../../web/dist"),
};
