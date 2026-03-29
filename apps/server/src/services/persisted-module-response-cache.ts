import { z } from "zod";
import type { ModuleStateRepository } from "../repositories/module-state-repository.js";

const persistedModuleResponseRecordSchema = z.object({
  savedAtMs: z.number().int().nonnegative(),
  payload: z.unknown(),
});

export const readPersistedModuleResponse = <TPayload>(input: {
  repository: ModuleStateRepository | null | undefined;
  key: string;
  parse: (payload: unknown) => TPayload;
  maxAgeMs?: number;
  validate?: (payload: TPayload) => boolean;
}): { payload: TPayload; savedAtMs: number } | null => {
  if (!input.repository) {
    return null;
  }

  const rawRecord = input.repository.getState<unknown>(input.key);
  const parsedRecord = persistedModuleResponseRecordSchema.safeParse(rawRecord);
  if (!parsedRecord.success) {
    return null;
  }

  if (
    typeof input.maxAgeMs === "number" &&
    Number.isFinite(input.maxAgeMs) &&
    input.maxAgeMs > 0 &&
    Date.now() - parsedRecord.data.savedAtMs > input.maxAgeMs
  ) {
    return null;
  }

  try {
    const payload = input.parse(parsedRecord.data.payload);
    if (input.validate && !input.validate(payload)) {
      return null;
    }

    return {
      payload,
      savedAtMs: parsedRecord.data.savedAtMs,
    };
  } catch {
    return null;
  }
};

export const writePersistedModuleResponse = <TPayload>(
  repository: ModuleStateRepository | null | undefined,
  key: string,
  payload: TPayload,
): void => {
  if (!repository) {
    return;
  }

  repository.setState(key, {
    savedAtMs: Date.now(),
    payload,
  });
};
