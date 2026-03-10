import GridLayout from "react-grid-layout";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type DisplayDeviceRuntime,
  type GridItem,
  type LayoutRecord,
  type ModuleInstance,
  type PhotosOrientation,
} from "@hearth/shared";
import { reportScreenProfile } from "../api/client";
import { getOrCreateDeviceId } from "../device/device-id";
import {
  inferLayoutRows,
  sanitizeGridItems,
} from "../layout/grid-math";
import {
  getDashboardDeviceBootstrapStateFromResolution,
  getInitialDashboardDeviceBootstrapState,
} from "./dashboard-device-bootstrap";
import { moduleRegistry } from "../registry/module-registry";
import { applyTheme } from "../theme/theme";

const FALLBACK_VIEWPORT = {
  width: 1920,
  height: 1080,
};
const ORIENTATION_SWITCH_HOLDOFF_MS = 0;
const DISPLAY_SOURCE_KIND_STORAGE_KEY = "hearth:display-source-kind";
const DISPLAY_CYCLE_SECONDS_STORAGE_KEY = "hearth:display-cycle-seconds";
const DISPLAY_PHOTO_COLLECTION_ID_STORAGE_KEY = "hearth:display-photo-collection-id";
const DISPLAY_CYCLE_CONTEXT_EVENT = "hearth:display-cycle-context";

interface DisplayCycleContextEventDetail {
  sourceKind: "set" | "layout";
  cycleSeconds: number | null;
  photoCollectionId: string | null;
}

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

interface DisplayDeviceUpdatedEventDetail {
  deviceId: string;
}

const DeviceIdentityCard = (props: {
  device: DisplayDeviceRuntime | null;
  fallbackDeviceId: string;
  message: string;
}) => (
  <div className="w-full max-w-xl rounded-2xl border border-slate-700/80 bg-slate-950/70 px-4 py-3 text-left shadow-2xl shadow-slate-950/30">
    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-300/90">
      This display
    </p>
    <p className="mt-2 text-lg font-semibold text-slate-100">
      {props.device?.name ?? "Registering display..."}
    </p>
    <p className="mt-1 break-all text-sm text-slate-400">
      ID: {props.device?.id ?? props.fallbackDeviceId}
    </p>
    <p className="mt-3 text-sm text-slate-300">{props.message}</p>
  </div>
);

const parseEventSourcePayload = <T,>(event: Event): T | null => {
  const data = (event as MessageEvent<unknown>).data;
  if (typeof data !== "string") {
    return null;
  }

  try {
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
};

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
  const [deviceIdentity, setDeviceIdentity] = useState<DisplayDeviceRuntime | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewportSize, setViewportSize] = useState(getViewportSize);
  const [photoOrientationHint, setPhotoOrientationHint] =
    useState<PhotosOrientation | null>(null);
  const [nextCycleAtMs, setNextCycleAtMs] = useState<number | null>(null);
  const activeLayoutRef = useRef<LayoutRecord | null>(null);
  const photoOrientationRef = useRef<PhotosOrientation | null>(null);
  const latestResolveRequestIdRef = useRef(0);
  const lastPhotoEventKeyRef = useRef<string | null>(null);
  const deviceIdRef = useRef<string>(getOrCreateDeviceId());
  const deviceBootstrapRef = useRef(getInitialDashboardDeviceBootstrapState());
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

  const resolveLayout = useCallback(
    async (input?: { orientation?: PhotosOrientation | null }) => {
      const requestId = latestResolveRequestIdRef.current + 1;
      latestResolveRequestIdRef.current = requestId;
      const orientation = input?.orientation ?? photoOrientationRef.current;
      const bootstrapState = deviceBootstrapRef.current;

      try {
        const resolution = await reportScreenProfile({
          targetSelection: bootstrapState.targetSelection,
          selectedFamily:
            bootstrapState.targetSelection.kind === "set"
              ? bootstrapState.targetSelection.setId
              : null,
          photoOrientation: orientation,
          reportedThemeId: bootstrapState.reportedThemeId,
          screenSessionId: deviceIdRef.current,
        });
        if (requestId !== latestResolveRequestIdRef.current) {
          return;
        }
        deviceBootstrapRef.current =
          getDashboardDeviceBootstrapStateFromResolution(resolution);
        setDeviceIdentity(resolution.device);
        applyTheme(resolution.device.themeId);
        setNextCycleAtMs(resolution.nextCycleAtMs);
        publishDisplayCycleContext({
          sourceKind: resolution.resolvedTargetSelection.kind,
          cycleSeconds:
            resolution.resolvedTargetSelection.kind === "set"
              ? resolution.autoCycleSeconds
              : null,
          photoCollectionId:
            resolution.resolvedTargetSelection.kind === "set"
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
    [],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void resolveLayout({ orientation: photoOrientationRef.current });
    }, 100);

    return () => {
      window.clearTimeout(timer);
    };
  }, [resolveLayout]);

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
    const handleDeviceUpdated = (event: Event) => {
      const detail = parseEventSourcePayload<DisplayDeviceUpdatedEventDetail>(event);
      if (!detail || detail.deviceId !== deviceIdRef.current) {
        return;
      }

      void resolveLayout({ orientation: photoOrientationRef.current });
    };

    eventSource.addEventListener("layout-updated", handleLayoutChange);
    eventSource.addEventListener("chores-updated", handleChoresUpdated);
    eventSource.addEventListener("display-device-updated", handleDeviceUpdated);

    eventSource.onerror = () => {
      window.setTimeout(() => {
        void resolveLayout({ orientation: photoOrientationRef.current });
      }, 2000);
    };

    return () => {
      eventSource.removeEventListener("layout-updated", handleLayoutChange);
      eventSource.removeEventListener("chores-updated", handleChoresUpdated);
      eventSource.removeEventListener("display-device-updated", handleDeviceUpdated);
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

        {!activeLayout ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-2xl border border-slate-700 bg-slate-900/70 text-center text-slate-300">
            <h1 className="font-display text-4xl font-bold text-slate-100">Hearth</h1>
            <p className="text-lg text-slate-200">Hearth — Home is where the Hearth is.</p>
            <p>
              No display layout is configured for this screen. Use Admin &gt; Devices to assign a
              set or pinned layout for this display.
            </p>
            <DeviceIdentityCard
              device={deviceIdentity}
              fallbackDeviceId={deviceIdRef.current}
              message="Use Admin > Devices to match this screen, rename it, and assign its layout."
            />
          </div>
        ) : !activeHasPlacedModules ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-6 text-center text-amber-100">
            <h1 className="font-display text-3xl font-semibold">Layout is empty</h1>
            <p className="max-w-2xl text-base text-amber-100/90">
              The active layout has no placed modules. Open Admin &gt; Layouts to add modules to
              this layout or choose a different device assignment.
            </p>
            <DeviceIdentityCard
              device={deviceIdentity}
              fallbackDeviceId={deviceIdRef.current}
              message="If you are still setting screens up, use Admin > Devices to rename this display so it is easy to identify later."
            />
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
