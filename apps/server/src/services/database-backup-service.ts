import { readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import type Database from "better-sqlite3";

interface DatabaseBackupServiceOptions {
  backupDir: string;
  intervalMinutes: number;
  retentionDays: number;
  logger?: {
    info: (message: string) => void;
    error: (message: string) => void;
  };
}

const toBackupTimestamp = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
};

const BACKUP_FILE_PREFIX = "hearth-";
const BACKUP_FILE_SUFFIX = ".db";

export class DatabaseBackupService {
  private readonly backupDir: string;
  private readonly intervalMs: number;
  private readonly retentionMs: number;
  private readonly logger: {
    info: (message: string) => void;
    error: (message: string) => void;
  };
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly db: Database.Database,
    options: DatabaseBackupServiceOptions,
  ) {
    this.backupDir = options.backupDir;
    this.intervalMs = Math.max(1, options.intervalMinutes) * 60 * 1000;
    this.retentionMs = Math.max(1, options.retentionDays) * 24 * 60 * 60 * 1000;
    this.logger = options.logger ?? {
      info: () => undefined,
      error: () => undefined,
    };
  }

  start(): void {
    if (this.timer) {
      return;
    }

    void this.runBackupCycle();
    this.timer = setInterval(() => {
      void this.runBackupCycle();
    }, this.intervalMs);
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    await this.runBackupCycle();
  }

  private async runBackupCycle(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    try {
      await this.createBackup();
      this.pruneOldBackups();
    } catch (error) {
      this.logger.error(
        `[backup] Failed backup cycle: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }

  private async createBackup(): Promise<void> {
    const timestamp = toBackupTimestamp(new Date());
    const targetPath = join(
      this.backupDir,
      `${BACKUP_FILE_PREFIX}${timestamp}${BACKUP_FILE_SUFFIX}`,
    );
    await this.db.backup(targetPath);
    this.logger.info(`[backup] Created ${targetPath}`);
  }

  private pruneOldBackups(): void {
    const cutoffMs = Date.now() - this.retentionMs;
    const entries = readdirSync(this.backupDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }

      if (!entry.name.startsWith(BACKUP_FILE_PREFIX) || !entry.name.endsWith(BACKUP_FILE_SUFFIX)) {
        continue;
      }

      const fullPath = join(this.backupDir, entry.name);
      const modifiedAtMs = statSync(fullPath).mtimeMs;

      if (modifiedAtMs < cutoffMs) {
        rmSync(fullPath);
      }
    }
  }
}
