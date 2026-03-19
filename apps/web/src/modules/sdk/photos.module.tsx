import { useEffect, useState } from "react";
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
  resolveModuleConnectivityState,
  useBrowserOnlineStatus,
} from "../data/connection-state";
import { ModulePresentationControls } from "../ui/ModulePresentationControls";
import { ModuleConnectionBadge } from "../ui/ModuleConnectionBadge";

const LAYOUT_CROSSFADE_DATA_ATTRIBUTE = "data-hearth-layout-crossfade";
const DISPLAY_SOURCE_KIND_STORAGE_KEY = "hearth:display-source-kind";
const DISPLAY_CYCLE_SECONDS_STORAGE_KEY = "hearth:display-cycle-seconds";
const DISPLAY_PHOTO_COLLECTION_ID_STORAGE_KEY = "hearth:display-photo-collection-id";
const DISPLAY_CYCLE_CONTEXT_EVENT = "hearth:display-cycle-context";
const LEGACY_PHOTO_LIBRARY_ROOT_LABEL = "/photos";

interface DisplayCycleContextEventDetail {
  sourceKind: "set" | "layout";
  cycleSeconds: number | null;
  photoCollectionId: string | null;
}

const clampIntervalSeconds = (value: number): number =>
  Math.max(3, Math.min(3600, Math.round(value)));

const getDisplaySourceKindFromStorage = (): "set" | "layout" | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const sourceKind =
      window.localStorage.getItem(DISPLAY_SOURCE_KIND_STORAGE_KEY)?.trim() ?? "";
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
    const sourceKind =
      window.localStorage.getItem(DISPLAY_SOURCE_KIND_STORAGE_KEY)?.trim() ?? "";
    if (sourceKind !== "set") {
      return null;
    }

    const rawSeconds =
      window.localStorage.getItem(DISPLAY_CYCLE_SECONDS_STORAGE_KEY)?.trim() ?? "";
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
    const sourceKind =
      window.localStorage.getItem(DISPLAY_SOURCE_KIND_STORAGE_KEY)?.trim() ?? "";
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

const toLegacyFolderSourceLabel = (
  folderPath: string | null | undefined,
): string | null => {
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
    return legacyRootIndex >= 0
      ? normalized.slice(legacyRootIndex).replace(/\/+$/, "")
      : null;
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
      const [setCycleIntervalSeconds, setSetCycleIntervalSeconds] = useState<number | null>(
        () => getSetCycleIntervalFromStorage(),
      );
      const [displaySourceKind, setDisplaySourceKind] = useState<"set" | "layout" | null>(
        () => getDisplaySourceKindFromStorage(),
      );
      const [setCollectionId, setSetCollectionId] = useState<string | null>(() =>
        getSetCollectionIdFromStorage(),
      );
      const requestedSourceKind = displaySourceKind === "set" ? "set" : null;
      const effectiveSetCollectionId = setCollectionId;
      const effectiveIntervalSeconds =
        setCycleIntervalSeconds ?? clampIntervalSeconds(settings.intervalSeconds);
      const isLayoutCrossfading =
        !isEditing &&
        typeof document !== "undefined" &&
        document.documentElement.getAttribute(LAYOUT_CROSSFADE_DATA_ATTRIBUTE) === "1";
      const [frameData, setFrameData] = useState(() =>
        photosModuleNextResponseSchema.parse({
          generatedAt: new Date().toISOString(),
          frame: null,
          stableOrientation: null,
          warning: null,
        }),
      );
      const [displayFrame, setDisplayFrame] = useState<PhotosModuleFrame | null>(null);
      const [imageVisible, setImageVisible] = useState(false);
      const [error, setError] = useState<string | null>(null);
      const [loading, setLoading] = useState(true);
      const [lastUpdatedMs, setLastUpdatedMs] = useState<number | null>(null);
      const browserOnline = useBrowserOnlineStatus();
      const connectivityState = resolveModuleConnectivityState({
        error,
        hasSnapshot: lastUpdatedMs !== null,
        isOnline: browserOnline,
      });

      useEffect(() => {
        const applyCurrentContext = (event?: Event) => {
          const eventDetail =
            event && "detail" in event
              ? ((event as CustomEvent<DisplayCycleContextEventDetail>).detail ?? null)
              : null;
          setDisplaySourceKind(
            eventDetail?.sourceKind ??
              getDisplaySourceKindFromStorage(),
          );
          const fromEvent = toSetCycleIntervalFromContext(eventDetail);
          setSetCycleIntervalSeconds(
            fromEvent ?? getSetCycleIntervalFromStorage(),
          );
          setSetCollectionId(
            toSetCollectionIdFromContext(eventDetail) ?? getSetCollectionIdFromStorage(),
          );
        };

        applyCurrentContext();
        window.addEventListener(
          DISPLAY_CYCLE_CONTEXT_EVENT,
          applyCurrentContext as EventListener,
        );

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

        const refreshFrame = async () => {
          try {
            const next = await loadNextFrame(
              instanceId,
              effectiveSetCollectionId,
              requestedSourceKind,
            );
            if (!active) {
              return;
            }

            setFrameData(next);
            setLastUpdatedMs(Date.now());
            setError(null);

            if (!next.frame) {
              setDisplayFrame(null);
              return;
            }

            setDisplayFrame((current) =>
              current?.imageId === next.frame?.imageId ? current : next.frame,
            );
          } catch (loadError) {
            if (!active) {
              return;
            }

            setError(loadError instanceof Error ? loadError.message : "Failed to load photos");
          } finally {
            if (active) {
              setLoading(false);
            }
          }
        };

        void refreshFrame();
        const timer = window.setInterval(
          () => {
            void refreshFrame();
          },
          effectiveIntervalSeconds * 1000,
        );

        return () => {
          active = false;
          window.clearInterval(timer);
        };
      }, [
        effectiveIntervalSeconds,
        effectiveSetCollectionId,
        instanceId,
        isEditing,
        requestedSourceKind,
      ]);

      useEffect(() => {
        if (!displayFrame) {
          return;
        }

        setImageVisible(false);
        const raf = window.requestAnimationFrame(() => {
          setImageVisible(true);
        });

        return () => {
          window.cancelAnimationFrame(raf);
        };
      }, [displayFrame?.imageId]);

      useEffect(() => {
        if (isEditing || typeof window === "undefined" || !displayFrame) {
          return;
        }

        const frameOrientation = displayFrame.orientation;
        if (frameOrientation !== "portrait" && frameOrientation !== "landscape") {
          return;
        }

        window.dispatchEvent(
          new CustomEvent("hearth:photos-orientation", {
            detail: {
              instanceId,
              orientation: frameOrientation,
              frameId: displayFrame.imageId,
              eventToken: displayFrame.imageId,
            },
          }),
        );
      }, [
        displayFrame?.imageId,
        displayFrame?.orientation,
        instanceId,
        isEditing,
      ]);

      const previewSourceLabel =
        settings.collectionId && settings.collectionId.trim().length > 0
          ? `Collection: ${settings.collectionId.trim()}`
          : "/photos";

      if (isEditing) {
        return (
          <div className="flex h-full flex-col justify-center rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-3 text-slate-200">
            <p className="module-copy-title text-slate-100">
              Photo slideshow preview
            </p>
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
        <div className="relative h-full overflow-hidden rounded-lg border border-slate-700 bg-slate-950">
          <ModuleConnectionBadge visible={connectivityState.showDisconnected} />
          {loading ? (
            <div className="module-copy-meta flex h-full items-center justify-center text-slate-300">
              Loading photos...
            </div>
          ) : null}

          {!loading && connectivityState.blockingError ? (
            <div className="module-copy-meta flex h-full items-center justify-center px-3 text-center text-rose-200">
              {connectivityState.blockingError}
            </div>
          ) : null}

          {!loading && !connectivityState.blockingError && displayFrame ? (
            <img
              key={displayFrame.imageId}
              src={displayFrame.imageUrl}
              alt={displayFrame.filename}
              className={`h-full w-full ${imageFitClass} ${
                isLayoutCrossfading
                  ? "opacity-100 transition-none"
                  : `transition-opacity duration-700 ${imageVisible ? "opacity-100" : "opacity-0"}`
              }`}
              loading="eager"
            />
          ) : null}

          {!loading &&
          !connectivityState.blockingError &&
          !displayFrame &&
          frameData.warning ? (
            <div className="module-copy-meta flex h-full items-center justify-center px-3 text-center text-slate-300">
              {frameData.warning}
            </div>
          ) : null}
        </div>
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
      const sourceValue =
        hasLegacyFolderOverride
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
                replace it with the selected collection or the root {LEGACY_PHOTO_LIBRARY_ROOT_LABEL} library.
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
                  intervalSeconds: Math.max(
                    3,
                    Math.min(3600, Number(event.target.value) || 3),
                  ),
                })
              }
            />
            <p className="text-xs text-slate-400">
              If this layout is used in a set, this slide interval is overridden by the set layout timer.
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
                  layoutOrientation:
                    event.target.value === "portrait" ? "portrait" : "landscape",
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
