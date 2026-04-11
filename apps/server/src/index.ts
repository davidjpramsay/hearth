import bcrypt from "bcryptjs";
import { config } from "./config.js";
import { createDatabase } from "./db.js";
import { ChoresRepository } from "./repositories/chores-repository.js";
import { DeviceRepository } from "./repositories/device-repository.js";
import { LayoutRepository } from "./repositories/layout-repository.js";
import { ModuleStateRepository } from "./repositories/module-state-repository.js";
import { PlannerRepository } from "./repositories/planner-repository.js";
import { SettingsRepository } from "./repositories/settings-repository.js";
import { CalendarFeedService } from "./services/calendar-feed-service.js";
import { DatabaseBackupService } from "./services/database-backup-service.js";
import { LayoutEventBus } from "./services/layout-event-bus.js";
import { configureLayoutLogicRegistry } from "./layout-logic/registry.js";
import { PhotosSlideshowService } from "./services/photos-slideshow-service.js";
import { LocalWarningService } from "./services/local-warning-service.js";
import { ScreenProfileService } from "./services/screen-profile-service.js";
import { ModuleAdapterService } from "./modules/service.js";
import { createApp } from "./app.js";

const { hashSync } = bcrypt;

if (!config.esvApiKey) {
  console.warn(
    "[startup] ESV_API_KEY is not set. Bible Verse module will return a configuration warning.",
  );
}

const database = createDatabase(config.dbPath);
const layoutRepository = new LayoutRepository(database, {
  calendarEncryptionSecret: config.calendarEncryptionSecret,
});
const choresRepository = new ChoresRepository(database);
const plannerRepository = new PlannerRepository(database);
const deviceRepository = new DeviceRepository(database);
const moduleStateRepository = new ModuleStateRepository(database);
const settingsRepository = new SettingsRepository(database, {
  defaultSiteTimeZone: config.defaultSiteTimeZone,
});
if (!settingsRepository.getAdminPasswordHash()) {
  if (config.adminBootstrapPassword) {
    settingsRepository.setAdminPasswordHash(hashSync(config.adminBootstrapPassword, 12));
    console.warn("[startup] Admin password hash initialized from ADMIN_PASSWORD.");
  } else {
    console.warn(
      "[startup] Admin password is not initialized. Set ADMIN_PASSWORD and restart before exposing Hearth.",
    );
  }
}
const layoutEventBus = new LayoutEventBus();
const moduleAdapterService = ModuleAdapterService.createDefault();
const localWarningService = new LocalWarningService({
  devForceActive: config.localWarningDevForceActive,
});
if (config.localWarningDevForceActive) {
  console.warn(
    "[startup] LOCAL_WARNING_DEV_FORCE_ACTIVE is enabled. Warning node and local warnings module will always show a synthetic test warning.",
  );
}
configureLayoutLogicRegistry({
  localWarningService,
});
const backupService = new DatabaseBackupService(database, {
  backupDir: config.backupDir,
  intervalMinutes: config.backupIntervalMinutes,
  retentionDays: config.backupRetentionDays,
  logger: {
    info: (message) => console.info(message),
    error: (message) => console.error(message),
  },
});
const services = {
  layoutRepository,
  choresRepository,
  plannerRepository,
  deviceRepository,
  settingsRepository,
  moduleStateRepository,
  calendarFeedService: new CalendarFeedService(moduleStateRepository, settingsRepository),
  photosSlideshowService: new PhotosSlideshowService(moduleStateRepository),
  localWarningService,
  screenProfileService: new ScreenProfileService(
    layoutRepository,
    settingsRepository,
    deviceRepository,
    localWarningService,
  ),
  layoutEventBus,
  moduleAdapterService,
};

const app = await createApp(services);
if (!config.localWarningDevForceActive) {
  try {
    await localWarningService.refreshNow();
  } catch (error) {
    console.warn(
      "[startup] Failed to preload Emergency WA warnings. Falling back to background refresh.",
      error,
    );
  }
}
backupService.start();
localWarningService.start();
await moduleAdapterService.start();
void services.calendarFeedService.prefetchConfiguredFeeds().catch((error) => {
  console.warn("[startup] Failed to prefetch enabled calendar feeds.", error);
});

const shutdown = async () => {
  await moduleAdapterService.stop();
  await localWarningService.stop();
  await backupService.stop();
  await app.close();
  database.close();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

try {
  await app.listen({
    host: config.host,
    port: config.port,
  });
} catch (error) {
  app.log.error(error);
  await shutdown();
  process.exit(1);
}
