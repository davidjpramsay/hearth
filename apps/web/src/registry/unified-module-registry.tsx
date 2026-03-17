import React from "react";
import { validateSettings, type ModuleDefinition as SdkModuleDefinition } from "@hearth/module-sdk";
import type {
  DashboardTileProps,
  ModuleDefinition as SharedModuleDefinition,
  SettingsPanelProps,
} from "@hearth/shared";
import type { ModuleInstanceStore, PersistedModuleInstance } from "./module-instance-store";

type SdkModuleAny = SdkModuleDefinition<any, any>;

export interface RegisteredModuleDefinition<TConfig = unknown>
  extends SharedModuleDefinition<TConfig> {
  source: "sdk";
  version: string;
  description?: string;
  placement: "public" | "internal";
  timeMode?: "device-local" | "site-local" | "source-local";
  categories: string[];
  permissions: string[];
  dataSources: string[];
}

export const createStableId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `module-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const createFallbackSettingsPanel =
  <TConfig,>(): React.ComponentType<SettingsPanelProps<TConfig>> =>
  ({ config }) => (
    <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-900 p-4 text-sm text-slate-200">
      <h3 className="text-base font-semibold">Module settings</h3>
      <p className="text-xs text-slate-400">
        This SDK module has no custom settings panel yet. Current settings are still applied.
      </p>
      <pre className="max-h-44 overflow-auto rounded border border-slate-700 bg-slate-950 p-2 text-[11px] text-slate-300">
        {JSON.stringify(config ?? {}, null, 2)}
      </pre>
    </div>
  );

export const adaptSdkModule = (
  definition: SdkModuleAny,
): RegisteredModuleDefinition<any> => {
  const fallbackSettingsPanel = createFallbackSettingsPanel<any>();

  return {
    id: definition.manifest.id,
    displayName: definition.manifest.name,
    defaultSize: definition.manifest.defaultSize,
    configSchema: definition.settingsSchema,
    source: "sdk",
    version: definition.manifest.version,
    description: definition.manifest.description,
    placement: definition.manifest.placement ?? "public",
    timeMode: definition.manifest.timeMode,
    categories: definition.manifest.categories ?? [],
    permissions: definition.manifest.permissions ?? [],
    dataSources: definition.manifest.dataSources?.map((source) => source.id) ?? [],
    DashboardTile: (props: DashboardTileProps<any>) => {
      const settings = validateSettings(definition, props.config ?? {});
      const Component = definition.runtime.Component;
      return (
        <Component
          instanceId={props.instanceId}
          settings={settings}
          data={null}
          loading={false}
          error={null}
          isEditing={props.isEditing}
        />
      );
    },
    SettingsPanel: definition.admin?.SettingsPanel
      ? ({ config, onChange }: SettingsPanelProps<any>) => {
          const settings = validateSettings(definition, config ?? {});
          const SettingsPanel = definition.admin?.SettingsPanel;

          if (!SettingsPanel) {
            return null;
          }

          return <SettingsPanel settings={settings} onChange={onChange} />;
        }
      : fallbackSettingsPanel,
  };
};

export class UnifiedModuleRegistry {
  private readonly modules = new Map<string, RegisteredModuleDefinition<any>>();

  constructor(private readonly instanceStore: ModuleInstanceStore) {}

  registerSdk(definition: SdkModuleAny): void {
    this.register(adaptSdkModule(definition));
  }

  register(definition: RegisteredModuleDefinition<any>): void {
    if (this.modules.has(definition.id)) {
      throw new Error(`Module '${definition.id}' is already registered.`);
    }

    this.modules.set(definition.id, definition);
  }

  listModules(options: { includeInternal?: boolean } = {}): RegisteredModuleDefinition<any>[] {
    const includeInternal = options.includeInternal ?? false;
    return [...this.modules.values()]
      .filter((definition) => includeInternal || definition.placement !== "internal")
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
  }

  getModule(id: string): RegisteredModuleDefinition<any> | undefined {
    return this.modules.get(id);
  }

  createInstance(
    moduleId: string,
    config?: Record<string, unknown>,
  ): PersistedModuleInstance {
    const moduleDefinition = this.getModule(moduleId);
    if (!moduleDefinition) {
      throw new Error(`Unknown module '${moduleId}'`);
    }

    const instance: PersistedModuleInstance = {
      id: createStableId(),
      moduleId,
      config: moduleDefinition.configSchema.parse(config ?? {}),
    };
    this.instanceStore.upsert(instance);

    return instance;
  }

  listInstances(): PersistedModuleInstance[] {
    return this.instanceStore.list();
  }

  removeInstance(instanceId: string): void {
    this.instanceStore.remove(instanceId);
  }

  renderModuleInstance(input: {
    instanceId: string;
    moduleId: string;
    config: Record<string, unknown>;
    isEditing?: boolean;
  }): React.ReactNode {
    const moduleDefinition = this.getModule(input.moduleId);
    if (!moduleDefinition) {
      return null;
    }

    return React.createElement(moduleDefinition.DashboardTile, {
      instanceId: input.instanceId,
      config: input.config,
      isEditing: input.isEditing,
    });
  }
}
