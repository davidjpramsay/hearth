import type { ModuleDefinition as SdkModuleDefinition } from "@hearth/module-sdk";
import {
  LocalStorageModuleInstanceStore,
  MemoryModuleInstanceStore,
} from "./module-instance-store";
import { UnifiedModuleRegistry } from "./unified-module-registry";

type SdkModuleAny = SdkModuleDefinition<any, any>;

interface SdkModuleCandidate {
  default?: SdkModuleAny;
  moduleDefinition?: SdkModuleAny;
  module?: SdkModuleAny;
}

const toSdkDefinition = (candidate: SdkModuleCandidate): SdkModuleAny | null => {
  if (candidate.default) {
    return candidate.default;
  }
  if (candidate.moduleDefinition) {
    return candidate.moduleDefinition;
  }
  if (candidate.module) {
    return candidate.module;
  }

  return null;
};

const loadSdkModules = (): SdkModuleAny[] => {
  const modules = import.meta.glob("../modules/sdk/**/*.module.{ts,tsx}", {
    eager: true,
  }) as Record<string, SdkModuleCandidate>;

  return Object.values(modules)
    .map(toSdkDefinition)
    .filter((value): value is SdkModuleAny => Boolean(value));
};

const instanceStore =
  typeof window === "undefined"
    ? new MemoryModuleInstanceStore()
    : new LocalStorageModuleInstanceStore();
const registry = new UnifiedModuleRegistry(instanceStore);

for (const moduleDefinition of loadSdkModules()) {
  registry.registerSdk(moduleDefinition);
}

export const moduleRegistry = registry;
