import { moduleManifestSchema, type ModuleDefinition, type ModuleManifest } from "@hearth/shared";

export class ModuleRegistry {
  private readonly modules = new Map<string, ModuleDefinition<any>>();

  registerModule<TConfig>(definition: ModuleDefinition<TConfig>): void {
    moduleManifestSchema.parse({
      id: definition.id,
      displayName: definition.displayName,
      defaultSize: definition.defaultSize,
    });

    if (this.modules.has(definition.id)) {
      throw new Error(`Module '${definition.id}' is already registered.`);
    }

    this.modules.set(definition.id, definition as ModuleDefinition<any>);
  }

  getModule(id: string): ModuleDefinition<any> | undefined {
    return this.modules.get(id);
  }

  listModules(): ModuleDefinition<any>[] {
    return Array.from(this.modules.values());
  }

  listManifests(): ModuleManifest[] {
    return this.listModules().map((module) => ({
      id: module.id,
      displayName: module.displayName,
      defaultSize: module.defaultSize,
    }));
  }
}
