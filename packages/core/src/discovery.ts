import { ModuleRegistry } from "./registry.js";
import { discoveredModules } from "./modules/index.js";

export const registerDiscoveredModules = (registry: ModuleRegistry): ModuleRegistry => {
  for (const moduleDefinition of discoveredModules) {
    registry.registerModule(moduleDefinition);
  }

  return registry;
};

export const createDefaultModuleRegistry = (): ModuleRegistry =>
  registerDiscoveredModules(new ModuleRegistry());
