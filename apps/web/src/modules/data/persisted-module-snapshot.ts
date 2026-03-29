interface PersistedModuleSnapshotRecord {
  savedAtMs: number;
  data: unknown;
}

const STORAGE_KEY_PREFIX = "hearth:module-snapshot:v1:";

const canUseSnapshotStorage = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.localStorage !== "undefined" &&
  window.localStorage !== null;

const toStorageKey = (key: string): string => `${STORAGE_KEY_PREFIX}${key}`;

const removePersistedModuleSnapshot = (key: string): void => {
  if (!canUseSnapshotStorage()) {
    return;
  }

  try {
    window.localStorage.removeItem(toStorageKey(key));
  } catch {
    // Ignore storage failures on locked-down kiosks.
  }
};

export const readPersistedModuleSnapshot = <TData>(input: {
  key: string;
  parse: (payload: unknown) => TData;
  maxAgeMs?: number;
  validate?: (data: TData) => boolean;
}): { data: TData; updatedAtMs: number } | null => {
  if (!canUseSnapshotStorage()) {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(toStorageKey(input.key));
    if (!rawValue) {
      return null;
    }

    const parsedRecord = JSON.parse(rawValue) as PersistedModuleSnapshotRecord;
    if (
      !parsedRecord ||
      typeof parsedRecord !== "object" ||
      typeof parsedRecord.savedAtMs !== "number" ||
      !Number.isFinite(parsedRecord.savedAtMs)
    ) {
      removePersistedModuleSnapshot(input.key);
      return null;
    }

    if (
      typeof input.maxAgeMs === "number" &&
      Number.isFinite(input.maxAgeMs) &&
      input.maxAgeMs > 0 &&
      Date.now() - parsedRecord.savedAtMs > input.maxAgeMs
    ) {
      removePersistedModuleSnapshot(input.key);
      return null;
    }

    const data = input.parse(parsedRecord.data);
    if (input.validate && !input.validate(data)) {
      removePersistedModuleSnapshot(input.key);
      return null;
    }

    return {
      data,
      updatedAtMs: Math.max(0, Math.round(parsedRecord.savedAtMs)),
    };
  } catch {
    removePersistedModuleSnapshot(input.key);
    return null;
  }
};

export const writePersistedModuleSnapshot = <TData>(
  key: string,
  data: TData,
  updatedAtMs = Date.now(),
): void => {
  if (!canUseSnapshotStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(
      toStorageKey(key),
      JSON.stringify({
        savedAtMs: Math.max(0, Math.round(updatedAtMs)),
        data,
      } satisfies PersistedModuleSnapshotRecord),
    );
  } catch {
    // Ignore storage failures on locked-down kiosks.
  }
};
