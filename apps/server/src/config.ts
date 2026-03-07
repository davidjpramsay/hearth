import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
  const isDoubleQuoted = value.startsWith("\"") && value.endsWith("\"");
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

const loadEnvDefaultsFromFile = (filePath: string): void => {
  if (!existsSync(filePath)) {
    return;
  }

  const contents = readFileSync(filePath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const entry = parseEnvEntry(line);
    if (!entry) {
      continue;
    }
    if (process.env[entry.key] !== undefined) {
      continue;
    }
    process.env[entry.key] = entry.value;
  }
};

const loadEnvDefaults = (): void => {
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "../.env"),
    resolve(process.cwd(), "../../.env"),
    resolve(currentDir, "../../.env"),
    resolve(currentDir, "../../../.env"),
    resolve(currentDir, "../.env"),
  ];

  const seen = new Set<string>();
  for (const candidatePath of candidates) {
    const normalized = resolve(candidatePath);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    loadEnvDefaultsFromFile(normalized);
  }
};

loadEnvDefaults();

const resolvePath = (value: string): string =>
  isAbsolute(value) ? value : resolve(process.cwd(), value);

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

const parseCsv = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

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

const jwtSecret = (process.env.JWT_SECRET ?? "").trim() || readOrCreateSecret(join(dataDir, ".jwt-secret"));
const calendarEncryptionSecret =
  (process.env.CALENDAR_ENCRYPTION_KEY ?? "").trim() ||
  readOrCreateSecret(join(dataDir, ".calendar-key"));
const backupDir = resolvePath(process.env.BACKUP_DIR ?? join(dataDir, "backups"));
mkdirSync(backupDir, { recursive: true });

export const config = {
  appName: process.env.APP_NAME ?? "Hearth",
  host: process.env.HOST ?? "0.0.0.0",
  port: Number(process.env.PORT ?? 3000),
  dataDir,
  dbPath: resolvePath(process.env.DB_PATH ?? defaultDbPath),
  adminBootstrapPassword: (process.env.ADMIN_PASSWORD ?? "").trim(),
  jwtSecret,
  calendarEncryptionSecret,
  backupDir,
  backupIntervalMinutes: parsePositiveNumber(process.env.BACKUP_INTERVAL_MINUTES, 360),
  backupRetentionDays: parsePositiveNumber(process.env.BACKUP_RETENTION_DAYS, 30),
  corsOrigins: parseCsv(process.env.CORS_ORIGINS),
  esvApiKey: (process.env.ESV_API_KEY ?? "").trim(),
  webDistPath: resolve(currentDir, "../../web/dist"),
};
