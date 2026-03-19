import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const rootDir = process.cwd();
const dataDir = resolve(rootDir, ".tmp/e2e-data");
const photosDir = resolve(dataDir, "photos");

rmSync(dataDir, { recursive: true, force: true });
mkdirSync(photosDir, { recursive: true });

const child = spawn("pnpm", ["--filter", "@hearth/server", "start"], {
  cwd: rootDir,
  stdio: "inherit",
  env: {
    ...process.env,
    ADMIN_PASSWORD: "hearth-e2e",
    DATA_DIR: dataDir,
    HOST: "127.0.0.1",
    LOCAL_WARNING_DEV_FORCE_ACTIVE: "true",
    PORT: "4173",
  },
});

const forwardSignal = (signal) => {
  if (!child.killed) {
    child.kill(signal);
  }
};

process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
