import {
  calendarModuleConfigSchema,
  photosModuleConfigSchema,
  type LayoutRecord,
  type ModuleInstance,
} from "@hearth/shared";

const sanitizeCalendarModule = (moduleInstance: ModuleInstance): ModuleInstance => {
  const parsedConfig = calendarModuleConfigSchema.safeParse(moduleInstance.config);
  if (!parsedConfig.success) {
    return moduleInstance;
  }

  return {
    ...moduleInstance,
    config: {
      ...parsedConfig.data,
      calendars: parsedConfig.data.calendars.map((_entry, index) => `Calendar ${index + 1}`),
    },
  };
};

const sanitizePhotosModule = (moduleInstance: ModuleInstance): ModuleInstance => {
  const parsedConfig = photosModuleConfigSchema.safeParse(moduleInstance.config);
  if (!parsedConfig.success) {
    return moduleInstance;
  }

  return {
    ...moduleInstance,
    config: {
      ...parsedConfig.data,
      folderPath: "/photos",
    },
  };
};

const sanitizeModuleInstance = (moduleInstance: ModuleInstance): ModuleInstance => {
  if (moduleInstance.moduleId === "calendar") {
    return sanitizeCalendarModule(moduleInstance);
  }

  if (moduleInstance.moduleId === "photos") {
    return sanitizePhotosModule(moduleInstance);
  }

  return moduleInstance;
};

export const sanitizeLayoutRecordForPublicDisplay = (
  layout: LayoutRecord | null,
): LayoutRecord | null => {
  if (!layout) {
    return null;
  }

  return {
    ...layout,
    config: {
      ...layout.config,
      modules: layout.config.modules.map(sanitizeModuleInstance),
    },
  };
};
