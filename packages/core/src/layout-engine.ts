import {
  layoutConfigSchema,
  layoutTypographySchema,
  type GridItem,
  type LayoutConfig,
  type ModuleDefinition,
  type ModuleInstance,
} from "@hearth/shared";

const DEFAULT_COLS = 12;
const DEFAULT_ROWS = 20;
const DEFAULT_ROW_HEIGHT = 30;

const createInstanceId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `mod-${crypto.randomUUID()}`;
  }

  return `mod-${Math.random().toString(36).slice(2, 10)}`;
};

export const createEmptyLayoutConfig = (): LayoutConfig => ({
  cols: DEFAULT_COLS,
  rows: DEFAULT_ROWS,
  rowHeight: DEFAULT_ROW_HEIGHT,
  typography: layoutTypographySchema.parse({}),
  items: [],
  modules: [],
});

export const validateLayoutConfig = (input: unknown): LayoutConfig =>
  synchronizeLayout(layoutConfigSchema.parse(input));

const nextYPosition = (items: GridItem[]): number => {
  if (items.length === 0) {
    return 0;
  }

  return Math.max(...items.map((item) => item.y + item.h));
};

export const addModuleToLayout = (
  config: LayoutConfig,
  module: Pick<ModuleDefinition, "id" | "defaultSize" | "configSchema">,
): { config: LayoutConfig; instance: ModuleInstance } => {
  const instanceId = createInstanceId();
  const safeConfig = module.configSchema.safeParse({});
  const parsedConfig = safeConfig.success ? safeConfig.data : {};

  const instance: ModuleInstance = {
    id: instanceId,
    moduleId: module.id,
    config:
      typeof parsedConfig === "object" && parsedConfig !== null
        ? (parsedConfig as Record<string, unknown>)
        : {},
  };

  const item: GridItem = {
    i: instanceId,
    x: 0,
    y: nextYPosition(config.items),
    w: module.defaultSize.w,
    h: module.defaultSize.h,
  };

  return {
    instance,
    config: {
      ...config,
      modules: [...config.modules, instance],
      items: [...config.items, item],
    },
  };
};

export const addModuleToLayoutAtPosition = (
  config: LayoutConfig,
  module: Pick<ModuleDefinition, "id" | "defaultSize" | "configSchema">,
  placement: Pick<GridItem, "x" | "y">,
): { config: LayoutConfig; instance: ModuleInstance } => {
  const created = addModuleToLayout(config, module);

  const items = created.config.items.map((item) =>
    item.i === created.instance.id
      ? {
          ...item,
          x: placement.x,
          y: placement.y,
          w: module.defaultSize.w,
          h: module.defaultSize.h,
        }
      : item,
  );

  return {
    instance: created.instance,
    config: {
      ...created.config,
      items,
    },
  };
};

export const removeModuleFromLayout = (config: LayoutConfig, instanceId: string): LayoutConfig => ({
  ...config,
  modules: config.modules.filter((instance) => instance.id !== instanceId),
  items: config.items.filter((item) => item.i !== instanceId),
});

export const updateLayoutGridItems = (config: LayoutConfig, items: GridItem[]): LayoutConfig => {
  const validIds = new Set(config.modules.map((module) => module.id));

  return {
    ...config,
    items: items.filter((item) => validIds.has(item.i)),
  };
};

export const updateModuleConfig = (
  config: LayoutConfig,
  instanceId: string,
  nextConfig: Record<string, unknown>,
): LayoutConfig => ({
  ...config,
  modules: config.modules.map((instance) =>
    instance.id === instanceId ? { ...instance, config: nextConfig } : instance,
  ),
});

export const synchronizeLayout = (config: LayoutConfig): LayoutConfig => {
  const moduleIds = new Set(config.modules.map((module) => module.id));
  const validItems = config.items.filter((item) => moduleIds.has(item.i));
  const validItemIds = new Set(validItems.map((item) => item.i));
  const validModules = config.modules.filter((module) => validItemIds.has(module.id));

  return {
    cols: config.cols,
    rows: config.rows,
    rowHeight: config.rowHeight,
    typography: config.typography,
    items: validItems,
    modules: validModules,
  };
};
