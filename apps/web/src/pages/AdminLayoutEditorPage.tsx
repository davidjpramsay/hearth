import {
  addModuleToLayout,
  addModuleToLayoutAtPosition,
  removeModuleFromLayout,
  updateLayoutGridItems,
  updateModuleConfig,
} from "@hearth/core";
import {
  type GridItem,
  type LayoutRecord,
  type LayoutTypography,
  type ModuleManifest,
} from "@hearth/shared";
import GridLayout from "react-grid-layout";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type Ref,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getLayouts, updateLayout } from "../api/client";
import { logoutAdminSession } from "../auth/session";
import { getAuthToken } from "../auth/storage";
import { ModuleFrame } from "../components/ModuleFrame";
import {
  getAdaptiveGridMetrics,
  getPhotoLayoutLock,
  inferLayoutRows,
  sanitizeGridItems,
} from "../layout/grid-math";
import {
  areLayoutTypographyEqual,
  buildLayoutTypographyStyle,
  DEFAULT_LAYOUT_TYPOGRAPHY,
  formatLayoutTypographyValue,
  LAYOUT_TYPOGRAPHY_CONTROLS,
  LAYOUT_TYPOGRAPHY_DENSITY_OPTIONS,
  normalizeLayoutTypography,
  snapLayoutTypographyValue,
} from "../layout/layout-typography";
import {
  ModuleDashboardTile,
  ModuleSettingsPanel,
  moduleRegistry,
} from "../registry/module-registry";
import type { RegisteredModuleDefinition } from "../registry/unified-module-registry";

const PREVIEW_CANVAS_BASE_WIDTH = 1920;
const GRID_MARGIN_PX = 0;
const PREVIEW_GRID_MAJOR_STEP = 4;
const MODULE_SWATCHES = ["#f6d8d1", "#e4ecdf", "#e3daf0", "#dbe8f1", "#f7e4b8"];
const ASPECT_RATIO_PRESETS = [
  { label: "Wide display", width: 16, height: 9 },
  { label: "Classic display", width: 4, height: 3 },
  { label: "Balanced display", width: 3, height: 2 },
  { label: "Portrait display", width: 9, height: 16 },
  { label: "Tall display", width: 3, height: 4 },
  { label: "Square display", width: 1, height: 1 },
] as const;

const toPositiveNumberOr = (value: string, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
};

const formatAspectRatioLabel = (ratio: number): string =>
  ratio >= 1 ? `${ratio.toFixed(2)}:1` : `1:${(1 / ratio).toFixed(2)}`;

const hasLayoutChanged = (current: LayoutRecord, next: LayoutRecord): boolean => {
  if (current.name !== next.name) {
    return true;
  }

  return JSON.stringify(current.config) !== JSON.stringify(next.config);
};

const readDraggedModuleId = (
  event: DragEvent | undefined,
  fallbackId: string | null,
): string | null => {
  if (!event?.dataTransfer) {
    return fallbackId;
  }

  try {
    const customTypeId = event.dataTransfer.getData("application/x-hearth-module");
    if (customTypeId) {
      return customTypeId;
    }

    const plainTextId = event.dataTransfer.getData("text/plain");
    return plainTextId || fallbackId;
  } catch {
    return fallbackId;
  }
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const areGridItemsEqual = (left: GridItem[], right: GridItem[]): boolean => {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];

    if (a.i !== b.i || a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h) {
      return false;
    }
  }

  return true;
};

const renderResizeHandle = (axis: string, ref: Ref<HTMLElement>): ReactElement => (
  <span
    ref={ref}
    className={`react-resizable-handle react-resizable-handle-${axis} hearth-layout-resize-handle`}
  >
    <span className="hearth-layout-resize-handle__grip" />
  </span>
);

interface LayoutTypographyPanelProps {
  value: LayoutTypography;
  onChange: (next: LayoutTypography) => void;
  onReset: () => void;
}

const LayoutTypographyPanel = ({ value, onChange, onReset }: LayoutTypographyPanelProps) => {
  const updateValue = (
    key: (typeof LAYOUT_TYPOGRAPHY_CONTROLS)[number]["key"],
    nextValue: number,
  ) => {
    if (!Number.isFinite(nextValue)) {
      return;
    }

    const control = LAYOUT_TYPOGRAPHY_CONTROLS.find((entry) => entry.key === key);
    if (!control) {
      return;
    }

    onChange(
      normalizeLayoutTypography({
        ...value,
        [key]: snapLayoutTypographyValue(nextValue, control),
      }),
    );
  };

  return (
    <section className="min-w-0 rounded-xl border border-slate-700 bg-slate-900/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Responsive typography</h3>
          <p className="mt-1 text-xs text-slate-400">
            Auto mode scales each module from its tile size while keeping shared label, body, title,
            and hero ratios.
          </p>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="rounded border border-slate-600 px-2.5 py-1 text-xs font-semibold text-slate-200 hover:border-slate-400"
        >
          Reset
        </button>
      </div>

      <div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(520px,0.95fr)] xl:items-start">
        <div
          style={buildLayoutTypographyStyle(value)}
          className="module-tile-host h-48 rounded-xl border border-slate-700 bg-slate-950/75"
        >
          <div className="module-panel-shell h-full p-4">
            <p className="module-copy-label text-cyan-200">Label</p>
            <p className="module-copy-body mt-3 text-slate-200">Body copy preview.</p>
            <p className="module-copy-title mt-4 text-slate-100">Title</p>
            <div className="mt-4">
              <span className="module-copy-hero text-slate-100">25°C</span>
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={() => onChange(normalizeLayoutTypography({ ...value, mode: "auto" }))}
              className={`rounded-xl border p-3 text-left ${
                value.mode === "auto"
                  ? "border-cyan-400 bg-cyan-500/10 text-cyan-100"
                  : "border-slate-700 bg-slate-950/60 text-slate-300 hover:border-slate-500"
              }`}
            >
              <span className="block text-sm font-semibold">Auto</span>
              <span className="mt-1 block text-xs text-slate-400">
                Recommended. Adapts to module size and screen ratio.
              </span>
            </button>
            <button
              type="button"
              onClick={() => onChange(normalizeLayoutTypography({ ...value, mode: "custom" }))}
              className={`rounded-xl border p-3 text-left ${
                value.mode === "custom"
                  ? "border-cyan-400 bg-cyan-500/10 text-cyan-100"
                  : "border-slate-700 bg-slate-950/60 text-slate-300 hover:border-slate-500"
              }`}
            >
              <span className="block text-sm font-semibold">Custom</span>
              <span className="mt-1 block text-xs text-slate-400">
                Uses fixed rem sizes from the legacy sliders.
              </span>
            </button>
          </div>

          {value.mode === "auto" ? (
            <div className="grid gap-3 md:grid-cols-3">
              {LAYOUT_TYPOGRAPHY_DENSITY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    onChange(normalizeLayoutTypography({ ...value, density: option.value }))
                  }
                  className={`rounded-xl border p-3 text-left ${
                    value.density === option.value
                      ? "border-cyan-400 bg-cyan-500/10 text-cyan-100"
                      : "border-slate-700 bg-slate-950/60 text-slate-300 hover:border-slate-500"
                  }`}
                >
                  <span className="block text-sm font-semibold">{option.label}</span>
                  <span className="mt-1 block text-xs text-slate-400">{option.description}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {LAYOUT_TYPOGRAPHY_CONTROLS.map((control) => (
                <label
                  key={control.key}
                  className="block rounded-xl border border-slate-700 bg-slate-950/60 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="block text-sm font-semibold text-slate-100">
                        {control.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-400">
                        {control.description}
                      </span>
                    </div>
                    <span className="w-[6.25rem] rounded border border-slate-700 bg-slate-900/80 px-2 py-1 text-right text-xs tabular-nums text-slate-300">
                      {formatLayoutTypographyValue(value[control.key])}
                    </span>
                  </div>

                  <div className="mt-3 space-y-3">
                    <input
                      type="range"
                      min={control.min}
                      max={control.max}
                      step={control.step}
                      value={value[control.key]}
                      onChange={(event) => updateValue(control.key, Number(event.target.value))}
                      className="w-full accent-cyan-500"
                    />
                  </div>
                </label>
              ))}
            </div>
          )}

          {value.mode === "auto" ? (
            <p className="rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs text-slate-400">
              Auto mode still uses the same semantic classes across every module. The only thing
              that changes is the tile-derived scale.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
};

export const AdminLayoutEditorPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const layoutId = Number(id);
  const token = getAuthToken();

  const [layout, setLayout] = useState<LayoutRecord | null>(null);
  const [catalog, setCatalog] = useState<ModuleManifest[]>([]);
  const [loadedModules, setLoadedModules] = useState<
    Record<string, RegisteredModuleDefinition<any>>
  >({});
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [draggingModuleId, setDraggingModuleId] = useState<string | null>(null);
  const [customAspectWidth, setCustomAspectWidth] = useState("16");
  const [customAspectHeight, setCustomAspectHeight] = useState("9");
  const [previewHostSize, setPreviewHostSize] = useState({ width: 0, height: 0 });
  const [draftGridItems, setDraftGridItems] = useState<GridItem[] | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [moduleSearch, setModuleSearch] = useState("");

  const saveTimeoutRef = useRef<number | null>(null);
  const queuedSaveRef = useRef<LayoutRecord | null>(null);
  const saveInFlightRef = useRef(false);
  const previewHostRef = useRef<HTMLDivElement | null>(null);
  const undoStackRef = useRef<LayoutRecord[]>([]);
  const redoStackRef = useRef<LayoutRecord[]>([]);

  const loadData = useCallback(async () => {
    if (!token) {
      navigate("/admin/login", { replace: true });
      return;
    }

    if (!Number.isFinite(layoutId)) {
      navigate("/admin/layouts", { replace: true });
      return;
    }

    const layouts = await getLayouts(false, token);

    const matchedLayout = layouts.find((entry) => entry.id === layoutId);
    if (!matchedLayout) {
      navigate("/admin/layouts", { replace: true });
      return;
    }

    setLayout(matchedLayout);
    undoStackRef.current = [];
    redoStackRef.current = [];
    setCatalog(moduleRegistry.listModules());
    setError(null);
  }, [layoutId, navigate, token]);

  useEffect(() => {
    void loadData().catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : "Failed to load layout");
    });
  }, [loadData]);

  useEffect(
    () => () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const host = previewHostRef.current;
    if (!host) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      setPreviewHostSize({
        width: Math.max(0, Math.floor(entry.contentRect.width)),
        height: Math.max(0, Math.floor(entry.contentRect.height)),
      });
    });

    observer.observe(host);
    return () => {
      observer.disconnect();
    };
  }, [layout?.id]);

  const flushQueuedSave = useCallback(async () => {
    if (!token || saveInFlightRef.current) {
      return;
    }

    const nextLayout = queuedSaveRef.current;
    if (!nextLayout) {
      return;
    }

    queuedSaveRef.current = null;
    saveInFlightRef.current = true;
    setSaveState("saving");

    try {
      const savedLayout = await updateLayout(token, nextLayout.id, {
        name: nextLayout.name,
        config: nextLayout.config,
        expectedVersion: nextLayout.version,
      });

      setError(null);

      const queuedLayout = queuedSaveRef.current as LayoutRecord | null;
      if (queuedLayout) {
        queuedSaveRef.current = {
          ...queuedLayout,
          version: savedLayout.version,
          updatedAt: savedLayout.updatedAt,
        };
        setLayout((currentLayout) =>
          currentLayout && currentLayout.id === savedLayout.id
            ? {
                ...currentLayout,
                version: savedLayout.version,
                updatedAt: savedLayout.updatedAt,
              }
            : currentLayout,
        );
      } else {
        setLayout(savedLayout);
        setSaveState("saved");
      }
    } catch (saveError) {
      const message =
        saveError instanceof Error ? saveError.message : "Failed to persist layout changes.";
      setError(message);
      setSaveState("error");
      queuedSaveRef.current = null;

      if (typeof message === "string" && message.toLowerCase().includes("unauthorized")) {
        logoutAdminSession();
      }
    } finally {
      saveInFlightRef.current = false;
      if (queuedSaveRef.current) {
        void flushQueuedSave();
      }
    }
  }, [token]);

  const queueSave = useCallback(
    (nextLayout: LayoutRecord) => {
      if (!token) {
        return;
      }

      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }

      queuedSaveRef.current = nextLayout;
      setSaveState("saving");
      saveTimeoutRef.current = window.setTimeout(() => {
        saveTimeoutRef.current = null;
        void flushQueuedSave();
      }, 500);
    },
    [flushQueuedSave, token],
  );

  const availableModules = useMemo(
    () => catalog.filter((entry) => moduleRegistry.getModuleManifest(entry.id)),
    [catalog],
  );
  const visibleModules = useMemo(() => {
    const query = moduleSearch.trim().toLowerCase();
    return query.length === 0
      ? availableModules
      : availableModules.filter((entry) => entry.displayName.toLowerCase().includes(query));
  }, [availableModules, moduleSearch]);

  const selectedInstance = layout?.config.modules.find(
    (instance) => instance.id === selectedInstanceId,
  );

  const selectedModuleDefinition = selectedInstance
    ? loadedModules[selectedInstance.moduleId]
    : undefined;

  useEffect(() => {
    if (!selectedInstance) {
      return;
    }

    const moduleId = selectedInstance.moduleId;
    if (loadedModules[moduleId]) {
      return;
    }

    let cancelled = false;
    void moduleRegistry
      .loadModule(moduleId)
      .then((definition) => {
        if (cancelled) {
          return;
        }
        setLoadedModules((current) => ({
          ...current,
          [moduleId]: definition,
        }));
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load module");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loadedModules, selectedInstance]);

  const selectedModuleConfig = useMemo(() => {
    if (!selectedInstance || !selectedModuleDefinition) {
      return null;
    }

    const parsed = selectedModuleDefinition.configSchema.safeParse(selectedInstance.config);
    if (!parsed.success || typeof parsed.data !== "object" || parsed.data === null) {
      return {} as Record<string, unknown>;
    }

    return parsed.data as Record<string, unknown>;
  }, [selectedInstance, selectedModuleDefinition]);

  const resolvedPreviewAspectRatio = useMemo(() => {
    const width = toPositiveNumberOr(customAspectWidth, 16);
    const height = toPositiveNumberOr(customAspectHeight, 9);
    return width / height;
  }, [customAspectHeight, customAspectWidth]);

  const previewCanvasBaseSize = useMemo(
    () => ({
      width: PREVIEW_CANVAS_BASE_WIDTH,
      height: Math.max(1, Math.round(PREVIEW_CANVAS_BASE_WIDTH / resolvedPreviewAspectRatio)),
    }),
    [resolvedPreviewAspectRatio],
  );

  const previewGridMetrics = useMemo(
    () =>
      getAdaptiveGridMetrics({
        canvasWidth: previewCanvasBaseSize.width,
        canvasHeight: previewCanvasBaseSize.height,
        aspectWidth: toPositiveNumberOr(customAspectWidth, 16),
        aspectHeight: toPositiveNumberOr(customAspectHeight, 9),
      }),
    [
      customAspectHeight,
      customAspectWidth,
      previewCanvasBaseSize.height,
      previewCanvasBaseSize.width,
    ],
  );

  const previewGridCanvasSize = useMemo(
    () => ({
      width: Math.max(1, previewGridMetrics.cols * previewGridMetrics.rowHeight),
      height: Math.max(1, previewGridMetrics.rows * previewGridMetrics.rowHeight),
    }),
    [previewGridMetrics.cols, previewGridMetrics.rowHeight, previewGridMetrics.rows],
  );

  const previewScale = useMemo(() => {
    if (previewHostSize.width < 1 || previewHostSize.height < 1) {
      return 0;
    }

    return Math.min(
      previewHostSize.width / previewGridCanvasSize.width,
      previewHostSize.height / previewGridCanvasSize.height,
    );
  }, [
    previewHostSize.height,
    previewHostSize.width,
    previewGridCanvasSize.height,
    previewGridCanvasSize.width,
  ]);

  const previewDisplaySize = useMemo(() => {
    if (previewScale <= 0) {
      return { width: 0, height: 0 };
    }

    return {
      width: Math.max(1, Math.round(previewGridCanvasSize.width * previewScale)),
      height: Math.max(1, Math.round(previewGridCanvasSize.height * previewScale)),
    };
  }, [previewGridCanvasSize.height, previewGridCanvasSize.width, previewScale]);

  const previewGridLines = useMemo(() => {
    if (
      previewScale <= 0 ||
      previewDisplaySize.width < 1 ||
      previewDisplaySize.height < 1 ||
      previewGridMetrics.cols < 1 ||
      previewGridMetrics.rows < 1
    ) {
      return {
        minorVertical: [] as number[],
        majorVertical: [] as number[],
        minorHorizontal: [] as number[],
        majorHorizontal: [] as number[],
      };
    }

    const cellWidth = previewDisplaySize.width / previewGridMetrics.cols;
    const cellHeight = previewDisplaySize.height / previewGridMetrics.rows;

    const minorVertical: number[] = [];
    const majorVertical: number[] = [];
    const minorHorizontal: number[] = [];
    const majorHorizontal: number[] = [];

    for (let column = 1; column < previewGridMetrics.cols; column += 1) {
      const position = column * cellWidth;
      if (column % PREVIEW_GRID_MAJOR_STEP === 0) {
        majorVertical.push(position);
      } else {
        minorVertical.push(position);
      }
    }

    for (let row = 1; row < previewGridMetrics.rows; row += 1) {
      const position = row * cellHeight;
      if (row % PREVIEW_GRID_MAJOR_STEP === 0) {
        majorHorizontal.push(position);
      } else {
        minorHorizontal.push(position);
      }
    }

    return {
      minorVertical,
      majorVertical,
      minorHorizontal,
      majorHorizontal,
    };
  }, [
    previewDisplaySize.height,
    previewDisplaySize.width,
    previewGridMetrics.cols,
    previewGridMetrics.rows,
    previewScale,
  ]);

  const normalizeLayoutConfigToPreviewGrid = useCallback(
    (
      config: LayoutRecord["config"],
      items: GridItem[],
      sourceCols: number,
      sourceRows: number,
    ): LayoutRecord["config"] => ({
      ...config,
      cols: previewGridMetrics.cols,
      rows: previewGridMetrics.rows,
      rowHeight: Math.max(10, Math.round(previewGridMetrics.rowHeight)),
      items: sanitizeGridItems({
        items,
        modules: config.modules,
        sourceCols,
        sourceRows,
        targetCols: previewGridMetrics.cols,
        targetRows: previewGridMetrics.rows,
      }),
    }),
    [previewGridMetrics.cols, previewGridMetrics.rowHeight, previewGridMetrics.rows],
  );

  const applyLayoutPatch = useCallback(
    (patcher: (current: LayoutRecord) => LayoutRecord) => {
      setLayout((currentLayout) => {
        if (!currentLayout) {
          return currentLayout;
        }

        const patchedLayout = patcher(currentLayout);
        const nextLayout = {
          ...patchedLayout,
          config: normalizeLayoutConfigToPreviewGrid(
            patchedLayout.config,
            patchedLayout.config.items,
            patchedLayout.config.cols,
            inferLayoutRows(patchedLayout.config),
          ),
        };

        if (!hasLayoutChanged(currentLayout, nextLayout)) {
          return currentLayout;
        }

        undoStackRef.current = [...undoStackRef.current.slice(-49), currentLayout];
        redoStackRef.current = [];
        queueSave(nextLayout);
        return nextLayout;
      });
    },
    [normalizeLayoutConfigToPreviewGrid, queueSave],
  );

  const restoreHistoryLayout = useCallback(
    (direction: "undo" | "redo") => {
      const source = direction === "undo" ? undoStackRef.current : redoStackRef.current;
      const target = source.at(-1);
      if (!target) return;

      setLayout((current) => {
        if (!current) return current;
        if (direction === "undo") {
          undoStackRef.current = source.slice(0, -1);
          redoStackRef.current = [...redoStackRef.current.slice(-49), current];
        } else {
          redoStackRef.current = source.slice(0, -1);
          undoStackRef.current = [...undoStackRef.current.slice(-49), current];
        }
        const restored = { ...target, version: current.version, updatedAt: current.updatedAt };
        queueSave(restored);
        return restored;
      });
    },
    [queueSave],
  );

  const editorGridItems = useMemo(() => {
    if (!layout) {
      return [] as GridItem[];
    }

    return sanitizeGridItems({
      items: layout.config.items,
      modules: layout.config.modules,
      sourceCols: layout.config.cols,
      sourceRows: inferLayoutRows(layout.config),
      targetCols: previewGridMetrics.cols,
      targetRows: previewGridMetrics.rows,
    });
  }, [layout, previewGridMetrics.cols, previewGridMetrics.rows]);

  const gridLayoutItems = useMemo(() => {
    if (!layout) {
      return [] as Array<GridItem & { lockAspectRatio?: boolean }>;
    }

    const modulesById = new Map(layout.config.modules.map((module) => [module.id, module]));
    const baseItems = draftGridItems ?? editorGridItems;

    return baseItems.map((item) => {
      const lock = getPhotoLayoutLock(modulesById.get(item.i));

      if (!lock) {
        return item;
      }

      return {
        ...item,
        lockAspectRatio: true,
      };
    });
  }, [draftGridItems, editorGridItems, layout]);

  useEffect(() => {
    setDraftGridItems((currentDraft) => {
      if (!currentDraft) {
        return editorGridItems;
      }

      return areGridItemsEqual(currentDraft, editorGridItems) ? currentDraft : editorGridItems;
    });
  }, [editorGridItems]);

  const persistGridItems = useCallback(
    (nextItems: GridItem[]) => {
      const parsedItems = nextItems.map((item) => ({
        i: item.i,
        x: Math.round(item.x),
        y: Math.round(item.y),
        w: Math.round(item.w),
        h: Math.round(item.h),
      }));

      applyLayoutPatch((current) => ({
        ...current,
        config: normalizeLayoutConfigToPreviewGrid(
          updateLayoutGridItems(current.config, parsedItems),
          parsedItems,
          previewGridMetrics.cols,
          previewGridMetrics.rows,
        ),
      }));
    },
    [
      applyLayoutPatch,
      normalizeLayoutConfigToPreviewGrid,
      previewGridMetrics.cols,
      previewGridMetrics.rows,
    ],
  );

  const applyLiveGridItems = useCallback(
    (nextItems: GridItem[]) => {
      if (!layout) {
        return;
      }

      const parsedItems = nextItems.map((item) => ({
        i: item.i,
        x: Math.round(item.x),
        y: Math.round(item.y),
        w: Math.round(item.w),
        h: Math.round(item.h),
      }));

      const normalizedItems = sanitizeGridItems({
        items: parsedItems,
        modules: layout.config.modules,
        sourceCols: previewGridMetrics.cols,
        sourceRows: previewGridMetrics.rows,
        targetCols: previewGridMetrics.cols,
        targetRows: previewGridMetrics.rows,
      });

      setDraftGridItems((currentDraft) =>
        currentDraft && areGridItemsEqual(currentDraft, normalizedItems)
          ? currentDraft
          : normalizedItems,
      );
    },
    [layout, previewGridMetrics.cols, previewGridMetrics.rows],
  );

  const addModuleFromPalette = useCallback(
    async (moduleId: string) => {
      let moduleDefinition: RegisteredModuleDefinition<any>;
      try {
        moduleDefinition = await moduleRegistry.loadModule(moduleId);
        setLoadedModules((current) => ({
          ...current,
          [moduleId]: moduleDefinition,
        }));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load module");
        return;
      }

      applyLayoutPatch((current) => {
        const created = addModuleToLayout(
          {
            ...current.config,
            cols: previewGridMetrics.cols,
            rows: previewGridMetrics.rows,
            rowHeight: Math.max(10, Math.round(previewGridMetrics.rowHeight)),
          },
          moduleDefinition,
        );

        return {
          ...current,
          config: normalizeLayoutConfigToPreviewGrid(
            created.config,
            created.config.items,
            previewGridMetrics.cols,
            previewGridMetrics.rows,
          ),
        };
      });
    },
    [
      applyLayoutPatch,
      normalizeLayoutConfigToPreviewGrid,
      previewGridMetrics.cols,
      previewGridMetrics.rowHeight,
      previewGridMetrics.rows,
    ],
  );

  const previewRatioLabel = useMemo(
    () => formatAspectRatioLabel(resolvedPreviewAspectRatio),
    [resolvedPreviewAspectRatio],
  );

  const layoutTypography = useMemo(
    () => normalizeLayoutTypography(layout?.config.typography),
    [layout?.config.typography],
  );
  const [draftTypography, setDraftTypography] =
    useState<LayoutTypography>(DEFAULT_LAYOUT_TYPOGRAPHY);
  const isDraftTypographySynced = areLayoutTypographyEqual(draftTypography, layoutTypography);

  useEffect(() => {
    setDraftTypography(layoutTypography);
  }, [
    layoutTypography.bodyRem,
    layoutTypography.density,
    layoutTypography.displayRem,
    layoutTypography.mode,
    layoutTypography.smallRem,
    layoutTypography.titleRem,
  ]);

  useEffect(() => {
    if (!layout || isDraftTypographySynced) {
      return;
    }

    const timeout = window.setTimeout(() => {
      applyLayoutPatch((current) => ({
        ...current,
        config: {
          ...current.config,
          typography: draftTypography,
        },
      }));
    }, 180);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [applyLayoutPatch, draftTypography, isDraftTypographySynced, layout]);

  const hasSelectedModuleSettings =
    Boolean(selectedInstance) && Boolean(selectedModuleDefinition) && Boolean(selectedModuleConfig);
  const inspectorTitle = selectedModuleDefinition?.displayName ?? "Module settings";
  const moduleCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const instance of layout?.config.modules ?? []) {
      counts.set(instance.moduleId, (counts.get(instance.moduleId) ?? 0) + 1);
    }
    return counts;
  }, [layout?.config.modules]);
  const canUndo = undoStackRef.current.length > 0;
  const canRedo = redoStackRef.current.length > 0;

  if (!layout) {
    return (
      <main className="flex min-h-screen items-center justify-center text-slate-200">
        Loading layout editor...
      </main>
    );
  }

  return (
    <main className="hearth-layout-studio">
      <header className="hearth-layout-studio__toolbar">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <Link
            to="/admin/layouts"
            className="hearth-studio-icon-button"
            aria-label="Back to layouts"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none">
              <path
                d="M19 12H5m6-6-6 6 6 6"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
          <input
            value={layout.name}
            onChange={(event) =>
              applyLayoutPatch((current) => ({ ...current, name: event.target.value }))
            }
            className="min-w-0 flex-1 border-0 bg-transparent px-2 py-2 text-xl font-semibold text-stone-900 outline-none focus:text-teal-800 sm:min-w-[240px]"
          />
          <span className="text-sm text-stone-500" aria-live="polite">
            {saveState === "saving"
              ? "Saving…"
              : saveState === "saved"
                ? "✓ Saved"
                : saveState === "error"
                  ? "Save failed"
                  : "Saved"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-xl border border-stone-300 bg-white">
            <button
              type="button"
              onClick={() => restoreHistoryLayout("undo")}
              disabled={!canUndo}
              className="px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:text-stone-300"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={() => restoreHistoryLayout("redo")}
              disabled={!canRedo}
              className="border-l border-stone-300 px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:text-stone-300"
            >
              Redo
            </button>
          </div>
          <details className="relative">
            <summary className="list-none cursor-pointer rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 hover:border-teal-600">
              Layout settings
            </summary>
            <div className="absolute right-0 top-12 z-50 w-[min(760px,90vw)] rounded-2xl border border-stone-200 bg-white p-3 shadow-xl">
              <LayoutTypographyPanel
                value={draftTypography}
                onChange={setDraftTypography}
                onReset={() => setDraftTypography(DEFAULT_LAYOUT_TYPOGRAPHY)}
              />
            </div>
          </details>
          <details className="relative">
            <summary className="list-none cursor-pointer rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 hover:border-teal-600">
              Screen · {customAspectWidth}:{customAspectHeight}
            </summary>
            <div className="absolute right-0 top-12 z-50 w-[min(420px,88vw)] rounded-2xl border border-stone-200 bg-white p-4 shadow-xl">
              <p className="text-sm font-semibold text-stone-900">Preview screen</p>
              <p className="mt-1 text-xs leading-5 text-stone-500">
                Test the same layout on common wall displays. The grid and typography adapt without
                changing your modules.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {ASPECT_RATIO_PRESETS.map((preset) => {
                  const selected =
                    customAspectWidth === String(preset.width) &&
                    customAspectHeight === String(preset.height);
                  return (
                    <button
                      key={`${preset.width}:${preset.height}`}
                      type="button"
                      onClick={() => {
                        setCustomAspectWidth(String(preset.width));
                        setCustomAspectHeight(String(preset.height));
                      }}
                      className={`rounded-xl border px-3 py-2 text-left transition ${
                        selected
                          ? "border-teal-600 bg-teal-50 text-teal-900"
                          : "border-stone-200 text-stone-700 hover:border-stone-400"
                      }`}
                    >
                      <span className="block text-sm font-semibold">
                        {preset.width}:{preset.height}
                      </span>
                      <span className="mt-0.5 block text-xs text-stone-500">{preset.label}</span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700">
                <span className="mr-auto font-medium">Custom ratio</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={customAspectWidth}
                  onChange={(event) => setCustomAspectWidth(event.target.value)}
                  className="w-12 rounded-md border border-stone-300 bg-white px-1.5 py-1 text-center outline-none focus:border-teal-600"
                  aria-label="Custom ratio width"
                />
                <span>:</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={customAspectHeight}
                  onChange={(event) => setCustomAspectHeight(event.target.value)}
                  className="w-12 rounded-md border border-stone-300 bg-white px-1.5 py-1 text-center outline-none focus:border-teal-600"
                  aria-label="Custom ratio height"
                />
              </div>
            </div>
          </details>
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:border-teal-600"
          >
            Open interactive display
          </a>
        </div>
      </header>

      {error ? (
        <p className="mb-4 rounded border border-rose-500/60 bg-rose-500/10 px-3 py-2 text-rose-100">
          {error}
        </p>
      ) : null}

      <section
        className={`grid min-w-0 flex-1 lg:min-h-0 ${selectedInstance ? "lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_340px]" : "lg:grid-cols-[280px_minmax(0,1fr)]"}`}
      >
        <aside className="hearth-layout-studio__library">
          <h2 className="text-xl font-semibold text-stone-900">Add to layout</h2>
          <p className="mt-1 text-sm text-stone-500">Drag a module onto the canvas.</p>
          <label className="mt-4 block">
            <span className="sr-only">Search modules</span>
            <input
              value={moduleSearch}
              onChange={(event) => setModuleSearch(event.target.value)}
              placeholder="Search modules"
              className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-800 outline-none focus:border-teal-600"
            />
          </label>

          <div className="mt-3 space-y-2 overflow-y-auto pr-1">
            {visibleModules.map((moduleManifest, moduleIndex) => {
              const existingCount = moduleCounts.get(moduleManifest.id) ?? 0;
              return (
                <div
                  key={moduleManifest.id}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "copyMove";
                    event.dataTransfer.setData("application/x-hearth-module", moduleManifest.id);
                    event.dataTransfer.setData("text/plain", moduleManifest.id);
                    setDraggingModuleId(moduleManifest.id);
                  }}
                  onDragEnd={() => setDraggingModuleId(null)}
                  className="cursor-grab rounded-xl border border-transparent px-2 py-2 text-sm text-stone-800 transition hover:border-stone-200 hover:bg-white"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 gap-3">
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base font-semibold text-stone-700"
                        style={{
                          background: MODULE_SWATCHES[moduleIndex % MODULE_SWATCHES.length],
                        }}
                      >
                        {moduleManifest.displayName.slice(0, 1)}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold">{moduleManifest.displayName}</p>
                        <p className="text-xs text-stone-500">
                          Default size: {moduleManifest.defaultSize.w} x{" "}
                          {moduleManifest.defaultSize.h}
                        </p>
                        {existingCount > 0 ? (
                          <p className="mt-1 text-xs font-medium text-stone-500">
                            {existingCount} already in this layout
                          </p>
                        ) : null}
                        {moduleManifest.id === "photos" || moduleManifest.id === "chores" ? (
                          <p className="mt-1 text-xs font-semibold text-teal-700">
                            Interactive on the live display
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <button
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onTouchStart={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void addModuleFromPalette(moduleManifest.id);
                      }}
                      className="module-no-drag min-h-9 rounded-lg border border-teal-700/40 px-2.5 py-1 text-xs font-semibold text-teal-800 hover:bg-teal-50"
                    >
                      {existingCount > 0 ? "Add another" : "Add"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        <div className="hearth-layout-studio__canvas-region">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
            <span>
              Canvas {previewCanvasBaseSize.width} × {previewCanvasBaseSize.height}
            </span>
            <span>
              {previewRatioLabel} · {previewGridMetrics.cols} × {previewGridMetrics.rows} grid
            </span>
          </div>

          <div
            ref={previewHostRef}
            className="flex min-w-0 min-h-[18rem] flex-1 items-center justify-center overflow-hidden rounded-2xl border border-stone-200 bg-[#eeeae2] p-6 lg:min-h-0"
          >
            {previewScale > 0 ? (
              <div
                className="relative overflow-hidden rounded-lg border border-slate-700/70 bg-slate-950"
                style={{
                  width: `${previewDisplaySize.width}px`,
                  height: `${previewDisplaySize.height}px`,
                }}
              >
                <svg
                  className="pointer-events-none absolute inset-0 z-0"
                  width={previewDisplaySize.width}
                  height={previewDisplaySize.height}
                  viewBox={`0 0 ${previewDisplaySize.width} ${previewDisplaySize.height}`}
                  aria-hidden="true"
                >
                  <g stroke="rgba(148, 163, 184, 0.14)" strokeWidth="1">
                    {previewGridLines.minorVertical.map((position) => (
                      <line
                        key={`minor-v-${position}`}
                        x1={position}
                        y1={0}
                        x2={position}
                        y2={previewDisplaySize.height}
                      />
                    ))}
                    {previewGridLines.minorHorizontal.map((position) => (
                      <line
                        key={`minor-h-${position}`}
                        x1={0}
                        y1={position}
                        x2={previewDisplaySize.width}
                        y2={position}
                      />
                    ))}
                  </g>
                  <g stroke="rgba(148, 163, 184, 0.24)" strokeWidth="1">
                    {previewGridLines.majorVertical.map((position) => (
                      <line
                        key={`major-v-${position}`}
                        x1={position}
                        y1={0}
                        x2={position}
                        y2={previewDisplaySize.height}
                      />
                    ))}
                    {previewGridLines.majorHorizontal.map((position) => (
                      <line
                        key={`major-h-${position}`}
                        x1={0}
                        y1={position}
                        x2={previewDisplaySize.width}
                        y2={position}
                      />
                    ))}
                  </g>
                </svg>
                <div
                  style={{
                    width: `${previewGridCanvasSize.width}px`,
                    height: `${previewGridCanvasSize.height}px`,
                    transform: `scale(${previewScale})`,
                    transformOrigin: "top left",
                    ...buildLayoutTypographyStyle(draftTypography),
                  }}
                  className="relative z-10"
                >
                  <GridLayout
                    width={previewGridCanvasSize.width}
                    transformScale={previewScale}
                    className="layout"
                    style={{ height: previewGridCanvasSize.height }}
                    layout={gridLayoutItems}
                    cols={previewGridMetrics.cols}
                    rowHeight={previewGridMetrics.rowHeight}
                    maxRows={previewGridMetrics.rows}
                    autoSize={false}
                    isResizable
                    isDraggable
                    draggableHandle=".module-drag-handle"
                    draggableCancel=".module-no-drag,.module-no-drag *"
                    compactType={null}
                    preventCollision
                    margin={[GRID_MARGIN_PX, GRID_MARGIN_PX]}
                    containerPadding={[0, 0]}
                    resizeHandle={renderResizeHandle}
                    isDroppable
                    onDropDragOver={() => {
                      const moduleId = draggingModuleId;

                      if (!moduleId) {
                        return false;
                      }

                      const moduleManifest = moduleRegistry.getModuleManifest(moduleId);
                      if (!moduleManifest) {
                        return false;
                      }

                      const dropWidth = clamp(
                        moduleManifest.defaultSize.w,
                        1,
                        previewGridMetrics.cols,
                      );
                      const dropHeight = clamp(
                        moduleManifest.defaultSize.h,
                        1,
                        previewGridMetrics.rows,
                      );

                      return {
                        w: dropWidth,
                        h: dropHeight,
                      };
                    }}
                    onDrop={(_layout, item, event) => {
                      const moduleId = readDraggedModuleId(
                        (event as DragEvent | undefined) ?? undefined,
                        draggingModuleId,
                      );

                      if (!moduleId) {
                        return;
                      }

                      if (!item || typeof item.x !== "number" || typeof item.y !== "number") {
                        return;
                      }

                      void moduleRegistry
                        .loadModule(moduleId)
                        .then((moduleDefinition) => {
                          setLoadedModules((current) => ({
                            ...current,
                            [moduleId]: moduleDefinition,
                          }));

                          applyLayoutPatch((current) => {
                            const created = addModuleToLayoutAtPosition(
                              {
                                ...current.config,
                                cols: previewGridMetrics.cols,
                                rows: previewGridMetrics.rows,
                                rowHeight: Math.max(10, Math.round(previewGridMetrics.rowHeight)),
                              },
                              moduleDefinition,
                              { x: item.x, y: item.y },
                            );

                            return {
                              ...current,
                              config: normalizeLayoutConfigToPreviewGrid(
                                created.config,
                                created.config.items,
                                previewGridMetrics.cols,
                                previewGridMetrics.rows,
                              ),
                            };
                          });
                        })
                        .catch((loadError) => {
                          setError(
                            loadError instanceof Error
                              ? loadError.message
                              : "Failed to load module",
                          );
                        })
                        .finally(() => {
                          setDraggingModuleId(null);
                        });
                    }}
                    onResize={(nextItems) => {
                      applyLiveGridItems(nextItems as GridItem[]);
                    }}
                    onLayoutChange={(nextItems) => applyLiveGridItems(nextItems as GridItem[])}
                    onDragStop={(nextItems) => persistGridItems(nextItems as GridItem[])}
                    onResizeStop={(nextItems) => persistGridItems(nextItems as GridItem[])}
                  >
                    {layout.config.modules.map((instance) => {
                      const manifest = moduleRegistry.getModuleManifest(instance.moduleId);

                      return (
                        <div
                          key={instance.id}
                          className={`module-tile-host h-full ${
                            selectedInstanceId === instance.id ? "ring-2 ring-cyan-400" : ""
                          }`}
                        >
                          <ModuleFrame
                            title={manifest?.displayName ?? instance.moduleId}
                            onSelect={() => setSelectedInstanceId(instance.id)}
                            onRemove={() => {
                              applyLayoutPatch((current) => {
                                const trimmedConfig = removeModuleFromLayout(
                                  current.config,
                                  instance.id,
                                );

                                return {
                                  ...current,
                                  config: normalizeLayoutConfigToPreviewGrid(
                                    trimmedConfig,
                                    trimmedConfig.items,
                                    trimmedConfig.cols,
                                    inferLayoutRows(trimmedConfig),
                                  ),
                                };
                              });

                              setSelectedInstanceId((currentSelected) =>
                                currentSelected === instance.id ? null : currentSelected,
                              );
                            }}
                          >
                            {manifest ? (
                              <ModuleDashboardTile
                                moduleId={instance.moduleId}
                                instanceId={instance.id}
                                config={instance.config}
                                isEditing
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center rounded bg-slate-800 text-sm text-rose-200">
                                Missing module: {instance.moduleId}
                              </div>
                            )}
                          </ModuleFrame>
                        </div>
                      );
                    })}
                  </GridLayout>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Preparing preview canvas...</p>
            )}
          </div>
        </div>

        {selectedInstance ? (
          <aside className="hearth-layout-studio__inspector lg:col-span-2 xl:col-span-1">
            <h2 className="text-xl font-semibold text-stone-900">{inspectorTitle}</h2>
            {hasSelectedModuleSettings ? (
              <p className="mt-1 text-xs text-slate-400">{selectedModuleDefinition?.displayName}</p>
            ) : null}
            <div className="mt-3 min-h-0 space-y-4 overflow-y-auto pr-1">
              {!selectedModuleDefinition ? (
                <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-300">
                  Loading module settings...
                </div>
              ) : !selectedModuleConfig ? (
                <div className="rounded-lg border border-rose-500/50 bg-rose-500/10 p-4 text-sm text-rose-100">
                  Module settings could not be parsed.
                </div>
              ) : (
                <ModuleSettingsPanel
                  moduleId={selectedInstance.moduleId}
                  config={selectedModuleConfig}
                  onChange={(nextConfig) => {
                    applyLayoutPatch((current) => {
                      const updatedConfig = updateModuleConfig(
                        current.config,
                        selectedInstance.id,
                        nextConfig as Record<string, unknown>,
                      );

                      return {
                        ...current,
                        config: normalizeLayoutConfigToPreviewGrid(
                          updatedConfig,
                          updatedConfig.items,
                          updatedConfig.cols,
                          inferLayoutRows(updatedConfig),
                        ),
                      };
                    });
                  }}
                />
              )}
            </div>
          </aside>
        ) : null}
      </section>
    </main>
  );
};
