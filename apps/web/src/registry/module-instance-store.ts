export interface PersistedModuleInstance {
  id: string;
  moduleId: string;
  config: Record<string, unknown>;
}

export interface ModuleInstanceStore {
  list(): PersistedModuleInstance[];
  upsert(instance: PersistedModuleInstance): void;
  remove(instanceId: string): void;
}

const STORAGE_KEY = "hearth:module-instances:v1";

const parsePersistedInstances = (raw: string | null): PersistedModuleInstance[] => {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((entry): entry is PersistedModuleInstance => {
        if (typeof entry !== "object" || entry === null) {
          return false;
        }

        const record = entry as Record<string, unknown>;
        return (
          typeof record.id === "string" &&
          typeof record.moduleId === "string" &&
          typeof record.config === "object" &&
          record.config !== null &&
          !Array.isArray(record.config)
        );
      })
      .map((entry) => ({
        id: entry.id,
        moduleId: entry.moduleId,
        config: entry.config,
      }));
  } catch {
    return [];
  }
};

export class LocalStorageModuleInstanceStore implements ModuleInstanceStore {
  list(): PersistedModuleInstance[] {
    if (typeof window === "undefined") {
      return [];
    }

    return parsePersistedInstances(window.localStorage.getItem(STORAGE_KEY));
  }

  upsert(instance: PersistedModuleInstance): void {
    if (typeof window === "undefined") {
      return;
    }

    const all = this.list();
    const next = all.filter((existing) => existing.id !== instance.id);
    next.push(instance);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  remove(instanceId: string): void {
    if (typeof window === "undefined") {
      return;
    }

    const next = this.list().filter((instance) => instance.id !== instanceId);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
}

export class MemoryModuleInstanceStore implements ModuleInstanceStore {
  private instances: PersistedModuleInstance[] = [];

  list(): PersistedModuleInstance[] {
    return [...this.instances];
  }

  upsert(instance: PersistedModuleInstance): void {
    this.instances = [
      ...this.instances.filter((existing) => existing.id !== instance.id),
      instance,
    ];
  }

  remove(instanceId: string): void {
    this.instances = this.instances.filter((instance) => instance.id !== instanceId);
  }
}
