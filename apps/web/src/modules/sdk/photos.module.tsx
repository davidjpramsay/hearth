import { useEffect, useMemo, useRef, useState } from "react";
import {
  photoCollectionsConfigSchema,
  photosModuleConfigSchema,
  photosModuleNextResponseSchema,
  type PhotoCollection,
  type PhotosLayoutOrientation,
  type PhotosModuleConfig,
  type PhotosModuleFrame,
} from "@hearth/shared";
import { defineModule } from "@hearth/module-sdk";
import { getPhotoCollections } from "../../api/client";
import { getAuthToken } from "../../auth/storage";
import { getDeviceId } from "../../device/device-id";
import {
  readPersistedModuleSnapshot,
  writePersistedModuleSnapshot,
} from "../data/persisted-module-snapshot";
import { resolveModuleConnectivityState, useBrowserOnlineStatus } from "../data/connection-state";
import { ModulePresentationControls } from "../ui/ModulePresentationControls";
import { ModuleConnectionBadge } from "../ui/ModuleConnectionBadge";
import { ModuleSkeleton } from "../ui/ModuleSkeleton";

const LAYOUT_CROSSFADE_DATA_ATTRIBUTE = "data-hearth-layout-crossfade";
const PHOTO_SNAPSHOT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const PHOTO_CROSSFADE_DURATION_MS = 700;
const PHOTO_CROSSFADE_CLEANUP_BUFFER_MS = 120;
const DISPLAY_SOURCE_KIND_STORAGE_KEY = "hearth:display-source-kind";
const DISPLAY_CYCLE_SECONDS_STORAGE_KEY = "hearth:display-cycle-seconds";
const DISPLAY_PHOTO_COLLECTION_ID_STORAGE_KEY = "hearth:display-photo-collection-id";
const DISPLAY_CYCLE_CONTEXT_EVENT = "hearth:display-cycle-context";
const PHOTO_LIBRARY_UPDATED_EVENT = "hearth:photos-updated";
const DASHBOARD_OPEN_PHOTO_EVENT = "hearth:open-photo";
const LEGACY_PHOTO_LIBRARY_ROOT_LABEL = "/photos";

interface DisplayCycleContextEventDetail {
  sourceKind: "set" | "layout";
  cycleSeconds: number | null;
  photoCollectionId: string | null;
}

const preloadImage = async (src: string): Promise<void> => {
  if (typeof Image === "undefined") {
    return;
  }

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      resolve(image);
    };
    image.onerror = () => {
      reject(new Error("Failed to preload photo"));
    };
    image.src = src;
  });

  if (typeof image.decode === "function") {
    await image.decode().catch(() => undefined);
  }
};

const clampIntervalSeconds = (value: number): number =>
  Math.max(3, Math.min(3600, Math.round(value)));

const buildPhotosSnapshotKey = (
  instanceId: string,
  input: {
    requestedSourceKind: "set" | "layout" | null;
    setCollectionId: string | null;
    moduleCollectionId: string | null;
    folderPath: string;
  },
): string =>
  `photos:${instanceId}:${JSON.stringify({
    requestedSourceKind: input.requestedSourceKind ?? "layout",
    setCollectionId: input.setCollectionId,
    moduleCollectionId: input.moduleCollectionId,
    folderPath: input.folderPath.trim(),
  })}`;

const getDisplaySourceKindFromStorage = (): "set" | "layout" | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const sourceKind = window.localStorage.getItem(DISPLAY_SOURCE_KIND_STORAGE_KEY)?.trim() ?? "";
    if (sourceKind === "set" || sourceKind === "layout") {
      return sourceKind;
    }
  } catch {
    return null;
  }

  return null;
};

const getSetCycleIntervalFromStorage = (): number | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const sourceKind = window.localStorage.getItem(DISPLAY_SOURCE_KIND_STORAGE_KEY)?.trim() ?? "";
    if (sourceKind !== "set") {
      return null;
    }

    const rawSeconds = window.localStorage.getItem(DISPLAY_CYCLE_SECONDS_STORAGE_KEY)?.trim() ?? "";
    const parsedSeconds = Number.parseInt(rawSeconds, 10);
    return Number.isFinite(parsedSeconds) ? clampIntervalSeconds(parsedSeconds) : null;
  } catch {
    return null;
  }
};

const getSetCollectionIdFromStorage = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const sourceKind = window.localStorage.getItem(DISPLAY_SOURCE_KIND_STORAGE_KEY)?.trim() ?? "";
    if (sourceKind !== "set") {
      return null;
    }

    const collectionId =
      window.localStorage.getItem(DISPLAY_PHOTO_COLLECTION_ID_STORAGE_KEY)?.trim() ?? "";
    return collectionId.length > 0 ? collectionId : null;
  } catch {
    return null;
  }
};

const toSetCycleIntervalFromContext = (
  detail: DisplayCycleContextEventDetail | null | undefined,
): number | null => {
  if (!detail || detail.sourceKind !== "set") {
    return null;
  }
  if (typeof detail.cycleSeconds !== "number" || !Number.isFinite(detail.cycleSeconds)) {
    return null;
  }
  return clampIntervalSeconds(detail.cycleSeconds);
};

const toSetCollectionIdFromContext = (
  detail: DisplayCycleContextEventDetail | null | undefined,
): string | null => {
  if (!detail || detail.sourceKind !== "set") {
    return null;
  }
  if (typeof detail.photoCollectionId !== "string") {
    return null;
  }
  const trimmed = detail.photoCollectionId.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const getLayoutRatioLabel = (orientation: PhotosLayoutOrientation): string =>
  orientation === "portrait" ? "Portrait 3:4" : "Landscape 4:3";

const toLegacyFolderSourceLabel = (folderPath: string | null | undefined): string | null => {
  if (typeof folderPath !== "string") {
    return null;
  }

  const normalized = folderPath.trim().replace(/\\/g, "/");
  if (!normalized) {
    return null;
  }

  if (
    normalized === LEGACY_PHOTO_LIBRARY_ROOT_LABEL ||
    normalized === `${LEGACY_PHOTO_LIBRARY_ROOT_LABEL}/` ||
    normalized === "."
  ) {
    return LEGACY_PHOTO_LIBRARY_ROOT_LABEL;
  }

  if (normalized.startsWith(`${LEGACY_PHOTO_LIBRARY_ROOT_LABEL}/`)) {
    return normalized.replace(/\/+$/, "");
  }

  if (normalized.startsWith("./")) {
    return `${LEGACY_PHOTO_LIBRARY_ROOT_LABEL}/${normalized.slice(2)}`.replace(/\/+$/, "");
  }

  if (normalized.startsWith("/")) {
    const legacyRootIndex = normalized.lastIndexOf(`${LEGACY_PHOTO_LIBRARY_ROOT_LABEL}/`);
    return legacyRootIndex >= 0 ? normalized.slice(legacyRootIndex).replace(/\/+$/, "") : null;
  }

  return `${LEGACY_PHOTO_LIBRARY_ROOT_LABEL}/${normalized}`.replace(/\/+$/, "");
};

const loadPhotoCollections = async (): Promise<PhotoCollection[]> => {
  const token = getAuthToken();
  if (!token) {
    return [];
  }

  try {
    const response = await getPhotoCollections(token);
    return response.collections;
  } catch {
    return [];
  }
};

const loadNextFrame = async (
  instanceId: string,
  collectionId?: string | null,
  sourceKind?: "set" | "layout" | null,
): Promise<ReturnType<typeof photosModuleNextResponseSchema.parse>> => {
  const screenSessionId = getDeviceId();
  const queryParams = new URLSearchParams();
  if (screenSessionId) {
    queryParams.set("screenSessionId", screenSessionId);
  }
  if (collectionId && collectionId.trim().length > 0) {
    queryParams.set("collectionId", collectionId.trim());
  }
  if (sourceKind === "set" || sourceKind === "layout") {
    queryParams.set("sourceKind", sourceKind);
  }
  const queryString = queryParams.toString();
  const query = queryString.length > 0 ? `?${queryString}` : "";
  const response = await fetch(
    `/api/modules/photos/${encodeURIComponent(instanceId)}/next${query}`,
    { method: "GET" },
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message =
      payload && typeof payload.message === "string"
        ? payload.message
        : `Request failed (${response.status})`;
    throw new Error(message);
  }

  const payload = await response.json();
  return photosModuleNextResponseSchema.parse(payload);
};

export const moduleDefinition = defineModule({
  manifest: {
    id: "photos",
    name: "Photos",
    version: "2.0.0",
    description: "Photos module migrated to Hearth Module SDK",
    icon: "image",
    defaultSize: { w: 6, h: 5 },
    categories: ["media"],
    permissions: ["network", "filesystem"],
    dataSources: [{ id: "photos-frame", kind: "rest" }],
  },
  settingsSchema: photosModuleConfigSchema,
  dataSchema: photosModuleNextResponseSchema,
  runtime: {
    Component: ({ instanceId, settings, isEditing }) => {
      const imageFitClass = "object-cover";
      const [setCycleIntervalSeconds, setSetCycleIntervalSeconds] = useState<number | null>(() =>
        getSetCycleIntervalFromStorage(),
      );
      const [displaySourceKind, setDisplaySourceKind] = useState<"set" | "layout" | null>(() =>
        getDisplaySourceKindFromStorage(),
      );
      const [setCollectionId, setSetCollectionId] = useState<string | null>(() =>
        getSetCollectionIdFromStorage(),
      );
      const requestedSourceKind = displaySourceKind === "set" ? "set" : null;
      const effectiveSetCollectionId = setCollectionId;
      const effectiveIntervalSeconds =
        setCycleIntervalSeconds ?? clampIntervalSeconds(settings.intervalSeconds);
      const snapshotKey = useMemo(
        () =>
          buildPhotosSnapshotKey(instanceId, {
            requestedSourceKind,
            setCollectionId: effectiveSetCollectionId,
            moduleCollectionId: settings.collectionId,
            folderPath: settings.folderPath,
          }),
        [
          effectiveSetCollectionId,
          instanceId,
          requestedSourceKind,
          settings.collectionId,
          settings.folderPath,
        ],
      );
      const initialSnapshot = useMemo(
        () =>
          readPersistedModuleSnapshot({
            key: snapshotKey,
            parse: (storedPayload) => photosModuleNextResponseSchema.parse(storedPayload),
            maxAgeMs: PHOTO_SNAPSHOT_MAX_AGE_MS,
            validate: (storedPayload) => storedPayload.frame !== null,
          }),
        [snapshotKey],
      );
      const isLayoutCrossfading =
        !isEditing &&
        typeof document !== "undefined" &&
        document.documentElement.getAttribute(LAYOUT_CROSSFADE_DATA_ATTRIBUTE) === "1";
      const [frameData, setFrameData] = useState(
        () =>
          initialSnapshot?.data ??
          photosModuleNextResponseSchema.parse({
            generatedAt: new Date().toISOString(),
            frame: null,
            stableOrientation: null,
            warning: null,
          }),
      );
      const [displayFrame, setDisplayFrame] = useState<PhotosModuleFrame | null>(
        () => initialSnapshot?.data.frame ?? null,
      );
      const [previousFrame, setPreviousFrame] = useState<PhotosModuleFrame | null>(null);
      const displayFrameRef = useRef<PhotosModuleFrame | null>(null);
      const inFlightRefreshRef = useRef(false);
      const nextRefreshTimerRef = useRef<number | null>(null);
      const lastDisplaySwapAtMsRef = useRef<number | null>(initialSnapshot?.updatedAtMs ?? null);
      const lastPublishedOrientationEventKeyRef = useRef<string | null>(null);
      const crossfadeRafRef = useRef<number | null>(null);
      const crossfadeCleanupTimerRef = useRef<number | null>(null);
      const [imageVisible, setImageVisible] = useState(() => initialSnapshot?.data.frame !== null);
      const [error, setError] = useState<string | null>(null);
      const [loading, setLoading] = useState(() => initialSnapshot === null);
      const [lastUpdatedMs, setLastUpdatedMs] = useState<number | null>(
        () => initialSnapshot?.updatedAtMs ?? null,
      );
      const browserOnline = useBrowserOnlineStatus();
      const connectivityState = resolveModuleConnectivityState({
        error,
        hasSnapshot: lastUpdatedMs !== null,
        isOnline: browserOnline,
      });

      const clearPhotoCrossfadeTimers = () => {
        if (crossfadeRafRef.current !== null) {
          window.cancelAnimationFrame(crossfadeRafRef.current);
          crossfadeRafRef.current = null;
        }
        if (crossfadeCleanupTimerRef.current !== null) {
          window.clearTimeout(crossfadeCleanupTimerRef.current);
          crossfadeCleanupTimerRef.current = null;
        }
      };

      const presentFrame = (nextFrame: PhotosModuleFrame, disableCrossfade: boolean) => {
        const currentFrame = displayFrameRef.current;
        clearPhotoCrossfadeTimers();

        if (
          disableCrossfade ||
          currentFrame === null ||
          currentFrame.imageId === nextFrame.imageId
        ) {
          setPreviousFrame(null);
          setDisplayFrame(nextFrame);
          displayFrameRef.current = nextFrame;
          setImageVisible(true);
          return;
        }

        setPreviousFrame(currentFrame);
        setImageVisible(false);
        setDisplayFrame(nextFrame);
        displayFrameRef.current = nextFrame;
        crossfadeRafRef.current = window.requestAnimationFrame(() => {
          crossfadeRafRef.current = null;
          setImageVisible(true);
          crossfadeCleanupTimerRef.current = window.setTimeout(() => {
            crossfadeCleanupTimerRef.current = null;
            setPreviousFrame(null);
          }, PHOTO_CROSSFADE_DURATION_MS + PHOTO_CROSSFADE_CLEANUP_BUFFER_MS);
        });
      };

      const publishConfirmedOrientation = (
        next: ReturnType<typeof photosModuleNextResponseSchema.parse>,
      ) => {
        if (isEditing || typeof window === "undefined" || !next.frame) {
          return;
        }

        const orientation = next.stableOrientation ?? next.frame.orientation;
        if (orientation !== "portrait" && orientation !== "landscape") {
          return;
        }

        const eventKey = `${next.frame.imageId}:${orientation}`;
        if (lastPublishedOrientationEventKeyRef.current === eventKey) {
          return;
        }
        lastPublishedOrientationEventKeyRef.current = eventKey;

        window.dispatchEvent(
          new CustomEvent("hearth:photos-orientation", {
            detail: {
              instanceId,
              orientation,
              frameId: next.frame.imageId,
              eventToken: next.frame.imageId,
            },
          }),
        );
      };

      useEffect(() => {
        displayFrameRef.current = displayFrame;
      }, [displayFrame]);

      useEffect(
        () => () => {
          clearPhotoCrossfadeTimers();
        },
        [],
      );

      useEffect(() => {
        if (initialSnapshot) {
          setFrameData(initialSnapshot.data);
          clearPhotoCrossfadeTimers();
          setPreviousFrame(null);
          setDisplayFrame(initialSnapshot.data.frame);
          displayFrameRef.current = initialSnapshot.data.frame;
          setImageVisible(initialSnapshot.data.frame !== null);
          setLastUpdatedMs(initialSnapshot.updatedAtMs);
          lastDisplaySwapAtMsRef.current = initialSnapshot.updatedAtMs;
          lastPublishedOrientationEventKeyRef.current = null;
          setLoading(false);
          return;
        }

        setFrameData(
          photosModuleNextResponseSchema.parse({
            generatedAt: new Date().toISOString(),
            frame: null,
            stableOrientation: null,
            warning: null,
          }),
        );
        clearPhotoCrossfadeTimers();
        setPreviousFrame(null);
        setDisplayFrame(null);
        displayFrameRef.current = null;
        setImageVisible(false);
        setLastUpdatedMs(null);
        lastDisplaySwapAtMsRef.current = null;
        lastPublishedOrientationEventKeyRef.current = null;
        setLoading(true);
      }, [initialSnapshot, snapshotKey]);

      useEffect(() => {
        const applyCurrentContext = (event?: Event) => {
          const eventDetail =
            event && "detail" in event
              ? ((event as CustomEvent<DisplayCycleContextEventDetail>).detail ?? null)
              : null;
          setDisplaySourceKind(eventDetail?.sourceKind ?? getDisplaySourceKindFromStorage());
          const fromEvent = toSetCycleIntervalFromContext(eventDetail);
          setSetCycleIntervalSeconds(fromEvent ?? getSetCycleIntervalFromStorage());
          setSetCollectionId(
            toSetCollectionIdFromContext(eventDetail) ?? getSetCollectionIdFromStorage(),
          );
        };

        applyCurrentContext();
        window.addEventListener(DISPLAY_CYCLE_CONTEXT_EVENT, applyCurrentContext as EventListener);

        return () => {
          window.removeEventListener(
            DISPLAY_CYCLE_CONTEXT_EVENT,
            applyCurrentContext as EventListener,
          );
        };
      }, []);

      useEffect(() => {
        if (isEditing) {
          setLoading(false);
          setError(null);
          return;
        }

        let active = true;
        const clearScheduledRefresh = () => {
          if (nextRefreshTimerRef.current !== null) {
            window.clearTimeout(nextRefreshTimerRef.current);
            nextRefreshTimerRef.current = null;
          }
        };

        const scheduleRefresh = (delayMs: number) => {
          clearScheduledRefresh();
          nextRefreshTimerRef.current = window.setTimeout(
            () => {
              void refreshFrame();
            },
            Math.max(250, delayMs),
          );
        };

        const refreshFrame = async () => {
          if (inFlightRefreshRef.current) {
            return;
          }
          inFlightRefreshRef.current = true;

          try {
            const next = await loadNextFrame(
              instanceId,
              effectiveSetCollectionId,
              requestedSourceKind,
            );
            if (!active) {
              return;
            }

            const updatedAtMs = Date.now();
            setFrameData(next);
            setLastUpdatedMs(updatedAtMs);
            setError(null);

            if (!next.frame) {
              clearPhotoCrossfadeTimers();
              setPreviousFrame(null);
              setDisplayFrame(null);
              displayFrameRef.current = null;
              setImageVisible(false);
              lastDisplaySwapAtMsRef.current = updatedAtMs;
              lastPublishedOrientationEventKeyRef.current = null;
              scheduleRefresh(effectiveIntervalSeconds * 1000);
              return;
            }

            if (displayFrameRef.current?.imageId === next.frame.imageId) {
              writePersistedModuleSnapshot(snapshotKey, next, updatedAtMs);
              publishConfirmedOrientation(next);
              const lastSwapAtMs = lastDisplaySwapAtMsRef.current ?? updatedAtMs;
              const remainingMs = lastSwapAtMs + effectiveIntervalSeconds * 1000 - updatedAtMs;
              scheduleRefresh(remainingMs > 250 ? remainingMs : effectiveIntervalSeconds * 1000);
              return;
            }

            try {
              await preloadImage(next.frame.imageUrl);
            } catch {
              if (displayFrameRef.current === null) {
                setError("Failed to load photos");
              }
              scheduleRefresh(Math.min(5000, effectiveIntervalSeconds * 1000));
              return;
            }

            if (!active) {
              return;
            }

            writePersistedModuleSnapshot(snapshotKey, next, updatedAtMs);
            presentFrame(next.frame, isLayoutCrossfading);
            publishConfirmedOrientation(next);
            lastDisplaySwapAtMsRef.current = updatedAtMs;
            scheduleRefresh(effectiveIntervalSeconds * 1000);
          } catch (loadError) {
            if (!active) {
              return;
            }

            setError(loadError instanceof Error ? loadError.message : "Failed to load photos");
            scheduleRefresh(Math.min(5000, effectiveIntervalSeconds * 1000));
          } finally {
            inFlightRefreshRef.current = false;
            if (active) {
              setLoading(false);
            }
          }
        };

        const handlePhotoLibraryUpdated = () => {
          clearScheduledRefresh();
          void refreshFrame();
        };

        void refreshFrame();
        window.addEventListener(PHOTO_LIBRARY_UPDATED_EVENT, handlePhotoLibraryUpdated);

        return () => {
          active = false;
          inFlightRefreshRef.current = false;
          window.removeEventListener(PHOTO_LIBRARY_UPDATED_EVENT, handlePhotoLibraryUpdated);
          clearScheduledRefresh();
        };
      }, [
        effectiveIntervalSeconds,
        effectiveSetCollectionId,
        instanceId,
        isLayoutCrossfading,
        isEditing,
        requestedSourceKind,
        snapshotKey,
      ]);

      const previewSourceLabel =
        settings.collectionId && settings.collectionId.trim().length > 0
          ? `Collection: ${settings.collectionId.trim()}`
          : "/photos";

      if (isEditing) {
        return (
          <div className="flex h-full flex-col justify-center rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-3 text-slate-200">
            <p className="module-copy-title text-slate-100">Photo slideshow preview</p>
            <p className="module-copy-meta mt-2 text-slate-300">
              Photo source: {previewSourceLabel}
            </p>
            <p className="module-copy-meta mt-1 text-slate-400">
              Every {effectiveIntervalSeconds}s | {settings.shuffle ? "Shuffle" : "In order"}
            </p>
            <p className="module-copy-meta mt-1 text-slate-400">
              Layout lock: {getLayoutRatioLabel(settings.layoutOrientation)}
            </p>
          </div>
        );
      }

      return (
        <button
          type="button"
          className="group relative block h-full w-full overflow-hidden rounded-lg border border-slate-700 bg-slate-950 text-left disabled:cursor-default"
          disabled={!displayFrame}
          aria-label={
            displayFrame ? `Open ${displayFrame.filename} fullscreen for five seconds` : "Photos"
          }
          onClick={() => {
            if (!displayFrame) return;
            window.dispatchEvent(
              new CustomEvent(DASHBOARD_OPEN_PHOTO_EVENT, {
                detail: { imageUrl: displayFrame.imageUrl, alt: displayFrame.filename },
              }),
            );
          }}
        >
          <ModuleConnectionBadge
            visible={connectivityState.showDisconnected}
            title={connectivityState.disconnectedTitle ?? undefined}
            label={connectivityState.disconnectedLabel}
          />
          {loading ? <ModuleSkeleton variant="media" /> : null}

          {!loading && connectivityState.blockingError ? (
            <div className="module-copy-meta flex h-full items-center justify-center px-3 text-center text-rose-200">
              {connectivityState.blockingError}
            </div>
          ) : null}

          {!loading && !connectivityState.blockingError && previousFrame && displayFrame ? (
            <img
              key={`previous-${previousFrame.imageId}`}
              src={previousFrame.imageUrl}
              alt=""
              aria-hidden
              className={`absolute inset-0 h-full w-full ${imageFitClass} opacity-100 transition-none`}
              loading="eager"
              decoding="async"
              draggable={false}
            />
          ) : null}

          {!loading && !connectivityState.blockingError && displayFrame ? (
            <>
              <img
                key={displayFrame.imageId}
                src={displayFrame.imageUrl}
                alt={displayFrame.filename}
                className={`absolute inset-0 h-full w-full ${imageFitClass} ${
                  isLayoutCrossfading
                    ? "opacity-100 transition-none"
                    : `transition-opacity duration-700 ease-out [will-change:opacity] ${imageVisible ? "opacity-100" : "opacity-0"}`
                }`}
                loading="eager"
                decoding="async"
                draggable={false}
              />
              <span className="absolute bottom-3 right-3 z-10 grid h-11 w-11 place-items-center rounded-full border border-white/50 bg-black/45 text-white opacity-90 shadow-lg backdrop-blur-sm transition group-hover:scale-105 group-focus-visible:ring-2 group-focus-visible:ring-white">
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
                </svg>
                <span className="sr-only">View fullscreen</span>
              </span>
            </>
          ) : null}

          {!loading && !connectivityState.blockingError && !displayFrame && frameData.warning ? (
            <div className="module-copy-meta flex h-full items-center justify-center px-3 text-center text-slate-300">
              {frameData.warning}
            </div>
          ) : null}
        </button>
      );
    },
  },
  admin: {
    SettingsPanel: ({ settings, onChange }) => {
      const [availableCollections, setAvailableCollections] = useState<PhotoCollection[]>([]);

      useEffect(() => {
        let active = true;
        void loadPhotoCollections().then((collections) => {
          if (!active) {
            return;
          }
          setAvailableCollections(collections);
        });
        return () => {
          active = false;
        };
      }, []);

      const applyPatch = (patch: Partial<PhotosModuleConfig>) => {
        onChange({
          ...settings,
          ...patch,
        });
      };

      const legacyFolderSourceLabel =
        settings.collectionId === null ? toLegacyFolderSourceLabel(settings.folderPath) : null;
      const hasLegacyFolderOverride =
        legacyFolderSourceLabel !== null &&
        legacyFolderSourceLabel !== LEGACY_PHOTO_LIBRARY_ROOT_LABEL;
      const sourceValue = hasLegacyFolderOverride
        ? "__legacy_folder__"
        : settings.collectionId && settings.collectionId.trim().length > 0
          ? settings.collectionId.trim()
          : "__photos_root__";

      return (
        <div className="space-y-4 rounded-lg border border-slate-700 bg-slate-900 p-4 text-sm text-slate-200">
          <h3 className="text-base font-semibold">Photos settings</h3>

          <label className="block space-y-2">
            <span>Photo source</span>
            <select
              className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
              value={sourceValue}
              onChange={(event) =>
                applyPatch({
                  collectionId:
                    event.target.value === "__photos_root__"
                      ? null
                      : event.target.value.trim() || null,
                  folderPath: LEGACY_PHOTO_LIBRARY_ROOT_LABEL,
                })
              }
            >
              <option value="__photos_root__">{LEGACY_PHOTO_LIBRARY_ROOT_LABEL}</option>
              {hasLegacyFolderOverride ? (
                <option value="__legacy_folder__" disabled>
                  Legacy folder: {legacyFolderSourceLabel}
                </option>
              ) : null}
              {availableCollections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  Collection: {collection.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-400">
              In sets, set-level collection selection overrides this module source.
            </p>
            {hasLegacyFolderOverride ? (
              <p className="text-xs text-amber-300">
                This module is still using a legacy folder-path source. Switching this field will
                replace it with the selected collection or the root{" "}
                {LEGACY_PHOTO_LIBRARY_ROOT_LABEL} library.
              </p>
            ) : null}
          </label>

          <label className="block space-y-2">
            <span>Slide interval (seconds)</span>
            <input
              className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
              type="number"
              min={3}
              max={3600}
              value={settings.intervalSeconds}
              onChange={(event) =>
                applyPatch({
                  intervalSeconds: Math.max(3, Math.min(3600, Number(event.target.value) || 3)),
                })
              }
            />
            <p className="text-xs text-slate-400">
              If this layout is used in a set, this slide interval is overridden by the set layout
              timer.
            </p>
          </label>

          <label className="flex items-center justify-between">
            <span>Shuffle</span>
            <input
              type="checkbox"
              checked={settings.shuffle}
              onChange={(event) => applyPatch({ shuffle: event.target.checked })}
            />
          </label>

          <label className="block space-y-2">
            <span>Layout orientation lock</span>
            <select
              className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
              value={settings.layoutOrientation}
              onChange={(event) =>
                applyPatch({
                  layoutOrientation: event.target.value === "portrait" ? "portrait" : "landscape",
                })
              }
            >
              <option value="landscape">Landscape (4:3)</option>
              <option value="portrait">Portrait (3:4)</option>
            </select>
          </label>
          <ModulePresentationControls
            value={settings.presentation}
            onChange={(presentation) => applyPatch({ presentation })}
          />
        </div>
      );
    },
  },
});

export default moduleDefinition;
