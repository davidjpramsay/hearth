import type { ChoresRepository } from "./repositories/chores-repository.js";
import type { DeviceRepository } from "./repositories/device-repository.js";
import type { LayoutRepository } from "./repositories/layout-repository.js";
import type { ModuleStateRepository } from "./repositories/module-state-repository.js";
import type { PlannerRepository } from "./repositories/planner-repository.js";
import type { SettingsRepository } from "./repositories/settings-repository.js";
import type { CalendarFeedService } from "./services/calendar-feed-service.js";
import type { LayoutEventBus } from "./services/layout-event-bus.js";
import type { LocalWarningService } from "./services/local-warning-service.js";
import type { PhotosSlideshowService } from "./services/photos-slideshow-service.js";
import type { ScreenProfileService } from "./services/screen-profile-service.js";
import type { ModuleAdapterService } from "./modules/service.js";

export interface AppServices {
  layoutRepository: LayoutRepository;
  choresRepository: ChoresRepository;
  plannerRepository: PlannerRepository;
  deviceRepository: DeviceRepository;
  settingsRepository: SettingsRepository;
  moduleStateRepository: ModuleStateRepository;
  calendarFeedService: CalendarFeedService;
  photosSlideshowService: PhotosSlideshowService;
  localWarningService: LocalWarningService;
  screenProfileService: ScreenProfileService;
  layoutEventBus: LayoutEventBus;
  moduleAdapterService: ModuleAdapterService;
}
