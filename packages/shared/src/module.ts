import type { ComponentType } from "react";
import type { ZodType } from "zod";
import { z } from "zod";

export const gridSizeSchema = z.object({
  w: z.number().int().min(1),
  h: z.number().int().min(1),
});

export type GridSize = z.infer<typeof gridSizeSchema>;

export interface DashboardTileProps<TConfig = unknown> {
  instanceId: string;
  config: TConfig;
  isEditing?: boolean;
}

export interface SettingsPanelProps<TConfig = unknown> {
  config: TConfig;
  onChange: (nextConfig: TConfig) => void;
}

export interface ModuleDefinition<TConfig = unknown> {
  id: string;
  displayName: string;
  defaultSize: GridSize;
  configSchema: ZodType<TConfig, any, any>;
  DashboardTile: ComponentType<DashboardTileProps<TConfig>>;
  SettingsPanel: ComponentType<SettingsPanelProps<TConfig>>;
}

export const moduleManifestSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  defaultSize: gridSizeSchema,
  timeMode: z.enum(["device-local", "site-local", "source-local"]).optional(),
});

export type ModuleManifest = z.infer<typeof moduleManifestSchema>;
