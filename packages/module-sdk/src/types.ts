import type { ComponentType } from "react";
import type { z, ZodTypeAny } from "zod";

export interface ModuleSize {
  w: number;
  h: number;
}

export type ModuleDataSourceKind = "local" | "rest" | "stream" | "adapter" | "composite";

export interface ModuleDataSourceDescriptor {
  id: string;
  kind: ModuleDataSourceKind;
  name?: string;
  description?: string;
  pollMs?: number;
  topic?: string;
}

export type ModulePermission =
  | "network"
  | "filesystem"
  | "camera"
  | "microphone"
  | "notifications"
  | "device"
  | "calendar"
  | "weather"
  | string;

export interface ModuleManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  icon?: string;
  defaultSize: ModuleSize;
  placement?: "public" | "internal";
  timeMode?: "device-local" | "site-local" | "source-local";
  categories?: string[];
  permissions?: ModulePermission[];
  dataSources?: ModuleDataSourceDescriptor[];
}

export type ModuleSettings<T> = T;
export type ModuleData<T> = T;

export interface ModuleContext {
  moduleId: string;
  instanceId?: string;
  now: () => Date;
  signal?: AbortSignal;
  emitEvent?: (event: string, payload?: unknown) => void;
}

export interface ModuleComponentProps<TSettings, TData> {
  instanceId: string;
  settings: ModuleSettings<TSettings>;
  data: ModuleData<TData> | null;
  loading: boolean;
  error: string | null;
  isEditing?: boolean;
}

export interface ModuleRuntime<TSettings, TData> {
  Component: ComponentType<ModuleComponentProps<TSettings, TData>>;
  onInit?: (context: ModuleContext) => void | Promise<void>;
  onDispose?: (context: ModuleContext) => void | Promise<void>;
  getInitialData?: (context: ModuleContext) => ModuleData<TData> | Promise<ModuleData<TData>>;
  refresh?: (
    context: ModuleContext,
    previous: ModuleData<TData> | null,
  ) => ModuleData<TData> | Promise<ModuleData<TData>>;
  subscribe?: (
    context: ModuleContext,
    emit: (nextData: ModuleData<TData>) => void,
  ) => void | (() => void) | Promise<void | (() => void)>;
}

export interface ModuleAdminUi<TSettings> {
  SettingsPanel?: ComponentType<{
    settings: ModuleSettings<TSettings>;
    onChange: (nextSettings: ModuleSettings<TSettings>) => void;
  }>;
}

export interface ModuleDefinition<
  TSettingsSchema extends ZodTypeAny,
  TDataSchema extends ZodTypeAny | undefined = undefined,
> {
  manifest: ModuleManifest;
  settingsSchema: TSettingsSchema;
  dataSchema?: TDataSchema;
  admin?: ModuleAdminUi<z.infer<TSettingsSchema>>;
  runtime: ModuleRuntime<
    z.infer<TSettingsSchema>,
    TDataSchema extends ZodTypeAny ? z.infer<TDataSchema> : unknown
  >;
}

export type ModuleInstance<TSettings = Record<string, unknown>, TData = Record<string, unknown>> = {
  id: string;
  moduleId: string;
  settings: ModuleSettings<TSettings>;
  data?: ModuleData<TData>;
};

export interface DefineModuleInput<
  TSettingsSchema extends ZodTypeAny,
  TDataSchema extends ZodTypeAny | undefined = undefined,
> {
  manifest: ModuleManifest;
  settingsSchema: TSettingsSchema;
  dataSchema?: TDataSchema;
  admin?: ModuleAdminUi<z.infer<TSettingsSchema>>;
  runtime: ModuleRuntime<
    z.infer<TSettingsSchema>,
    TDataSchema extends ZodTypeAny ? z.infer<TDataSchema> : unknown
  >;
}
