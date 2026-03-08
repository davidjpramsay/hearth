import GridLayout from "react-grid-layout";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  reportScreenTargetSelectionSchema,
  type GridItem,
  type LayoutRecord,
  type ModuleInstance,
  type PhotosOrientation,
  type ReportScreenProfileLayoutOption,
  type ReportScreenProfileSetOption,
  type ReportScreenTargetSelection,
} from "@hearth/shared";
import { reportScreenProfile } from "../api/client";
import {
  inferLayoutRows,
  sanitizeGridItems,
} from "../layout/grid-math";
import {
  getDisplaySettingsCogVisible,
  subscribeToDisplaySettingsCogVisibility,
} from "../preferences/display-settings-cog";
import { moduleRegistry } from "../registry/module-registry";

const FALLBACK_VIEWPORT = {
  width: 1920,
  height: 1080,
};
const ORIENTATION_SWITCH_HOLDOFF_MS = 0;
const SCREEN_SESSION_ID_STORAGE_KEY = "hearth:screen-session-id";
const DEVICE_LAYOUT_FAMILY_STORAGE_KEY = "hearth:device-layout-family";
const DEVICE_SCREEN_TARGET_SELECTION_STORAGE_KEY =
  "hearth:device-screen-target-selection";
const DISPLAY_SOURCE_KIND_STORAGE_KEY = "hearth:display-source-kind";
const DISPLAY_CYCLE_SECONDS_STORAGE_KEY = "hearth:display-cycle-seconds";
const DISPLAY_PHOTO_COLLECTION_ID_STORAGE_KEY = "hearth:display-photo-collection-id";
const DISPLAY_CYCLE_CONTEXT_EVENT = "hearth:display-cycle-context";

interface DisplayCycleContextEventDetail {
  sourceKind: "set" | "layout";
  cycleSeconds: number | null;
  photoCollectionId: string | null;
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

const getDeviceTargetSelection = (): ReportScreenTargetSelection => {
  if (typeof window === "undefined") {
    return {
      kind: "set",
      setId: null,
    };
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

const persistDeviceTargetSelection = (targetSelection: ReportScreenTargetSelection): void => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      DEVICE_SCREEN_TARGET_SELECTION_STORAGE_KEY,
      JSON.stringify(targetSelection),
    );
    if (targetSelection.kind === "set" && targetSelection.setId) {
      window.localStorage.setItem(DEVICE_LAYOUT_FAMILY_STORAGE_KEY, targetSelection.setId);
    } else {
      window.localStorage.removeItem(DEVICE_LAYOUT_FAMILY_STORAGE_KEY);
    }
  } catch {
    // Ignore localStorage write failures.
  }
};

const publishDisplayCycleContext = (detail: DisplayCycleContextEventDetail): void => {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedCycleSeconds =
    typeof detail.cycleSeconds === "number" && Number.isFinite(detail.cycleSeconds)
      ? Math.max(3, Math.min(3600, Math.round(detail.cycleSeconds)))
      : null;

  try {
    window.localStorage.setItem(DISPLAY_SOURCE_KIND_STORAGE_KEY, detail.sourceKind);
    if (normalizedCycleSeconds === null) {
      window.localStorage.removeItem(DISPLAY_CYCLE_SECONDS_STORAGE_KEY);
    } else {
      window.localStorage.setItem(
        DISPLAY_CYCLE_SECONDS_STORAGE_KEY,
        String(normalizedCycleSeconds),
      );
    }
    if (detail.photoCollectionId && detail.photoCollectionId.trim().length > 0) {
      window.localStorage.setItem(
        DISPLAY_PHOTO_COLLECTION_ID_STORAGE_KEY,
        detail.photoCollectionId.trim(),
      );
    } else {
      window.localStorage.removeItem(DISPLAY_PHOTO_COLLECTION_ID_STORAGE_KEY);
    }
  } catch {
    // Ignore localStorage write failures.
  }

  window.dispatchEvent(
    new CustomEvent<DisplayCycleContextEventDetail>(DISPLAY_CYCLE_CONTEXT_EVENT, {
      detail: {
        sourceKind: detail.sourceKind,
        cycleSeconds: normalizedCycleSeconds,
        photoCollectionId:
          detail.photoCollectionId && detail.photoCollectionId.trim().length > 0
            ? detail.photoCollectionId.trim()
            : null,
      },
    }),
  );
};

const areSameTargetSelection = (
  left: ReportScreenTargetSelection,
  right: ReportScreenTargetSelection,
): boolean => {
  if (left.kind === "set") {
    if (right.kind !== "set") {
      return false;
    }
    return left.setId === right.setId;
  }

  if (right.kind !== "layout") {
    return false;
  }

  return left.layoutName === right.layoutName;
};

const normalizeTargetSelection = (input: {
  targetSelection: ReportScreenTargetSelection;
  availableSets: ReportScreenProfileSetOption[];
  availableLayouts: ReportScreenProfileLayoutOption[];
}): ReportScreenTargetSelection => {
  const targetSelection = input.targetSelection;

  if (targetSelection.kind === "set") {
    const hasSet =
      targetSelection.setId !== null &&
      input.availableSets.some((set) => set.id === targetSelection.setId);

    return {
      kind: "set",
      setId: hasSet ? targetSelection.setId : (input.availableSets[0]?.id ?? null),
    };
  }

  const hasLayout =
    targetSelection.layoutName !== null &&
    input.availableLayouts.some(
      (layout) => layout.name === targetSelection.layoutName,
    );

  return {
    kind: "layout",
    layoutName: hasLayout ? targetSelection.layoutName : (input.availableLayouts[0]?.name ?? null),
  };
};

const createScreenSessionId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};

const getOrCreateScreenSessionId = (): string => {
  if (typeof window === "undefined") {
    return "server-session";
  }

  try {
    const existing = window.localStorage.getItem(SCREEN_SESSION_ID_STORAGE_KEY)?.trim();
    if (existing) {
      return existing;
    }

    const generated = createScreenSessionId();
    window.localStorage.setItem(SCREEN_SESSION_ID_STORAGE_KEY, generated);
    return generated;
  } catch {
    return createScreenSessionId();
  }
};

const getViewportSize = (): { width: number; height: number } => {
  if (typeof window === "undefined") {
    return FALLBACK_VIEWPORT;
  }

  return {
    width: Math.max(1, Math.round(window.innerWidth)),
    height: Math.max(1, Math.round(window.innerHeight)),
  };
};

interface GridDisplayMetrics {
  cols: number;
  rowHeight: number;
  width: number;
  height: number;
  maxRows: number;
}

interface PhotosOrientationEventDetail {
  instanceId: string;
  orientation: PhotosOrientation | null;
  frameId?: string | null;
  eventToken?: string | null;
}

const areSameLayoutSnapshot = (
  left: LayoutRecord | null,
  right: LayoutRecord | null,
): boolean => {
  if (left === null && right === null) {
    return true;
  }

  if (left === null || right === null) {
    return false;
  }

  return left.id === right.id && left.version === right.version;
};

export const DashboardPage = () => {
  const [activeLayout, setActiveLayout] = useState<LayoutRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewportSize, setViewportSize] = useState(getViewportSize);
  const [photoOrientationHint, setPhotoOrientationHint] =
    useState<PhotosOrientation | null>(null);
  const [deviceTargetSelection, setDeviceTargetSelection] =
    useState<ReportScreenTargetSelection>(getDeviceTargetSelection);
  const [deviceFamilyOptions, setDeviceFamilyOptions] = useState<ReportScreenProfileSetOption[]>(
    [],
  );
  const [deviceLayoutOptions, setDeviceLayoutOptions] = useState<
    ReportScreenProfileLayoutOption[]
  >([]);
  const [devicePanelOpen, setDevicePanelOpen] = useState(false);
  const [displaySettingsCogVisible, setDisplaySettingsCogVisible] = useState<boolean>(() =>
    getDisplaySettingsCogVisible(),
  );
  const [nextCycleAtMs, setNextCycleAtMs] = useState<number | null>(null);
  const activeLayoutRef = useRef<LayoutRecord | null>(null);
  const photoOrientationRef = useRef<PhotosOrientation | null>(null);
  const deviceTargetSelectionRef = useRef<ReportScreenTargetSelection>(deviceTargetSelection);
  const latestResolveRequestIdRef = useRef(0);
  const lastPhotoEventKeyRef = useRef<string | null>(null);
  const screenSessionIdRef = useRef<string>(getOrCreateScreenSessionId());
  const lastOrientationSwitchAtRef = useRef(0);
  const primaryPhotosInstanceId = useMemo(
    () =>
      activeLayout?.config.modules.find((instance) => instance.moduleId === "photos")?.id ??
      null,
    [activeLayout],
  );

  useEffect(() => {
    activeLayoutRef.current = activeLayout;
  }, [activeLayout]);

  useEffect(() => {
    photoOrientationRef.current = photoOrientationHint;
  }, [photoOrientationHint]);

  useEffect(() => {
    deviceTargetSelectionRef.current = deviceTargetSelection;
  }, [deviceTargetSelection]);

  const updateDeviceTargetSelection = useCallback(
    (nextSelection: ReportScreenTargetSelection) => {
      const parsedSelection = reportScreenTargetSelectionSchema.parse(nextSelection);
      persistDeviceTargetSelection(parsedSelection);
      deviceTargetSelectionRef.current = parsedSelection;
      setDeviceTargetSelection(parsedSelection);
    },
    [],
  );

  const resolveLayout = useCallback(
    async (input?: { orientation?: PhotosOrientation | null }) => {
      const requestId = latestResolveRequestIdRef.current + 1;
      latestResolveRequestIdRef.current = requestId;
      const orientation = input?.orientation ?? photoOrientationRef.current;
      const currentTargetSelection = deviceTargetSelectionRef.current;

      try {
        const resolution = await reportScreenProfile({
          targetSelection: currentTargetSelection,
          selectedFamily:
            currentTargetSelection.kind === "set"
              ? currentTargetSelection.setId
              : null,
          photoOrientation: orientation,
          screenSessionId: screenSessionIdRef.current,
        });
        if (requestId !== latestResolveRequestIdRef.current) {
          return;
        }
        setDeviceFamilyOptions(resolution.availableSets);
        setDeviceLayoutOptions(resolution.availableLayouts);
        const normalizedSelection = normalizeTargetSelection({
          targetSelection: currentTargetSelection,
          availableSets: resolution.availableSets,
          availableLayouts: resolution.availableLayouts,
        });
        if (!areSameTargetSelection(normalizedSelection, currentTargetSelection)) {
          updateDeviceTargetSelection(normalizedSelection);
        }
        setNextCycleAtMs(resolution.nextCycleAtMs);
        publishDisplayCycleContext({
          sourceKind: normalizedSelection.kind,
          cycleSeconds:
            normalizedSelection.kind === "set" ? resolution.autoCycleSeconds : null,
          photoCollectionId:
            normalizedSelection.kind === "set"
              ? resolution.selectedPhotoCollectionId
              : null,
        });
        const nextLayout = resolution.layout;
        const currentLayout = activeLayoutRef.current;

        if (areSameLayoutSnapshot(currentLayout, nextLayout)) {
          setError(null);
          return;
        }

        setActiveLayout(nextLayout);

        setError(null);
      } catch (loadError) {
        if (requestId !== latestResolveRequestIdRef.current) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "Failed to load");
      }
    },
    [updateDeviceTargetSelection],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void resolveLayout({ orientation: photoOrientationRef.current });
    }, 100);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    resolveLayout,
    deviceTargetSelection,
  ]);

  useEffect(() => {
    if (nextCycleAtMs === null) {
      return;
    }

    const delayMs = Math.max(120, nextCycleAtMs - Date.now() + 25);
    const timer = window.setTimeout(() => {
      void resolveLayout({ orientation: photoOrientationRef.current });
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [nextCycleAtMs, resolveLayout]);

  useEffect(() => {
    const eventSource = new EventSource("/api/events/layouts");

    const handleLayoutChange = () => {
      void resolveLayout({ orientation: photoOrientationRef.current });
    };
    const handleChoresUpdated = () => {
      window.dispatchEvent(new CustomEvent("hearth:chores-updated"));
    };

    eventSource.addEventListener("layout-updated", handleLayoutChange);
    eventSource.addEventListener("chores-updated", handleChoresUpdated);

    eventSource.onerror = () => {
      window.setTimeout(() => {
        void resolveLayout({ orientation: photoOrientationRef.current });
      }, 2000);
    };

    return () => {
      eventSource.removeEventListener("layout-updated", handleLayoutChange);
      eventSource.removeEventListener("chores-updated", handleChoresUpdated);
      eventSource.close();
    };
  }, [resolveLayout]);

  useEffect(() => {
    const updateViewport = () => {
      setViewportSize(getViewportSize());
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => {
      window.removeEventListener("resize", updateViewport);
    };
  }, []);

  useEffect(
    () => subscribeToDisplaySettingsCogVisibility(setDisplaySettingsCogVisible),
    [],
  );

  useEffect(() => {
    if (!displaySettingsCogVisible) {
      setDevicePanelOpen(false);
    }
  }, [displaySettingsCogVisible]);

  useEffect(() => {
    const handlePhotosOrientation = (event: Event) => {
      const detail = (event as CustomEvent<PhotosOrientationEventDetail>).detail;
      if (!detail || detail.instanceId !== primaryPhotosInstanceId) {
        return;
      }

      if (detail.orientation !== "portrait" && detail.orientation !== "landscape") {
        return;
      }

      const eventKey = [
        detail.eventToken ?? detail.frameId ?? "unknown",
        detail.orientation,
      ].join(":");
      if (lastPhotoEventKeyRef.current === eventKey) {
        return;
      }
      lastPhotoEventKeyRef.current = eventKey;

      const currentOrientation = photoOrientationRef.current;
      if (currentOrientation !== detail.orientation) {
        const nowMs = Date.now();
        if (
          ORIENTATION_SWITCH_HOLDOFF_MS > 0 &&
          currentOrientation !== null &&
          nowMs - lastOrientationSwitchAtRef.current < ORIENTATION_SWITCH_HOLDOFF_MS
        ) {
          return;
        }

        lastOrientationSwitchAtRef.current = nowMs;
        photoOrientationRef.current = detail.orientation;
        setPhotoOrientationHint(detail.orientation);
        void resolveLayout({ orientation: detail.orientation });
      }
    };

    window.addEventListener("hearth:photos-orientation", handlePhotosOrientation as EventListener);
    return () => {
      window.removeEventListener(
        "hearth:photos-orientation",
        handlePhotosOrientation as EventListener,
      );
    };
  }, [primaryPhotosInstanceId, resolveLayout]);

  const mapRenderedModules = useCallback((layout: LayoutRecord | null) => {
    if (!layout) {
      return [] as Array<{
        instance: ModuleInstance;
        moduleDefinition: ReturnType<typeof moduleRegistry.getModule>;
      }>;
    }

    return layout.config.modules.map((instance) => ({
      instance,
      moduleDefinition: moduleRegistry.getModule(instance.moduleId),
    }));
  }, []);

  const mapTranslatedLayoutItems = useCallback(
    (layout: LayoutRecord | null) => {
      if (!layout) {
        return [] as GridItem[];
      }

      return sanitizeGridItems({
        items: layout.config.items,
        modules: layout.config.modules,
        sourceCols: layout.config.cols,
        sourceRows: inferLayoutRows(layout.config),
        targetCols: layout.config.cols,
        targetRows: inferLayoutRows(layout.config),
      });
    },
    [],
  );

  const activeRenderedModules = useMemo(
    () => mapRenderedModules(activeLayout),
    [activeLayout, mapRenderedModules],
  );

  const activeTranslatedLayoutItems = useMemo(
    () => mapTranslatedLayoutItems(activeLayout),
    [activeLayout, mapTranslatedLayoutItems],
  );

  const gridDisplayMetrics = useMemo(() => {
    if (!activeLayout) {
      return null;
    }

    const rows = inferLayoutRows(activeLayout.config);
    const cols = Math.max(1, activeLayout.config.cols);
    const storedRowHeight = Math.max(
      1,
      Number.isFinite(activeLayout.config.rowHeight)
        ? Math.round(activeLayout.config.rowHeight)
        : 1,
    );
    const baseWidth = Math.max(1, cols * storedRowHeight);
    const baseHeight = Math.max(1, rows * storedRowHeight);
    const scale = Math.min(
      viewportSize.width / baseWidth,
      viewportSize.height / baseHeight,
    );
    const rowHeight = Math.max(1, storedRowHeight * scale);
    const width = Math.max(1, cols * rowHeight);
    const height = Math.max(1, rows * rowHeight);

    return {
      cols,
      rowHeight,
      width,
      height,
      maxRows: rows,
    };
  }, [activeLayout, viewportSize.height, viewportSize.width]);

  const activeHasPlacedModules =
    activeRenderedModules.length > 0 && activeTranslatedLayoutItems.length > 0;
  const selectedSetName =
    deviceTargetSelection.kind === "set"
      ? (deviceFamilyOptions.find((option) => option.id === deviceTargetSelection.setId)?.name ??
        "Not selected")
      : "Not selected";
  const selectedLayoutName =
    deviceTargetSelection.kind === "layout"
      ? (deviceLayoutOptions.find((option) => option.name === deviceTargetSelection.layoutName)
          ?.name ??
        "Not selected")
      : "Not selected";

  const handleRoutingModeChange = (kind: "set" | "layout") => {
    if (kind === deviceTargetSelection.kind) {
      return;
    }

    if (kind === "set") {
      updateDeviceTargetSelection({
        kind: "set",
        setId: deviceFamilyOptions[0]?.id ?? null,
      });
      return;
    }

    updateDeviceTargetSelection({
      kind: "layout",
      layoutName: deviceLayoutOptions[0]?.name ?? null,
    });
  };

  const renderLayoutLayer = (input: {
    renderedModules: typeof activeRenderedModules;
    translatedLayoutItems: GridItem[];
    metrics: GridDisplayMetrics;
    className?: string;
  }) => (
    <div className={input.className}>
      <GridLayout
        width={input.metrics.width}
        className="layout"
        style={{ height: `${input.metrics.height}px` }}
        layout={input.translatedLayoutItems}
        cols={input.metrics.cols}
        rowHeight={input.metrics.rowHeight}
        maxRows={input.metrics.maxRows}
        autoSize={false}
        isDraggable={false}
        isResizable={false}
        compactType={null}
        margin={[0, 0]}
        containerPadding={[0, 0]}
        useCSSTransforms
      >
        {input.renderedModules.map(({ instance, moduleDefinition }) => (
          <div
            key={instance.id}
            className="h-full w-full min-h-0"
          >
            {moduleDefinition ? (
              <div className="h-full w-full min-h-0 overflow-hidden rounded-lg">
                <moduleDefinition.DashboardTile
                  instanceId={instance.id}
                  config={instance.config}
                />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center rounded bg-slate-800 text-sm text-rose-200">
                Missing module: {instance.moduleId}
              </div>
            )}
          </div>
        ))}
      </GridLayout>
    </div>
  );

  return (
    <div
      className="overflow-hidden bg-slate-950"
      style={{
        width: "100vw",
        height: "100dvh",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        paddingLeft: "env(safe-area-inset-left, 0px)",
        boxSizing: "border-box",
      }}
    >
      <main className="relative h-full w-full text-slate-100">
        {error ? (
          <p className="absolute left-4 top-4 z-20 rounded border border-rose-500/60 bg-rose-500/10 px-3 py-2 text-rose-100">
            {error}
          </p>
        ) : null}

        {displaySettingsCogVisible && devicePanelOpen ? (
          <button
            type="button"
            aria-label="Close screen routing panel"
            className="absolute inset-0 z-20 bg-transparent"
            onClick={() => setDevicePanelOpen(false)}
          />
        ) : null}

        {displaySettingsCogVisible ? (
          <div className="absolute bottom-3 right-3 z-30">
            <button
              type="button"
              onClick={() => setDevicePanelOpen((current) => !current)}
              aria-label="Display source settings"
              title="Display source settings"
              className={`flex h-9 w-9 items-center justify-center rounded-full border bg-slate-900/85 text-slate-200 transition ${
                devicePanelOpen
                  ? "border-cyan-400/80 text-cyan-200"
                  : "border-slate-500/70 hover:border-cyan-400/80"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
                aria-hidden="true"
              >
                <path d="M12 15.75A3.75 3.75 0 1 0 12 8.25a3.75 3.75 0 0 0 0 7.5Z" />
                <path d="M19.5 15a1.5 1.5 0 0 0 .3 1.65l.06.06a1.8 1.8 0 0 1-2.55 2.55l-.06-.06A1.5 1.5 0 0 0 15.6 19.5a1.5 1.5 0 0 0-.9 1.35V21a1.8 1.8 0 0 1-3.6 0v-.09a1.5 1.5 0 0 0-.9-1.35 1.5 1.5 0 0 0-1.65.3l-.06.06a1.8 1.8 0 0 1-2.55-2.55l.06-.06A1.5 1.5 0 0 0 4.5 15.6a1.5 1.5 0 0 0-1.35-.9H3a1.8 1.8 0 0 1 0-3.6h.15a1.5 1.5 0 0 0 1.35-.9 1.5 1.5 0 0 0-.3-1.65l-.06-.06a1.8 1.8 0 0 1 2.55-2.55l.06.06A1.5 1.5 0 0 0 8.4 4.5a1.5 1.5 0 0 0 .9-1.35V3a1.8 1.8 0 0 1 3.6 0v.15a1.5 1.5 0 0 0 .9 1.35 1.5 1.5 0 0 0 1.65-.3l.06-.06a1.8 1.8 0 0 1 2.55 2.55l-.06.06A1.5 1.5 0 0 0 19.5 8.4a1.5 1.5 0 0 0 1.35.9H21a1.8 1.8 0 0 1 0 3.6h-.15a1.5 1.5 0 0 0-1.35.9Z" />
              </svg>
            </button>

            {devicePanelOpen ? (
              <div className="mt-2 w-64 rounded-md border border-slate-600 bg-slate-900/95 p-3 text-xs text-slate-200 shadow-xl">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                  Display source
                </p>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Source type
                </label>
                <select
                  className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-2 text-sm text-slate-100"
                  value={deviceTargetSelection.kind}
                  onChange={(event) =>
                    handleRoutingModeChange(
                      event.target.value === "layout" ? "layout" : "set",
                    )
                  }
                >
                  <option value="set">Follow Set</option>
                  <option value="layout">Pin Layout</option>
                </select>

                {deviceTargetSelection.kind === "set" ? (
                  <>
                    <p className="mb-2 mt-3 text-[11px] text-slate-400">
                      Using set: {selectedSetName}
                    </p>
                    <select
                      className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-2 text-sm text-slate-100"
                      value={deviceTargetSelection.setId ?? ""}
                      onChange={(event) =>
                        updateDeviceTargetSelection({
                          kind: "set",
                          setId: event.target.value || null,
                        })
                      }
                    >
                      {deviceFamilyOptions.length === 0 ? (
                        <option value="">No sets available</option>
                      ) : null}
                      {deviceFamilyOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <>
                    <p className="mb-2 mt-3 text-[11px] text-slate-400">
                      Pinned layout: {selectedLayoutName}
                    </p>
                    <select
                      className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-2 text-sm text-slate-100"
                      value={deviceTargetSelection.layoutName ?? ""}
                      onChange={(event) =>
                        updateDeviceTargetSelection({
                          kind: "layout",
                          layoutName: event.target.value || null,
                        })
                      }
                    >
                      {deviceLayoutOptions.length === 0 ? (
                        <option value="">No layouts available</option>
                      ) : null}
                      {deviceLayoutOptions.map((option) => (
                        <option key={option.name} value={option.name}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                <p className="mt-2 text-[11px] text-slate-400">
                  Saved per device/browser.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {!activeLayout ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-2xl border border-slate-700 bg-slate-900/70 text-center text-slate-300">
            <h1 className="font-display text-4xl font-bold text-slate-100">Hearth</h1>
            <p className="text-lg text-slate-200">Hearth — Home is where the Hearth is.</p>
            <p>
              No display layout is configured for this screen. Use /admin to map a layout set or
              select a single layout.
            </p>
          </div>
        ) : !activeHasPlacedModules ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-6 text-center text-amber-100">
            <h1 className="font-display text-3xl font-semibold">Layout is empty</h1>
            <p className="max-w-2xl text-base text-amber-100/90">
              The active layout has no placed modules. Open `/admin` to add modules to this
              layout or set a different layout as active.
            </p>
          </div>
        ) : gridDisplayMetrics ? (
          <div className="flex h-full w-full items-center justify-center">
            <div
              className="relative overflow-hidden"
              style={{
                width: `${gridDisplayMetrics.width}px`,
                height: `${gridDisplayMetrics.height}px`,
              }}
            >
              {renderLayoutLayer({
                renderedModules: activeRenderedModules,
                translatedLayoutItems: activeTranslatedLayoutItems,
                metrics: gridDisplayMetrics,
                className: "absolute inset-0",
              })}
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
};
