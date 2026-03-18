import type { ModuleDefinition } from "@hearth/shared";

// Runtime modules live only in apps/web/src/modules/sdk.
// Keep this list empty so @hearth/core stays layout/registry-only.
export const discoveredModules: ModuleDefinition<any>[] = [];
