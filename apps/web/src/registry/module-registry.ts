import React, { useEffect, useState } from "react";
import type { ModuleDefinition as SdkModuleDefinition } from "@hearth/module-sdk";
import type { DashboardTileProps, ModuleManifest, SettingsPanelProps } from "@hearth/shared";
import { adaptSdkModule, type RegisteredModuleDefinition } from "./unified-module-registry";

type SdkModuleAny = SdkModuleDefinition<any, any>;

interface SdkModuleCandidate {
  default?: SdkModuleAny;
  moduleDefinition?: SdkModuleAny;
  module?: SdkModuleAny;
}

interface CatalogModule extends ModuleManifest {
  placement: "public" | "internal";
  load: () => Promise<SdkModuleCandidate>;
}

const moduleCatalog = [
  {
    id: "bible-verse",
    displayName: "Bible verse",
    defaultSize: { w: 4, h: 3 },
    placement: "public",
    load: () => import("../modules/sdk/bible-verse.module"),
  },
  {
    id: "calendar",
    displayName: "Calendar",
    defaultSize: { w: 6, h: 4 },
    placement: "public",
    load: () => import("../modules/sdk/calendar.module"),
  },
  {
    id: "chores",
    displayName: "Chores",
    defaultSize: { w: 6, h: 4 },
    placement: "public",
    load: () => import("../modules/sdk/chores.module"),
  },
  {
    id: "clock",
    displayName: "Clock",
    defaultSize: { w: 3, h: 2 },
    placement: "public",
    load: () => import("../modules/sdk/clock.module"),
  },
  {
    id: "count-down",
    displayName: "Count Down",
    defaultSize: { w: 4, h: 2 },
    placement: "public",
    load: () => import("../modules/sdk/count-down.module"),
  },
  {
    id: "homeschool-planner",
    displayName: "School Planner",
    defaultSize: { w: 10, h: 6 },
    placement: "public",
    load: () => import("../modules/sdk/homeschool-planner.module"),
  },
  {
    id: "kobo-reader",
    displayName: "Kobo Reader",
    defaultSize: { w: 5, h: 3 },
    placement: "public",
    load: () => import("../modules/sdk/kobo-reader.module"),
  },
  {
    id: "local-warnings",
    displayName: "Local warnings",
    defaultSize: { w: 6, h: 5 },
    placement: "internal",
    load: () => import("../modules/sdk/local-warnings.module"),
  },
  {
    id: "photos",
    displayName: "Photos",
    defaultSize: { w: 6, h: 5 },
    placement: "public",
    load: () => import("../modules/sdk/photos.module"),
  },
  {
    id: "server-status",
    displayName: "Server status",
    defaultSize: { w: 4, h: 3 },
    placement: "public",
    load: () => import("../modules/sdk/server-status.module"),
  },
  {
    id: "weather",
    displayName: "Weather",
    defaultSize: { w: 4, h: 3 },
    placement: "public",
    load: () => import("../modules/sdk/weather.module"),
  },
  {
    id: "welcome",
    displayName: "Welcome module",
    defaultSize: { w: 4, h: 2 },
    placement: "public",
    load: () => import("../modules/sdk/welcome.module"),
  },
] satisfies CatalogModule[];

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

const toManifest = (entry: CatalogModule): ModuleManifest => ({
  id: entry.id,
  displayName: entry.displayName,
  defaultSize: entry.defaultSize,
});

class LazyModuleRegistry {
  private readonly catalog = new Map(moduleCatalog.map((entry) => [entry.id, entry]));
  private readonly loadedModules = new Map<string, RegisteredModuleDefinition<any>>();
  private readonly pendingLoads = new Map<string, Promise<RegisteredModuleDefinition<any>>>();

  listModules(options: { includeInternal?: boolean } = {}): ModuleManifest[] {
    const includeInternal = options.includeInternal ?? false;
    return moduleCatalog
      .filter((entry) => includeInternal || entry.placement !== "internal")
      .map(toManifest)
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
  }

  getModuleManifest(id: string): ModuleManifest | undefined {
    const entry = this.catalog.get(id);
    return entry ? toManifest(entry) : undefined;
  }

  getLoadedModule(id: string): RegisteredModuleDefinition<any> | undefined {
    return this.loadedModules.get(id);
  }

  async loadModule(id: string): Promise<RegisteredModuleDefinition<any>> {
    const loaded = this.loadedModules.get(id);
    if (loaded) {
      return loaded;
    }

    const pending = this.pendingLoads.get(id);
    if (pending) {
      return pending;
    }

    const entry = this.catalog.get(id);
    if (!entry) {
      throw new Error(`Unknown module '${id}'`);
    }

    const loadPromise = entry.load().then((candidate) => {
      const sdkDefinition = toSdkDefinition(candidate);
      if (!sdkDefinition) {
        throw new Error(`Module '${id}' did not export a module definition.`);
      }

      const adapted = adaptSdkModule(sdkDefinition);
      this.loadedModules.set(id, adapted);
      this.pendingLoads.delete(id);
      return adapted;
    });

    this.pendingLoads.set(id, loadPromise);
    return loadPromise;
  }
}

export const moduleRegistry = new LazyModuleRegistry();

export const ModuleDashboardTile = ({
  moduleId,
  ...props
}: DashboardTileProps<Record<string, unknown>> & { moduleId: string }) => {
  const [state, setState] = useState<{
    definition: RegisteredModuleDefinition<any> | null;
    error: string | null;
  }>(() => ({
    definition: moduleRegistry.getLoadedModule(moduleId) ?? null,
    error: null,
  }));

  useEffect(() => {
    let cancelled = false;
    setState({
      definition: moduleRegistry.getLoadedModule(moduleId) ?? null,
      error: null,
    });

    void moduleRegistry
      .loadModule(moduleId)
      .then((definition) => {
        if (!cancelled) {
          setState({ definition, error: null });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            definition: null,
            error: error instanceof Error ? error.message : "Module failed to load.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [moduleId]);

  if (state.error) {
    return React.createElement(
      "div",
      {
        className:
          "flex h-full items-center justify-center rounded bg-slate-800 px-3 text-center text-sm text-rose-200",
      },
      state.error,
    );
  }

  if (!state.definition) {
    const manifest = moduleRegistry.getModuleManifest(moduleId);
    return React.createElement(
      "div",
      {
        className:
          "flex h-full items-center justify-center rounded bg-slate-900/80 px-3 text-center text-sm text-slate-300",
      },
      `Loading ${manifest?.displayName ?? moduleId}...`,
    );
  }

  return React.createElement(state.definition.DashboardTile, props);
};

export const ModuleSettingsPanel = ({
  moduleId,
  ...props
}: SettingsPanelProps<Record<string, unknown>> & { moduleId: string }) => {
  const [state, setState] = useState<{
    definition: RegisteredModuleDefinition<any> | null;
    error: string | null;
  }>(() => ({
    definition: moduleRegistry.getLoadedModule(moduleId) ?? null,
    error: null,
  }));

  useEffect(() => {
    let cancelled = false;
    setState({
      definition: moduleRegistry.getLoadedModule(moduleId) ?? null,
      error: null,
    });

    void moduleRegistry
      .loadModule(moduleId)
      .then((definition) => {
        if (!cancelled) {
          setState({ definition, error: null });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            definition: null,
            error: error instanceof Error ? error.message : "Module settings failed to load.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [moduleId]);

  if (state.error) {
    return React.createElement(
      "div",
      {
        className: "rounded-lg border border-rose-500/50 bg-rose-500/10 p-4 text-sm text-rose-100",
      },
      state.error,
    );
  }

  if (!state.definition) {
    const manifest = moduleRegistry.getModuleManifest(moduleId);
    return React.createElement(
      "div",
      {
        className: "rounded-lg border border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-300",
      },
      `Loading ${manifest?.displayName ?? moduleId} settings...`,
    );
  }

  return React.createElement(state.definition.SettingsPanel, props);
};
