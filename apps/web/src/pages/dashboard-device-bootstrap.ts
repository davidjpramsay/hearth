import {
  reportScreenTargetSelectionSchema,
  type ReportScreenProfileResponse,
  type ReportScreenTargetSelection,
} from "@hearth/shared";
import { getStoredThemeId, type ThemeId } from "../theme/theme";

const DEVICE_LAYOUT_FAMILY_STORAGE_KEY = "hearth:device-layout-family";
const DEVICE_SCREEN_TARGET_SELECTION_STORAGE_KEY =
  "hearth:device-screen-target-selection";

const DEFAULT_TARGET_SELECTION = reportScreenTargetSelectionSchema.parse({
  kind: "set",
  setId: null,
});

export interface DashboardDeviceBootstrapState {
  targetSelection: ReportScreenTargetSelection;
  reportedThemeId: ThemeId;
}

const getLegacyDeviceLayoutFamily = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(DEVICE_LAYOUT_FAMILY_STORAGE_KEY)?.trim();
    if (stored) {
      return stored;
    }
  } catch {
    // Ignore localStorage read failures.
  }

  return null;
};

const getLegacyDeviceTargetSelection = (): ReportScreenTargetSelection => {
  if (typeof window === "undefined") {
    return DEFAULT_TARGET_SELECTION;
  }

  try {
    const stored = window.localStorage.getItem(DEVICE_SCREEN_TARGET_SELECTION_STORAGE_KEY);
    if (stored) {
      const parsedStored = JSON.parse(stored);
      const parsedSelection = reportScreenTargetSelectionSchema.safeParse(parsedStored);
      if (parsedSelection.success) {
        return parsedSelection.data;
      }
    }
  } catch {
    // Ignore localStorage read failures.
  }

  return {
    kind: "set",
    setId: getLegacyDeviceLayoutFamily(),
  };
};

export const getInitialDashboardDeviceBootstrapState =
  (): DashboardDeviceBootstrapState => ({
    targetSelection: getLegacyDeviceTargetSelection(),
    reportedThemeId: getStoredThemeId(),
  });

export const getDashboardDeviceBootstrapStateForDeviceRefresh =
  (): DashboardDeviceBootstrapState =>
    getInitialDashboardDeviceBootstrapState();

export const getDashboardDeviceBootstrapStateFromResolution = (
  resolution: Pick<ReportScreenProfileResponse, "device">,
): DashboardDeviceBootstrapState => ({
  targetSelection: resolution.device.targetSelection ?? DEFAULT_TARGET_SELECTION,
  reportedThemeId: resolution.device.themeId,
});
