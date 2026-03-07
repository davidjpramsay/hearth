import { useEffect, useMemo, useState } from "react";
import {
  photosModuleConfigSchema,
  photosModuleNextResponseSchema,
  type ModuleDefinition,
  type PhotosModuleConfig,
  type PhotosModuleFrame,
  type PhotosLayoutOrientation,
} from "@hearth/shared";

const DEFAULT_PHOTOS_CONFIG = photosModuleConfigSchema.parse({});
const LAYOUT_CROSSFADE_DATA_ATTRIBUTE = "data-hearth-layout-crossfade";
const SCREEN_SESSION_ID_STORAGE_KEY = "hearth:screen-session-id";

const normalizeConfig = (config: unknown): PhotosModuleConfig => {
  const parsed = photosModuleConfigSchema.safeParse(config);
  return parsed.success ? parsed.data : DEFAULT_PHOTOS_CONFIG;
};

const getLayoutRatioLabel = (orientation: PhotosLayoutOrientation): string =>
  orientation === "portrait" ? "Portrait 3:4" : "Landscape 4:3";

const getScreenSessionId = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(SCREEN_SESSION_ID_STORAGE_KEY)?.trim();
    return stored && stored.length > 0 ? stored : null;
  } catch {
    return null;
  }
};

const loadNextFrame = async (
  instanceId: string,
): Promise<ReturnType<typeof photosModuleNextResponseSchema.parse>> => {
  const screenSessionId = getScreenSessionId();
  const query = screenSessionId
    ? `?screenSessionId=${encodeURIComponent(screenSessionId)}`
    : "";
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

export const photosModule: ModuleDefinition<PhotosModuleConfig> = {
  id: "photos",
  displayName: "Photos",
  defaultSize: { w: 6, h: 5 },
  configSchema: photosModuleConfigSchema,
  DashboardTile: ({ instanceId, config, isEditing }) => {
    const normalizedConfig = useMemo(() => normalizeConfig(config), [config]);
    const imageFitClass =
      normalizedConfig.layoutOrientation === "landscape"
        ? "object-cover"
        : "object-contain";
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

    useEffect(() => {
      if (isEditing) {
        setLoading(false);
        setError(null);
        return;
      }

      let active = true;

      const refreshFrame = async () => {
        try {
          const next = await loadNextFrame(instanceId);
          if (!active) {
            return;
          }

          setFrameData(next);
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
        Math.max(3, normalizedConfig.intervalSeconds) * 1000,
      );

      return () => {
        active = false;
        window.clearInterval(timer);
      };
    }, [instanceId, isEditing, normalizedConfig.intervalSeconds]);

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

    if (isEditing) {
      return (
        <div className="flex h-full flex-col justify-center rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-3 text-slate-200">
          <p className="text-sm font-semibold text-slate-100">Photo slideshow preview</p>
          <p className="mt-2 text-xs text-slate-300">
            Fallback folder: /photos
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Every {normalizedConfig.intervalSeconds}s |{" "}
            {normalizedConfig.shuffle ? "Shuffle" : "In order"}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Layout lock: {getLayoutRatioLabel(normalizedConfig.layoutOrientation)}
          </p>
        </div>
      );
    }

    return (
      <div className="relative h-full overflow-hidden rounded-lg border border-slate-700 bg-slate-950">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-300">
            Loading photos...
          </div>
        ) : null}

        {!loading && error ? (
          <div className="flex h-full items-center justify-center px-3 text-center text-sm text-rose-200">
            {error}
          </div>
        ) : null}

        {!loading && !error && displayFrame ? (
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

        {!loading && !error && !displayFrame && frameData.warning ? (
          <div className="flex h-full items-center justify-center px-3 text-center text-sm text-slate-300">
            {frameData.warning}
          </div>
        ) : null}
      </div>
    );
  },
  SettingsPanel: ({ config, onChange }) => {
    const normalizedConfig = normalizeConfig(config);

    const applyPatch = (patch: Partial<PhotosModuleConfig>) => {
      onChange({
        ...normalizedConfig,
        ...patch,
      });
    };

    return (
      <div className="space-y-4 rounded-lg border border-slate-700 bg-slate-900 p-4 text-sm text-slate-200">
        <h3 className="text-base font-semibold">Photos settings</h3>

        <label className="block space-y-2">
          <span>Slide interval (seconds)</span>
          <input
            className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
            type="number"
            min={3}
            max={3600}
            value={normalizedConfig.intervalSeconds}
            onChange={(event) =>
              applyPatch({
                intervalSeconds: Math.max(
                  3,
                  Math.min(3600, Number(event.target.value) || 3),
                ),
              })
            }
          />
        </label>

        <label className="flex items-center justify-between">
          <span>Shuffle</span>
          <input
            type="checkbox"
            checked={normalizedConfig.shuffle}
            onChange={(event) => applyPatch({ shuffle: event.target.checked })}
          />
        </label>

        <label className="block space-y-2">
          <span>Layout orientation lock</span>
          <select
            className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
            value={normalizedConfig.layoutOrientation}
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

      </div>
    );
  },
};
