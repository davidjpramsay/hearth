import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  calendarFeedsConfigSchema,
  getThemeColorSlotByIndex,
  type CalendarFeed,
  type CalendarFeedsConfig,
  getRuntimeTimeZone,
  isValidIanaTimeZone,
  screenProfileLayoutsSchema,
  type DisplayDevice,
  type DisplayDeviceInfo,
  type ReportScreenTargetSelection,
  type SiteTimeConfig,
  type ScreenProfileLayouts,
} from "@hearth/shared";
import {
  getCalendarFeeds,
  deleteDisplayDevice,
  getDisplayDevices,
  getLayouts,
  getSiteTimeConfig,
  getScreenProfileLayouts,
  updateDisplayDevice,
  updateCalendarFeeds,
  updateSiteTimeConfig,
} from "../api/client";
import { getServerStatus, type ServerStatusResponse } from "../api/server-status";
import { logoutAdminSession } from "../auth/session";
import { getAuthToken } from "../auth/storage";
import { AdminNavActions } from "../components/admin/AdminNavActions";
import {
  AdminSection,
  AdminSectionHeader,
  ADMIN_BUTTON_PRIMARY_CLASS,
  ADMIN_BUTTON_SECONDARY_CLASS,
  ADMIN_EMPTY_STATE_CLASS,
  ADMIN_FIELD_LABEL_CLASS,
  ADMIN_INPUT_CLASS,
  ADMIN_PANEL_CLASS,
} from "../components/admin/AdminSection";
import { ThemePalettePicker } from "../components/admin/ThemePalettePicker";
import { PageShell } from "../components/PageShell";
import { ThemePreviewStrip } from "../components/ThemePreviewStrip";
import { getSupportedTimeZoneOptions } from "../time-zone-options";
import { THEME_OPTIONS, normalizeThemeId, type ThemeId } from "../theme/theme";
import { getLayoutDisplayName } from "./layout-name-utils";

type DeviceRoutingMode = "set" | "layout";
type AutosaveState = "idle" | "saving" | "saved" | "error";

interface DeviceDraft {
  name: string;
  themeId: ThemeId;
  routingMode: DeviceRoutingMode;
  setId: string;
  layoutName: string;
  preserveImplicitSelection: boolean;
  implicitSetId: string | null;
}

type BusyDeviceAction = "save" | "delete";
const CALENDAR_FEED_ID_PREFIX = "calendar-feed";

const defaultProfileLayouts: ScreenProfileLayouts = screenProfileLayoutsSchema.parse({});
const defaultSiteTimeConfig: SiteTimeConfig = {
  siteTimezone: getRuntimeTimeZone(),
};
const defaultCalendarFeedsConfig: CalendarFeedsConfig = {
  feeds: [],
};
const ADMIN_TIME_ZONE_DATALIST_ID = "admin-household-time-zones";
const AUTOSAVE_DELAY_MS = 800;
const RECENT_DEVICE_THRESHOLD_MS = 15 * 60 * 1000;
const STALE_DEVICE_THRESHOLD_MS = 60 * 60 * 1000;

const normalizeCalendarFeedId = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const createCalendarFeedId = (feeds: Array<Pick<CalendarFeed, "id">>): string => {
  const usedIds = new Set(feeds.map((feed) => feed.id.trim().toLowerCase()));
  let suffix = 1;

  while (suffix < 1000) {
    const candidate = `${CALENDAR_FEED_ID_PREFIX}-${suffix}`;
    if (!usedIds.has(candidate)) {
      return candidate;
    }
    suffix += 1;
  }

  return `${CALENDAR_FEED_ID_PREFIX}-${Date.now().toString(36)}`;
};

const normalizeDeviceTargetSelection = (input: {
  targetSelection: ReportScreenTargetSelection | null;
  availableSetIds: Set<string>;
  availableLayoutNames: Set<string>;
}): ReportScreenTargetSelection | null => {
  const { targetSelection } = input;

  if (!targetSelection) {
    return null;
  }

  if (targetSelection.kind === "set") {
    return targetSelection.setId !== null && input.availableSetIds.has(targetSelection.setId)
      ? targetSelection
      : null;
  }

  return targetSelection.layoutName !== null &&
    input.availableLayoutNames.has(targetSelection.layoutName)
    ? targetSelection
    : null;
};

const toDeviceDraft = (input: {
  device: DisplayDevice;
  availableSetIds: Set<string>;
  availableLayoutNames: Set<string>;
  firstAvailableSetId: string;
}): DeviceDraft => {
  const normalizedTargetSelection = normalizeDeviceTargetSelection({
    targetSelection: input.device.targetSelection,
    availableSetIds: input.availableSetIds,
    availableLayoutNames: input.availableLayoutNames,
  });

  if (!normalizedTargetSelection) {
    return {
      name: input.device.name,
      themeId: normalizeThemeId(input.device.themeId),
      routingMode: "set",
      setId: input.firstAvailableSetId,
      layoutName: "",
      preserveImplicitSelection:
        input.device.targetSelection === null && input.firstAvailableSetId.length > 0,
      implicitSetId:
        input.device.targetSelection === null && input.firstAvailableSetId.length > 0
          ? input.firstAvailableSetId
          : null,
    };
  }

  if (normalizedTargetSelection.kind === "set") {
    return {
      name: input.device.name,
      themeId: normalizeThemeId(input.device.themeId),
      routingMode: "set",
      setId: normalizedTargetSelection.setId ?? "",
      layoutName: "",
      preserveImplicitSelection: false,
      implicitSetId: null,
    };
  }

  return {
    name: input.device.name,
    themeId: normalizeThemeId(input.device.themeId),
    routingMode: "layout",
    setId: "",
    layoutName: normalizedTargetSelection.layoutName ?? "",
    preserveImplicitSelection: false,
    implicitSetId: null,
  };
};

const toUpdatePayload = (
  draft: DeviceDraft,
): {
  name: string;
  themeId: ThemeId;
  targetSelection: ReportScreenTargetSelection | null;
} => ({
  name: draft.name.trim().slice(0, 80),
  themeId: draft.themeId,
  targetSelection:
    draft.preserveImplicitSelection &&
    draft.routingMode === "set" &&
    draft.implicitSetId !== null &&
    draft.setId === draft.implicitSetId
      ? null
      : draft.routingMode === "set"
        ? {
            kind: "set",
            setId: draft.setId.trim().length > 0 ? draft.setId : null,
          }
        : {
            kind: "layout",
            layoutName: draft.layoutName.trim().length > 0 ? draft.layoutName : null,
          },
});

const formatLastSeen = (value: string): string => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }

  const deltaMinutes = Math.round((Date.now() - timestamp) / 60000);
  if (deltaMinutes <= 1) {
    return "Just now";
  }
  if (deltaMinutes < 60) {
    return `${deltaMinutes} min ago`;
  }

  const deltaHours = Math.round(deltaMinutes / 60);
  if (deltaHours < 24) {
    return `${deltaHours} hr ago`;
  }

  const deltaDays = Math.round(deltaHours / 24);
  if (deltaDays < 7) {
    return `${deltaDays} day${deltaDays === 1 ? "" : "s"} ago`;
  }

  return new Date(timestamp).toLocaleString();
};

const formatTimestamp = (value: string | null): string => {
  if (!value) {
    return "Unavailable";
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : value;
};

const formatDurationMinutes = (value: number): string => {
  if (value <= 0) {
    return "Unavailable";
  }

  if (value < 60) {
    return `${value} min`;
  }

  const hours = Math.round((value / 60) * 10) / 10;
  return `${hours} hr`;
};

const formatBytes = (value: number | null | undefined): string => {
  if (value === null || value === undefined || value < 0) {
    return "Unavailable";
  }

  if (value < 1024) {
    return `${value} B`;
  }

  const kb = value / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }

  const mb = kb / 1024;
  if (mb < 1024) {
    return `${mb.toFixed(1)} MB`;
  }

  return `${(mb / 1024).toFixed(1)} GB`;
};

const formatDateTimeAtTimeZone = (value: string | number | null, timeZone?: string): string => {
  if (value === null) {
    return "Unavailable";
  }

  const timestamp = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return typeof value === "string" ? value : "Unavailable";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "full",
    timeStyle: "medium",
    timeZone,
  }).format(new Date(timestamp));
};

const formatDeviceEnvironment = (value: DisplayDeviceInfo | null): string | null => {
  if (!value) {
    return null;
  }

  const parts = [
    value.platform,
    value.browser,
    value.standalone ? "Installed app" : "Browser tab",
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(" · ") : null;
};

const formatViewport = (value: DisplayDeviceInfo | null): string | null => {
  if (!value?.viewportWidth || !value.viewportHeight) {
    return null;
  }

  const base = `${value.viewportWidth} x ${value.viewportHeight}`;
  if (!value.pixelRatio) {
    return base;
  }

  return `${base} @ ${Number(value.pixelRatio.toFixed(2))}x`;
};

const getDeviceMatchKey = (device: DisplayDevice): string | null => {
  if (!device.lastSeenIp || !device.deviceInfo) {
    return null;
  }

  const info = device.deviceInfo;
  return JSON.stringify([
    device.lastSeenIp,
    info.label,
    info.platform,
    info.browser,
    info.formFactor,
    info.viewportWidth,
    info.viewportHeight,
    info.pixelRatio,
    info.standalone,
  ]);
};

const hasValidRoutingTarget = (draft: DeviceDraft): boolean => {
  if (draft.routingMode === "set") {
    return draft.setId.trim().length > 0;
  }

  return draft.layoutName.trim().length > 0;
};

const autosaveStatusText = (input: {
  state: AutosaveState;
  dirty: boolean;
  error?: string | null;
  idleLabel?: string;
  savedLabel?: string;
}): string => {
  if (input.error && input.state === "error") {
    return input.error;
  }
  if (input.state === "saving") {
    return "Saving…";
  }
  if (input.state === "saved") {
    return input.savedLabel ?? "Saved";
  }
  if (input.dirty) {
    return input.idleLabel ?? "Changes save automatically.";
  }
  return input.savedLabel ?? "Saved";
};

type SettingsSection = "devices" | "connections";
type SettingsView = "household" | "calendars" | "system";

const AdminSettingsPage = ({ section }: { section: SettingsSection }) => {
  const token = getAuthToken();
  const navigate = useNavigate();
  const [settingsView, setSettingsView] = useState<SettingsView>("household");
  const [devices, setDevices] = useState<DisplayDevice[]>([]);
  const [screenProfileLayouts, setScreenProfileLayouts] =
    useState<ScreenProfileLayouts>(defaultProfileLayouts);
  const [layoutNames, setLayoutNames] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DeviceDraft>>({});
  const [siteTimeConfig, setSiteTimeConfig] = useState<SiteTimeConfig>(defaultSiteTimeConfig);
  const [siteTimeZoneDraft, setSiteTimeZoneDraft] = useState(defaultSiteTimeConfig.siteTimezone);
  const [siteTimeSaveState, setSiteTimeSaveState] = useState<AutosaveState>("idle");
  const [siteTimeSaveError, setSiteTimeSaveError] = useState<string | null>(null);
  const [calendarFeedsConfig, setCalendarFeedsConfig] = useState<CalendarFeedsConfig>(
    defaultCalendarFeedsConfig,
  );
  const [savedCalendarFeedsConfig, setSavedCalendarFeedsConfig] = useState<CalendarFeedsConfig>(
    defaultCalendarFeedsConfig,
  );
  const [calendarFeedsSaveState, setCalendarFeedsSaveState] = useState<AutosaveState>("idle");
  const [calendarFeedsSaveError, setCalendarFeedsSaveError] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<ServerStatusResponse | null>(null);
  const [serverStatusReceivedAtMs, setServerStatusReceivedAtMs] = useState<number | null>(null);
  const [serverStatusError, setServerStatusError] = useState<string | null>(null);
  const [busyDeviceState, setBusyDeviceState] = useState<{
    deviceId: string;
    action: BusyDeviceAction;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clockTickMs, setClockTickMs] = useState(() => Date.now());
  const [deviceSaveStates, setDeviceSaveStates] = useState<Record<string, AutosaveState>>({});
  const [deviceSaveErrors, setDeviceSaveErrors] = useState<Record<string, string | null>>({});
  const siteTimeAutosaveTimerRef = useRef<number | null>(null);
  const calendarFeedsAutosaveTimerRef = useRef<number | null>(null);
  const deviceAutosaveTimerRef = useRef<Record<string, number>>({});

  const availableSetOptions = useMemo(
    () =>
      Object.entries(screenProfileLayouts.families).map(([id, config]) => ({
        id,
        name: config.name,
        targetAspectRatio: config.targetAspectRatio,
      })),
    [screenProfileLayouts.families],
  );
  const availableSetIds = useMemo(
    () => new Set(availableSetOptions.map((option) => option.id)),
    [availableSetOptions],
  );
  const availableLayoutNames = useMemo(() => new Set(layoutNames), [layoutNames]);
  const firstAvailableSetId = availableSetOptions[0]?.id ?? "";
  const firstAvailableLayoutName = layoutNames[0] ?? "";
  const sharedIpCounts = useMemo(() => {
    const counts = new Map<string, number>();

    for (const device of devices) {
      if (!device.lastSeenIp) {
        continue;
      }

      counts.set(device.lastSeenIp, (counts.get(device.lastSeenIp) ?? 0) + 1);
    }

    return counts;
  }, [devices]);
  const possibleDuplicateOf = useMemo(() => {
    const groups = new Map<string, DisplayDevice[]>();
    const duplicates = new Map<string, DisplayDevice>();

    for (const device of devices) {
      const key = getDeviceMatchKey(device);
      if (!key) continue;
      groups.set(key, [...(groups.get(key) ?? []), device]);
    }

    for (const group of groups.values()) {
      const sorted = [...group].sort(
        (left, right) => Date.parse(right.lastSeenAt) - Date.parse(left.lastSeenAt),
      );
      const primary = sorted[0];
      if (!primary) continue;
      for (const duplicate of sorted.slice(1)) {
        duplicates.set(duplicate.id, primary);
      }
    }

    return duplicates;
  }, [devices]);
  const timeZoneOptions = useMemo(() => getSupportedTimeZoneOptions(), []);
  const siteTimeZoneIsValid = isValidIanaTimeZone(siteTimeZoneDraft.trim());
  const siteTimeDirty = siteTimeZoneDraft.trim() !== siteTimeConfig.siteTimezone;
  const normalizedCalendarFeedsDraft = useMemo<CalendarFeedsConfig>(
    () => ({
      feeds: calendarFeedsConfig.feeds.map((feed) => ({
        ...feed,
        id: normalizeCalendarFeedId(feed.id),
        name: feed.name.trim().slice(0, 80),
        url: feed.url.trim(),
        color: feed.color,
      })),
    }),
    [calendarFeedsConfig],
  );
  const calendarFeedsValidation = useMemo(
    () => calendarFeedsConfigSchema.safeParse(normalizedCalendarFeedsDraft),
    [normalizedCalendarFeedsDraft],
  );
  const effectiveServerNowMs = useMemo(() => {
    if (!serverStatus || serverStatusReceivedAtMs === null) {
      return null;
    }

    const baseMs = Date.parse(serverStatus.timestamp);
    if (!Number.isFinite(baseMs)) {
      return null;
    }

    return baseMs + Math.max(0, clockTickMs - serverStatusReceivedAtMs);
  }, [clockTickMs, serverStatus, serverStatusReceivedAtMs]);
  const deviceHealthNowMs = effectiveServerNowMs ?? clockTickMs;
  const latestDeviceSeenAt = useMemo(
    () =>
      devices.reduce<string | null>(
        (latest, device) =>
          latest === null || Date.parse(device.lastSeenAt) > Date.parse(latest)
            ? device.lastSeenAt
            : latest,
        null,
      ),
    [devices],
  );
  const deviceHealthSummary = useMemo(() => {
    let recentCount = 0;
    let staleCount = 0;

    for (const device of devices) {
      const seenAtMs = Date.parse(device.lastSeenAt);
      if (!Number.isFinite(seenAtMs)) {
        staleCount += 1;
        continue;
      }

      const ageMs = deviceHealthNowMs - seenAtMs;
      if (ageMs <= RECENT_DEVICE_THRESHOLD_MS) {
        recentCount += 1;
      }
      if (ageMs > STALE_DEVICE_THRESHOLD_MS) {
        staleCount += 1;
      }
    }

    return {
      total: devices.length,
      recentCount,
      staleCount,
      latestSeenAt: latestDeviceSeenAt,
    };
  }, [deviceHealthNowMs, devices, latestDeviceSeenAt]);
  const calendarFeedsDirty = useMemo(
    () => JSON.stringify(normalizedCalendarFeedsDraft) !== JSON.stringify(savedCalendarFeedsConfig),
    [normalizedCalendarFeedsDraft, savedCalendarFeedsConfig],
  );
  const householdNowMs = effectiveServerNowMs ?? clockTickMs;
  const householdTimeStatusLabel = effectiveServerNowMs
    ? "Server-synced"
    : "Previewing with this browser clock";

  const loadData = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      navigate("/admin/login", { replace: true });
      return;
    }

    try {
      setError(null);
      const [
        devicesResponse,
        layoutsResponse,
        profileResponse,
        siteTimeResponse,
        calendarFeedsResponse,
        serverStatusResult,
      ] = await Promise.all([
        getDisplayDevices(token),
        getLayouts(false, token),
        getScreenProfileLayouts(token),
        getSiteTimeConfig(token),
        getCalendarFeeds(token),
        getServerStatus()
          .then((data) => ({ data, error: null }))
          .catch((statusError) => ({
            data: null,
            error:
              statusError instanceof Error ? statusError.message : "Failed to load runtime details",
          })),
      ]);

      setDevices(devicesResponse.devices);
      setLayoutNames(layoutsResponse.map((layout) => layout.name));
      setScreenProfileLayouts(profileResponse);
      setSiteTimeConfig(siteTimeResponse);
      setSiteTimeZoneDraft(siteTimeResponse.siteTimezone);
      setCalendarFeedsConfig(calendarFeedsResponse);
      setSavedCalendarFeedsConfig(calendarFeedsResponse);
      setSiteTimeSaveState("idle");
      setSiteTimeSaveError(null);
      setCalendarFeedsSaveState("idle");
      setCalendarFeedsSaveError(null);
      setServerStatus(serverStatusResult.data);
      setServerStatusReceivedAtMs(serverStatusResult.data ? Date.now() : null);
      setServerStatusError(serverStatusResult.error);

      const nextAvailableSetIds = new Set(Object.keys(profileResponse.families));
      const nextFirstAvailableSetId = Object.keys(profileResponse.families)[0] ?? "";
      const nextAvailableLayoutNames = new Set(layoutsResponse.map((layout) => layout.name));
      setDrafts(
        Object.fromEntries(
          devicesResponse.devices.map((device) => [
            device.id,
            toDeviceDraft({
              device,
              availableSetIds: nextAvailableSetIds,
              availableLayoutNames: nextAvailableLayoutNames,
              firstAvailableSetId: nextFirstAvailableSetId,
            }),
          ]),
        ),
      );
      setDeviceSaveStates({});
      setDeviceSaveErrors({});
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load devices");
    }
  }, [navigate]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockTickMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const onLogout = useCallback(() => {
    logoutAdminSession();
  }, []);

  const updateCalendarFeedDraft = (
    index: number,
    updater: (current: CalendarFeed) => CalendarFeed,
  ) => {
    setCalendarFeedsConfig((current) => ({
      feeds: current.feeds.map((feed, feedIndex) => (feedIndex === index ? updater(feed) : feed)),
    }));
  };

  const addCalendarFeedDraft = () => {
    setCalendarFeedsConfig((current) => ({
      feeds: [
        ...current.feeds,
        {
          id: createCalendarFeedId(current.feeds),
          name: "",
          url: "",
          color: getThemeColorSlotByIndex(current.feeds.length),
          enabled: true,
        },
      ],
    }));
  };

  const removeCalendarFeedDraft = (index: number) => {
    setCalendarFeedsConfig((current) => ({
      feeds: current.feeds.filter((_feed, feedIndex) => feedIndex !== index),
    }));
  };

  const setDeviceSaveState = useCallback(
    (deviceId: string, state: AutosaveState, nextError: string | null = null) => {
      setDeviceSaveStates((current) => ({
        ...current,
        [deviceId]: state,
      }));
      setDeviceSaveErrors((current) => ({
        ...current,
        [deviceId]: nextError,
      }));
    },
    [],
  );

  const saveCalendarFeeds = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      navigate("/admin/login", { replace: true });
      return;
    }
    if (!calendarFeedsValidation.success) {
      setCalendarFeedsSaveState("error");
      setCalendarFeedsSaveError(
        calendarFeedsValidation.error.issues[0]?.message ?? "Calendar feeds are not valid yet.",
      );
      return;
    }

    try {
      setCalendarFeedsSaveState("saving");
      setCalendarFeedsSaveError(null);
      const saved = await updateCalendarFeeds(token, calendarFeedsValidation.data);
      setSavedCalendarFeedsConfig(saved);
      setCalendarFeedsConfig((current) =>
        JSON.stringify(current) === JSON.stringify(calendarFeedsValidation.data) ? saved : current,
      );
      setCalendarFeedsSaveState("saved");
    } catch (saveError) {
      setCalendarFeedsSaveState("error");
      setCalendarFeedsSaveError(
        saveError instanceof Error ? saveError.message : "Failed to update calendar feeds",
      );
    }
  }, [calendarFeedsValidation, navigate]);

  const updateDraft = (deviceId: string, updater: (current: DeviceDraft) => DeviceDraft) => {
    setDrafts((current) => {
      const existing = current[deviceId];
      if (!existing) {
        return current;
      }

      return {
        ...current,
        [deviceId]: updater(existing),
      };
    });
  };

  const onSaveDevice = useCallback(
    async (deviceId: string, draftOverride?: DeviceDraft) => {
      const token = getAuthToken();
      if (!token) {
        navigate("/admin/login", { replace: true });
        return;
      }

      const draft = draftOverride ?? drafts[deviceId];
      if (!draft) {
        return;
      }

      try {
        setBusyDeviceState({ deviceId, action: "save" });
        setDeviceSaveState(deviceId, "saving");
        const updated = await updateDisplayDevice(token, deviceId, toUpdatePayload(draft));
        setDevices((current) =>
          current.map((device) => (device.id === updated.id ? updated : device)),
        );
        setDrafts((current) => {
          const currentDraft = current[updated.id];
          const normalizedSavedDraft = toDeviceDraft({
            device: updated,
            availableSetIds,
            availableLayoutNames,
            firstAvailableSetId,
          });
          if (
            currentDraft &&
            JSON.stringify(toUpdatePayload(currentDraft)) !==
              JSON.stringify(toUpdatePayload(normalizedSavedDraft))
          ) {
            return current;
          }

          return {
            ...current,
            [updated.id]: normalizedSavedDraft,
          };
        });
        setDeviceSaveState(deviceId, "saved");
      } catch (saveError) {
        setDeviceSaveState(
          deviceId,
          "error",
          saveError instanceof Error ? saveError.message : "Failed to update device",
        );
      } finally {
        setBusyDeviceState((current) => (current?.deviceId === deviceId ? null : current));
      }
    },
    [
      availableLayoutNames,
      availableSetIds,
      drafts,
      firstAvailableSetId,
      navigate,
      setDeviceSaveState,
    ],
  );

  const onDeleteDevice = async (device: DisplayDevice) => {
    const token = getAuthToken();
    if (!token) {
      navigate("/admin/login", { replace: true });
      return;
    }

    const confirmed = window.confirm(
      `Remove device "${device.name}"? If the screen checks in again it will be recreated with a fresh routing assignment.`,
    );
    if (!confirmed) {
      return;
    }

    try {
      setBusyDeviceState({ deviceId: device.id, action: "delete" });
      setError(null);
      await deleteDisplayDevice(token, device.id);
      setDevices((current) => current.filter((entry) => entry.id !== device.id));
      setDrafts((current) => {
        const nextDrafts = { ...current };
        delete nextDrafts[device.id];
        return nextDrafts;
      });
      setDeviceSaveStates((current) => {
        const next = { ...current };
        delete next[device.id];
        return next;
      });
      setDeviceSaveErrors((current) => {
        const next = { ...current };
        delete next[device.id];
        return next;
      });
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete device");
    } finally {
      setBusyDeviceState((current) => (current?.deviceId === device.id ? null : current));
    }
  };

  const resetDeviceDraft = (device: DisplayDevice) => {
    setDrafts((current) => ({
      ...current,
      [device.id]: toDeviceDraft({
        device,
        availableSetIds,
        availableLayoutNames,
        firstAvailableSetId,
      }),
    }));
    setDeviceSaveState(device.id, "idle");
  };

  useEffect(() => {
    if (siteTimeAutosaveTimerRef.current !== null) {
      window.clearTimeout(siteTimeAutosaveTimerRef.current);
      siteTimeAutosaveTimerRef.current = null;
    }

    if (!token || !siteTimeDirty) {
      return;
    }

    if (!siteTimeZoneIsValid) {
      setSiteTimeSaveState("error");
      setSiteTimeSaveError("Enter a valid IANA timezone such as Australia/Perth.");
      return;
    }

    siteTimeAutosaveTimerRef.current = window.setTimeout(() => {
      void (async () => {
        try {
          setSiteTimeSaveState("saving");
          setSiteTimeSaveError(null);
          const savedTimeZone = siteTimeZoneDraft.trim();
          const updated = await updateSiteTimeConfig(token, {
            siteTimezone: savedTimeZone,
          });
          setSiteTimeConfig(updated);
          setSiteTimeZoneDraft((current) =>
            current.trim() === savedTimeZone ? updated.siteTimezone : current,
          );
          setSiteTimeSaveState("saved");
        } catch (saveError) {
          setSiteTimeSaveState("error");
          setSiteTimeSaveError(
            saveError instanceof Error ? saveError.message : "Failed to update household time",
          );
        }
      })();
    }, AUTOSAVE_DELAY_MS);

    return () => {
      if (siteTimeAutosaveTimerRef.current !== null) {
        window.clearTimeout(siteTimeAutosaveTimerRef.current);
        siteTimeAutosaveTimerRef.current = null;
      }
    };
  }, [siteTimeDirty, siteTimeZoneDraft, siteTimeZoneIsValid, token]);

  useEffect(() => {
    if (calendarFeedsAutosaveTimerRef.current !== null) {
      window.clearTimeout(calendarFeedsAutosaveTimerRef.current);
      calendarFeedsAutosaveTimerRef.current = null;
    }

    if (!token || !calendarFeedsDirty) {
      return;
    }

    if (!calendarFeedsValidation.success) {
      setCalendarFeedsSaveState("error");
      setCalendarFeedsSaveError(
        calendarFeedsValidation.error.issues[0]?.message ?? "Calendar feeds are not valid yet.",
      );
      return;
    }

    calendarFeedsAutosaveTimerRef.current = window.setTimeout(() => {
      void saveCalendarFeeds();
    }, AUTOSAVE_DELAY_MS);

    return () => {
      if (calendarFeedsAutosaveTimerRef.current !== null) {
        window.clearTimeout(calendarFeedsAutosaveTimerRef.current);
        calendarFeedsAutosaveTimerRef.current = null;
      }
    };
  }, [calendarFeedsDirty, calendarFeedsValidation, saveCalendarFeeds, token]);

  useEffect(() => {
    const activeDeviceIds = new Set(devices.map((device) => device.id));
    for (const [deviceId, timerId] of Object.entries(deviceAutosaveTimerRef.current)) {
      if (activeDeviceIds.has(deviceId)) {
        continue;
      }
      window.clearTimeout(timerId);
      delete deviceAutosaveTimerRef.current[deviceId];
    }

    if (!token) {
      return;
    }

    for (const device of devices) {
      const draft =
        drafts[device.id] ??
        toDeviceDraft({
          device,
          availableSetIds,
          availableLayoutNames,
          firstAvailableSetId,
        });
      const payload = toUpdatePayload({
        ...draft,
        name: draft.name.trim().length > 0 ? draft.name : device.name,
      });
      const baselinePayload = toUpdatePayload(
        toDeviceDraft({
          device,
          availableSetIds,
          availableLayoutNames,
          firstAvailableSetId,
        }),
      );
      const isValidDraft = hasValidRoutingTarget(draft);
      const isDirty = JSON.stringify(payload) !== JSON.stringify(baselinePayload);
      const isBusy = busyDeviceState?.deviceId === device.id;

      if (deviceAutosaveTimerRef.current[device.id]) {
        window.clearTimeout(deviceAutosaveTimerRef.current[device.id]);
        delete deviceAutosaveTimerRef.current[device.id];
      }

      if (!isDirty) {
        continue;
      }

      if (!isValidDraft) {
        setDeviceSaveState(device.id, "error", "Choose a valid routing target first.");
        continue;
      }

      if (isBusy) {
        continue;
      }

      deviceAutosaveTimerRef.current[device.id] = window.setTimeout(() => {
        delete deviceAutosaveTimerRef.current[device.id];
        void onSaveDevice(device.id, draft);
      }, AUTOSAVE_DELAY_MS);
    }

    return () => {
      for (const timerId of Object.values(deviceAutosaveTimerRef.current)) {
        window.clearTimeout(timerId);
      }
      deviceAutosaveTimerRef.current = {};
    };
  }, [
    availableLayoutNames,
    availableSetIds,
    busyDeviceState,
    devices,
    drafts,
    firstAvailableSetId,
    onSaveDevice,
    setDeviceSaveState,
    token,
  ]);

  return (
    <PageShell
      title={section === "devices" ? "Displays" : "Settings"}
      subtitle={
        section === "devices"
          ? "Identify each wall display and choose what it should show."
          : "Manage the shared services and preferences that keep your household display running."
      }
      rightActions={<AdminNavActions current={section} onLogout={onLogout} />}
    >
      {error ? (
        <p className="mb-4 rounded border border-rose-500/70 bg-rose-500/10 px-3 py-2 text-rose-200">
          {error}
        </p>
      ) : null}

      <div className={section === "connections" ? "contents" : "hidden"}>
        <nav
          className="mb-6 flex flex-wrap gap-2 rounded-2xl border border-stone-200 bg-white p-2 shadow-[0_8px_28px_rgba(40,52,50,0.04)]"
          aria-label="Settings sections"
        >
          {(
            [
              ["household", "Household"],
              ["calendars", "Calendars"],
              ["system", "System"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setSettingsView(value)}
              className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                settingsView === value
                  ? "bg-teal-700 text-white shadow-sm"
                  : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
              }`}
              aria-current={settingsView === value ? "page" : undefined}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => navigate("/admin/layouts?tab=photos")}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-stone-600 transition hover:bg-stone-100 hover:text-stone-900"
          >
            Photos
          </button>
        </nav>

        <AdminSection className={settingsView === "household" ? "mb-6" : "hidden"}>
          <AdminSectionHeader
            title="Household time"
            description="This timezone controls chores, clocks, time gates, and verse-of-the-day."
            meta={
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/90">
                  Current time
                </p>
                <p className="mt-2 text-base font-semibold text-slate-100">
                  {formatDateTimeAtTimeZone(householdNowMs, siteTimeConfig.siteTimezone)}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {siteTimeConfig.siteTimezone} · {householdTimeStatusLabel}
                </p>
              </div>
            }
          />

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <article className={ADMIN_PANEL_CLASS}>
              <h3 className="text-sm font-semibold text-stone-900">Timezone</h3>
              <div className="mt-3 space-y-3 text-sm text-stone-600">
                <label className={ADMIN_FIELD_LABEL_CLASS}>
                  <span>Household timezone</span>
                  <input
                    list={ADMIN_TIME_ZONE_DATALIST_ID}
                    className={ADMIN_INPUT_CLASS}
                    value={siteTimeZoneDraft}
                    onChange={(event) => setSiteTimeZoneDraft(event.target.value)}
                    placeholder="Australia/Perth"
                  />
                  <datalist id={ADMIN_TIME_ZONE_DATALIST_ID}>
                    {timeZoneOptions.map((timeZone) => (
                      <option key={timeZone} value={timeZone} />
                    ))}
                  </datalist>
                </label>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSiteTimeZoneDraft(getRuntimeTimeZone())}
                    className={ADMIN_BUTTON_SECONDARY_CLASS}
                  >
                    Use browser timezone
                  </button>
                </div>

                <p className="text-xs text-stone-500">
                  Use an IANA timezone such as Australia/Perth or America/New_York.
                </p>
                <p
                  className={`text-xs ${
                    siteTimeSaveState === "error"
                      ? "text-amber-200"
                      : siteTimeSaveState === "saved"
                        ? "text-emerald-200"
                        : "text-slate-400"
                  }`}
                >
                  {siteTimeZoneIsValid
                    ? autosaveStatusText({
                        state: siteTimeSaveState,
                        dirty: siteTimeDirty,
                        error: siteTimeSaveError,
                        idleLabel: "Timezone changes save automatically.",
                        savedLabel: "Timezone saved.",
                      })
                    : "Enter a valid IANA timezone such as Australia/Perth."}
                </p>
              </div>
            </article>

            <article className={ADMIN_PANEL_CLASS}>
              <h3 className="text-sm font-semibold text-stone-900">Status</h3>
              <dl className="mt-3 space-y-3 text-sm text-stone-600">
                <div>
                  <dt className="text-slate-500">Household timezone</dt>
                  <dd className="font-mono text-slate-200">{siteTimeConfig.siteTimezone}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Latest display check-in</dt>
                  <dd>{formatTimestamp(latestDeviceSeenAt)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Clock source</dt>
                  <dd>{householdTimeStatusLabel}</dd>
                </div>
              </dl>
            </article>
          </div>
        </AdminSection>

        <AdminSection className={settingsView === "calendars" ? "mb-6" : "hidden"}>
          <AdminSectionHeader
            title="Calendar feeds"
            description="Store ICS feed URLs once here, then choose them from each calendar module by ID. Feed URLs stay admin-only; layouts and displays only reference saved feed IDs plus optional label and colour overrides."
            actions={
              <button
                type="button"
                onClick={addCalendarFeedDraft}
                className={ADMIN_BUTTON_PRIMARY_CLASS}
              >
                Add feed
              </button>
            }
          />
          <p
            className={`mt-3 text-xs ${
              calendarFeedsSaveState === "error"
                ? "text-amber-200"
                : calendarFeedsSaveState === "saved"
                  ? "text-emerald-200"
                  : "text-slate-400"
            }`}
          >
            {autosaveStatusText({
              state: calendarFeedsSaveState,
              dirty: calendarFeedsDirty,
              error: calendarFeedsSaveError,
              idleLabel: "Feed edits save automatically.",
              savedLabel: "Feeds saved.",
            })}
          </p>

          {calendarFeedsConfig.feeds.length === 0 ? (
            <div className={`mt-4 ${ADMIN_EMPTY_STATE_CLASS}`}>
              <p className="font-semibold text-stone-800">Connect your first calendar</p>
              <p className="mt-1">
                Add an ICS feed to bring family, work, or school events into Hearth.
              </p>
              <button
                type="button"
                onClick={addCalendarFeedDraft}
                className={`mt-3 ${ADMIN_BUTTON_PRIMARY_CLASS}`}
              >
                Add calendar feed
              </button>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {calendarFeedsConfig.feeds.map((feed, index) => (
                <article key={`${feed.id || "draft"}-${index}`} className={ADMIN_PANEL_CLASS}>
                  <div className="grid gap-3 xl:grid-cols-[minmax(0,0.75fr)_minmax(0,0.85fr)_minmax(0,1.7fr)]">
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-slate-300">Name</span>
                      <input
                        className={ADMIN_INPUT_CLASS}
                        type="text"
                        value={feed.name}
                        onChange={(event) =>
                          updateCalendarFeedDraft(index, (current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                        placeholder="School"
                      />
                    </label>

                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-slate-300">Stable ID</span>
                      <input
                        className={`${ADMIN_INPUT_CLASS} font-mono`}
                        type="text"
                        value={feed.id}
                        onChange={(event) =>
                          updateCalendarFeedDraft(index, (current) => ({
                            ...current,
                            id: normalizeCalendarFeedId(event.target.value),
                          }))
                        }
                        placeholder="school"
                      />
                    </label>

                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-slate-300">
                        ICS feed URL or path
                      </span>
                      <input
                        className={ADMIN_INPUT_CLASS}
                        type="text"
                        value={feed.url}
                        onChange={(event) =>
                          updateCalendarFeedDraft(index, (current) => ({
                            ...current,
                            url: event.target.value,
                          }))
                        }
                        placeholder="https://calendar.example.com/family.ics"
                      />
                    </label>
                  </div>

                  <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                    <label className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2">
                      <span className="text-xs font-medium text-slate-300">Colour</span>
                      <ThemePalettePicker
                        compact
                        value={feed.color}
                        onChange={(slot) =>
                          updateCalendarFeedDraft(index, (current) => ({
                            ...current,
                            color: slot,
                          }))
                        }
                      />
                    </label>

                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 whitespace-nowrap rounded border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200">
                        <input
                          type="checkbox"
                          checked={feed.enabled}
                          onChange={(event) =>
                            updateCalendarFeedDraft(index, (current) => ({
                              ...current,
                              enabled: event.target.checked,
                            }))
                          }
                        />
                        <span>Enabled</span>
                      </label>
                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => removeCalendarFeedDraft(index)}
                          className="rounded border border-rose-400/70 px-3 py-2 text-sm font-semibold text-rose-100 hover:bg-rose-500/20"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </AdminSection>
      </div>

      <div className={section === "devices" ? "contents" : "hidden"}>
        <AdminSection className="mb-6">
          <AdminSectionHeader
            title="Connected displays"
            description="Displays appear here after they open the dashboard once. Give each one a clear name so it is easy to tell your screens apart. If multiple screens share the same bridge or proxy IP, the detected device details below are a better identifier than Last seen IP."
            actions={
              <button
                type="button"
                onClick={() => void loadData()}
                className={ADMIN_BUTTON_SECONDARY_CLASS}
              >
                Refresh
              </button>
            }
          />
          {possibleDuplicateOf.size > 0 ? (
            <div className="mt-4 rounded-2xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <p className="font-semibold">
                {possibleDuplicateOf.size} possible duplicate
                {possibleDuplicateOf.size === 1 ? "" : "s"} found
              </p>
              <p className="mt-1 text-amber-800">
                Hearth now keeps one installation ID in both a cookie and browser storage. Older
                matching records are marked below so you can remove them safely.
              </p>
            </div>
          ) : null}
          {devices.length === 0 ? (
            <div className={`mt-4 ${ADMIN_EMPTY_STATE_CLASS}`}>
              <p className="font-semibold text-stone-800">Connect your first display</p>
              <p className="mx-auto mt-1 max-w-xl">
                Open Hearth on the tablet or screen you want to use. It will appear here
                automatically, ready to name and assign to a smart layout.
              </p>
            </div>
          ) : (
            <div className="mt-4 grid gap-4">
              {devices.map((device) => {
                const draft =
                  drafts[device.id] ??
                  toDeviceDraft({
                    device,
                    availableSetIds,
                    availableLayoutNames,
                    firstAvailableSetId,
                  });
                const payload = toUpdatePayload({
                  ...draft,
                  name: draft.name.trim().length > 0 ? draft.name : device.name,
                });
                const baselinePayload = toUpdatePayload(
                  toDeviceDraft({
                    device,
                    availableSetIds,
                    availableLayoutNames,
                    firstAvailableSetId,
                  }),
                );
                const isValidDraft = hasValidRoutingTarget(draft);
                const isDirty = JSON.stringify(payload) !== JSON.stringify(baselinePayload);
                const isBusy = busyDeviceState?.deviceId === device.id;
                const isSaving = isBusy && busyDeviceState?.action === "save";
                const isDeleting = isBusy && busyDeviceState?.action === "delete";
                const deviceSaveState = deviceSaveStates[device.id] ?? "idle";
                const deviceSaveError = deviceSaveErrors[device.id] ?? null;
                const isSharedIp =
                  device.lastSeenIp !== null && (sharedIpCounts.get(device.lastSeenIp) ?? 0) > 1;
                const detectedEnvironment = formatDeviceEnvironment(device.deviceInfo);
                const detectedViewport = formatViewport(device.deviceInfo);
                const possiblePrimary = possibleDuplicateOf.get(device.id) ?? null;
                const deviceAspectRatio =
                  device.deviceInfo?.viewportWidth && device.deviceInfo.viewportHeight
                    ? device.deviceInfo.viewportWidth / device.deviceInfo.viewportHeight
                    : null;
                const recommendedSetId = deviceAspectRatio
                  ? ([...availableSetOptions]
                      .filter(
                        (option): option is typeof option & { targetAspectRatio: number } =>
                          option.targetAspectRatio !== null,
                      )
                      .sort(
                        (left, right) =>
                          Math.abs(Math.log(deviceAspectRatio / left.targetAspectRatio)) -
                          Math.abs(Math.log(deviceAspectRatio / right.targetAspectRatio)),
                      )[0]?.id ?? null)
                  : null;

                return (
                  <AdminSection key={device.id} as="article">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold text-slate-100">{device.name}</h2>
                        {possiblePrimary ? (
                          <p className="mt-2 inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
                            Possible older duplicate of {possiblePrimary.name}
                          </p>
                        ) : null}
                        <p className="mt-1 text-xs text-slate-400">ID: {device.id}</p>
                        {device.deviceInfo?.label ? (
                          <p className="mt-1 text-xs text-slate-400">
                            Detected: {device.deviceInfo.label}
                          </p>
                        ) : null}
                        {detectedEnvironment ? (
                          <p className="mt-1 text-xs text-slate-400">
                            Environment: {detectedEnvironment}
                          </p>
                        ) : null}
                        {detectedViewport ? (
                          <p className="mt-1 text-xs text-slate-400">
                            Viewport: {detectedViewport}
                          </p>
                        ) : null}
                        <p className="mt-1 text-xs text-slate-400">
                          Last seen IP: {device.lastSeenIp ?? "Unavailable"}
                          {isSharedIp ? " (shared/proxied)" : ""}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          Last seen: {formatLastSeen(device.lastSeenAt)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {isDirty ? (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => resetDeviceDraft(device)}
                            className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Reset
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void onDeleteDevice(device)}
                          className="rounded-lg border border-rose-500/70 px-4 py-2 text-sm font-semibold text-rose-200 hover:border-rose-400 hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isDeleting ? "Removing..." : "Remove device"}
                        </button>
                      </div>
                    </div>
                    <p
                      className={`mt-3 text-xs ${
                        deviceSaveState === "error"
                          ? "text-amber-200"
                          : deviceSaveState === "saved"
                            ? "text-emerald-200"
                            : "text-slate-400"
                      }`}
                    >
                      {autosaveStatusText({
                        state: isSaving ? "saving" : deviceSaveState,
                        dirty: isDirty,
                        error: deviceSaveError,
                        idleLabel: isValidDraft
                          ? "Display edits save automatically."
                          : "Choose a valid routing target first.",
                        savedLabel: "Display saved.",
                      })}
                    </p>

                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      <label className="flex flex-col gap-2 text-sm text-slate-300">
                        <span>Display name</span>
                        <input
                          value={draft.name}
                          onChange={(event) =>
                            updateDraft(device.id, (current) => ({
                              ...current,
                              name: event.target.value,
                            }))
                          }
                          className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
                        />
                        <span className="text-xs text-slate-400">
                          Custom device names must be unique.
                        </span>
                      </label>

                      <label className="flex flex-col gap-2 text-sm text-slate-300">
                        <span>Theme</span>
                        <select
                          value={draft.themeId}
                          onChange={(event) =>
                            updateDraft(device.id, (current) => ({
                              ...current,
                              themeId: event.target.value as ThemeId,
                            }))
                          }
                          className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
                        >
                          {THEME_OPTIONS.map((theme) => (
                            <option key={theme.id} value={theme.id}>
                              {theme.label}
                            </option>
                          ))}
                        </select>
                        <ThemePreviewStrip themeId={draft.themeId} />
                      </label>

                      <label className="flex flex-col gap-2 text-sm text-slate-300">
                        <span>Routing mode</span>
                        <select
                          value={draft.routingMode}
                          onChange={(event) =>
                            updateDraft(device.id, (current) => {
                              const nextRoutingMode = event.target.value as DeviceRoutingMode;
                              const nextSetId =
                                current.setId.trim().length > 0 &&
                                availableSetIds.has(current.setId)
                                  ? current.setId
                                  : firstAvailableSetId;
                              const nextLayoutName =
                                current.layoutName.trim().length > 0 &&
                                availableLayoutNames.has(current.layoutName)
                                  ? current.layoutName
                                  : firstAvailableLayoutName;

                              return {
                                ...current,
                                routingMode: nextRoutingMode,
                                setId: nextRoutingMode === "set" ? nextSetId : current.setId,
                                layoutName:
                                  nextRoutingMode === "layout"
                                    ? nextLayoutName
                                    : current.layoutName,
                                preserveImplicitSelection: false,
                              };
                            })
                          }
                          className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
                        >
                          <option value="set">Follow set</option>
                          <option value="layout">Pin layout</option>
                        </select>
                      </label>

                      {draft.routingMode === "set" ? (
                        <label className="flex flex-col gap-2 text-sm text-slate-300">
                          <span>Layout set</span>
                          <select
                            value={draft.setId}
                            onChange={(event) =>
                              updateDraft(device.id, (current) => ({
                                ...current,
                                setId: event.target.value,
                                preserveImplicitSelection: false,
                              }))
                            }
                            className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
                          >
                            <option value="" disabled={availableSetOptions.length > 0}>
                              {availableSetOptions.length === 0
                                ? "No sets available"
                                : "Choose a set..."}
                            </option>
                            {availableSetOptions.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.name}
                                {option.id === recommendedSetId
                                  ? " · recommended for this screen"
                                  : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <label className="flex flex-col gap-2 text-sm text-slate-300">
                          <span>Pinned layout</span>
                          <select
                            value={draft.layoutName}
                            onChange={(event) =>
                              updateDraft(device.id, (current) => ({
                                ...current,
                                layoutName: event.target.value,
                                preserveImplicitSelection: false,
                              }))
                            }
                            className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
                          >
                            <option value="" disabled={layoutNames.length > 0}>
                              {layoutNames.length === 0
                                ? "No layouts available"
                                : "Choose a layout..."}
                            </option>
                            {layoutNames.map((layoutName) => (
                              <option key={layoutName} value={layoutName}>
                                {getLayoutDisplayName(layoutName)}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                  </AdminSection>
                );
              })}
            </div>
          )}
        </AdminSection>
      </div>

      <div
        className={section === "connections" && settingsView === "system" ? "contents" : "hidden"}
      >
        <AdminSection className="mb-6">
          <AdminSectionHeader
            title="Operational health"
            description="Quick diagnostics for display check-ins, calendar cache warmth, and automatic backups."
          />

          <div className="mt-4 grid gap-4 xl:grid-cols-4">
            <article className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
              <h3 className="text-sm font-semibold text-slate-100">Displays</h3>
              <dl className="mt-3 space-y-3 text-sm text-slate-300">
                <div>
                  <dt className="text-slate-500">Total devices</dt>
                  <dd>{deviceHealthSummary.total}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Recent check-ins</dt>
                  <dd>{deviceHealthSummary.recentCount} in the last 15 min</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Stale devices</dt>
                  <dd>{deviceHealthSummary.staleCount} over 1 hr old</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Latest device seen</dt>
                  <dd>{formatTimestamp(deviceHealthSummary.latestSeenAt)}</dd>
                </div>
              </dl>
            </article>

            <article className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
              <h3 className="text-sm font-semibold text-slate-100">Calendar cache</h3>
              <dl className="mt-3 space-y-3 text-sm text-slate-300">
                <div>
                  <dt className="text-slate-500">Enabled feeds</dt>
                  <dd>
                    {serverStatus?.diagnostics.calendar.enabledFeedCount ?? 0} of{" "}
                    {serverStatus?.diagnostics.calendar.configuredFeedCount ?? 0}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Warm source cache</dt>
                  <dd>{serverStatus?.diagnostics.calendar.memoryCacheEntries ?? 0} sources</dd>
                </div>
                <div>
                  <dt className="text-slate-500">In-flight refreshes</dt>
                  <dd>{serverStatus?.diagnostics.calendar.inFlightRefreshes ?? 0}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Last prefetch</dt>
                  <dd>
                    {formatTimestamp(
                      serverStatus?.diagnostics.calendar.lastPrefetchCompletedAt ?? null,
                    )}
                  </dd>
                </div>
              </dl>
            </article>

            <article className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
              <h3 className="text-sm font-semibold text-slate-100">Backups</h3>
              <dl className="mt-3 space-y-3 text-sm text-slate-300">
                <div>
                  <dt className="text-slate-500">Latest backup</dt>
                  <dd>
                    {formatTimestamp(serverStatus?.diagnostics.backup.latestBackupAt ?? null)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Retained backups</dt>
                  <dd>{serverStatus?.diagnostics.backup.backupCount ?? 0}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Backup interval</dt>
                  <dd>
                    {formatDurationMinutes(serverStatus?.diagnostics.backup.intervalMinutes ?? 0)} ·
                    keep {serverStatus?.diagnostics.backup.retentionDays ?? 0} days
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Backup health</dt>
                  <dd
                    className={serverStatus?.diagnostics.backup.lastError ? "text-amber-200" : ""}
                  >
                    {serverStatus?.diagnostics.backup.lastError ?? "Healthy"}
                  </dd>
                </div>
              </dl>
            </article>

            <article className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
              <h3 className="text-sm font-semibold text-slate-100">Storage</h3>
              <dl className="mt-3 space-y-3 text-sm text-slate-300">
                <div>
                  <dt className="text-slate-500">Database size</dt>
                  <dd>
                    {formatBytes(serverStatus?.diagnostics.storage.databaseFileSizeBytes ?? null)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Database updated</dt>
                  <dd>
                    {formatTimestamp(
                      serverStatus?.diagnostics.storage.databaseLastModifiedAt ?? null,
                    )}
                  </dd>
                </div>
              </dl>
            </article>
          </div>
        </AdminSection>

        <AdminSection>
          <AdminSectionHeader
            title="Runtime details"
            description="Only needed when checking what build is actually running."
          />

          {serverStatusError ? (
            <p className="mt-4 rounded border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
              {serverStatusError}
            </p>
          ) : null}

          <article className="mt-4 rounded-lg border border-slate-800 bg-slate-950/60 p-4">
            <dl className="grid gap-4 text-sm text-slate-300 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <dt className="text-slate-500">Status</dt>
                <dd className="text-slate-100">{serverStatus?.ok ? "Healthy" : "Unavailable"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Started</dt>
                <dd>{formatTimestamp(serverStatus?.processStartedAt ?? null)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Web build</dt>
                <dd>{formatTimestamp(serverStatus?.build.webIndexBuiltAt ?? null)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Server timezone</dt>
                <dd className="font-mono text-slate-200">
                  {serverStatus?.time?.runtimeTimeZone ?? "Unavailable"}
                </dd>
              </div>
            </dl>
          </article>
        </AdminSection>
      </div>
    </PageShell>
  );
};

export const AdminDevicesPage = () => <AdminSettingsPage section="devices" />;

export const AdminConnectionsPage = () => <AdminSettingsPage section="connections" />;
