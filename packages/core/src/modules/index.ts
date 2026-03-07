import type { ModuleDefinition } from "@hearth/shared";

// Legacy modules have been migrated to SDK modules under apps/web/src/modules/sdk.
// Keep this list empty so new registrations happen only through the unified SDK registry.
export const discoveredModules: ModuleDefinition<any>[] = [];
