import {
  displayDeviceRuntimeSchema,
  layoutRecordSchema,
  photoCollectionIdSchema,
  reportScreenProfileWarningTickerSchema,
  type ReportScreenProfileResponse,
} from "@hearth/shared";
import { z } from "zod";

const STORAGE_KEY_PREFIX = "hearth:dashboard-snapshot:v1:";

const persistedDashboardSnapshotSchema = z.object({
  layout: layoutRecordSchema.nullable(),
  device: displayDeviceRuntimeSchema,
  warningTicker: reportScreenProfileWarningTickerSchema.nullable().default(null),
  cycleContext: z.object({
    sourceKind: z.enum(["set", "layout"]),
    cycleSeconds: z.number().int().min(3).max(3600).nullable(),
    photoCollectionId: photoCollectionIdSchema.nullable(),
  }),
});

type PersistedDashboardSnapshot = z.infer<typeof persistedDashboardSnapshotSchema>;

interface PersistedDashboardSnapshotRecord {
  savedAtMs: number;
  data: PersistedDashboardSnapshot;
}

const canUseSnapshotStorage = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.localStorage !== "undefined" &&
  window.localStorage !== null;

const toStorageKey = (deviceId: string): string => `${STORAGE_KEY_PREFIX}${deviceId}`;

const removePersistedDashboardSnapshot = (deviceId: string): void => {
  if (!canUseSnapshotStorage()) {
    return;
  }

  try {
    window.localStorage.removeItem(toStorageKey(deviceId));
  } catch {
    // Ignore storage failures on locked-down displays.
  }
};

const toPersistedDashboardSnapshot = (
  response: ReportScreenProfileResponse,
): PersistedDashboardSnapshot => ({
  layout: response.layout,
  device: response.device,
  warningTicker: response.warningTicker,
  cycleContext: {
    sourceKind: response.resolvedTargetSelection.kind,
    cycleSeconds:
      response.resolvedTargetSelection.kind === "set" ? response.autoCycleSeconds : null,
    photoCollectionId:
      response.resolvedTargetSelection.kind === "set" ? response.selectedPhotoCollectionId : null,
  },
});

export const readPersistedDashboardSnapshot = (
  deviceId: string,
): PersistedDashboardSnapshot | null => {
  if (!canUseSnapshotStorage()) {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(toStorageKey(deviceId));
    if (!rawValue) {
      return null;
    }

    const parsedRecord = JSON.parse(rawValue) as PersistedDashboardSnapshotRecord;
    if (
      !parsedRecord ||
      typeof parsedRecord !== "object" ||
      typeof parsedRecord.savedAtMs !== "number" ||
      !Number.isFinite(parsedRecord.savedAtMs)
    ) {
      removePersistedDashboardSnapshot(deviceId);
      return null;
    }

    return persistedDashboardSnapshotSchema.parse(parsedRecord.data);
  } catch {
    removePersistedDashboardSnapshot(deviceId);
    return null;
  }
};

export const writePersistedDashboardSnapshot = (
  deviceId: string,
  response: ReportScreenProfileResponse,
): void => {
  if (!canUseSnapshotStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(
      toStorageKey(deviceId),
      JSON.stringify({
        savedAtMs: Date.now(),
        data: toPersistedDashboardSnapshot(response),
      } satisfies PersistedDashboardSnapshotRecord),
    );
  } catch {
    // Ignore storage failures on locked-down displays.
  }
};
