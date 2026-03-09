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
  type ModuleManifest,
} from "@hearth/shared";
import GridLayout from "react-grid-layout";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getLayouts, updateLayout } from "../api/client";
import { clearAuthToken, getAuthToken } from "../auth/storage";
import { AdminNavActions } from "../components/admin/AdminNavActions";
import { ModuleFrame } from "../components/ModuleFrame";
import {
  getAdaptiveGridMetrics,
  getPhotoLayoutLock,
  inferLayoutRows,
  sanitizeGridItems,
} from "../layout/grid-math";
import { moduleRegistry } from "../registry/module-registry";

const PREVIEW_CANVAS_BASE_WIDTH = 1920;
const GRID_MARGIN_PX = 0;

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

    if (
      a.i !== b.i ||
      a.x !== b.x ||
      a.y !== b.y ||
      a.w !== b.w ||
      a.h !== b.h
    ) {
      return false;
    }
  }

  return true;
};

export const AdminLayoutEditorPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const layoutId = Number(id);
  const token = getAuthToken();

  const [layout, setLayout] = useState<LayoutRecord | null>(null);
  const [catalog, setCatalog] = useState<ModuleManifest[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [draggingModuleId, setDraggingModuleId] = useState<string | null>(null);
  const [customAspectWidth, setCustomAspectWidth] = useState("16");
  const [customAspectHeight, setCustomAspectHeight] = useState("9");
  const [previewHostSize, setPreviewHostSize] = useState({ width: 0, height: 0 });
  const [draftGridItems, setDraftGridItems] = useState<GridItem[] | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  const saveTimeoutRef = useRef<number | null>(null);
  const latestQueuedSaveSeqRef = useRef(0);
  const previewHostRef = useRef<HTMLDivElement | null>(null);
  const onLogout = useCallback(() => {
    clearAuthToken();
    navigate("/admin/login", { replace: true });
  }, [navigate]);

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
    setCatalog(
      moduleRegistry.listModules().map((moduleDefinition) => ({
        id: moduleDefinition.id,
        displayName: moduleDefinition.displayName,
        defaultSize: moduleDefinition.defaultSize,
      })),
    );
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

  const queueSave = useCallback(
    (nextLayout: LayoutRecord) => {
      if (!token) {
        return;
      }

      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }

      const saveSeq = latestQueuedSaveSeqRef.current + 1;
      latestQueuedSaveSeqRef.current = saveSeq;
      setSaveState("saving");
      saveTimeoutRef.current = window.setTimeout(async () => {
        saveTimeoutRef.current = null;
        try {
          const savedLayout = await updateLayout(token, nextLayout.id, {
            name: nextLayout.name,
            config: nextLayout.config,
          });

          if (saveSeq !== latestQueuedSaveSeqRef.current) {
            return;
          }

          setLayout(savedLayout);
          setError(null);
          setSaveState("saved");
        } catch (saveError) {
          if (saveSeq !== latestQueuedSaveSeqRef.current) {
            return;
          }

          const message =
            saveError instanceof Error ? saveError.message : "Failed to persist layout changes.";
          setError(message);
          setSaveState("error");

          if (
            typeof message === "string" &&
            message.toLowerCase().includes("unauthorized")
          ) {
            clearAuthToken();
            navigate("/admin/login", { replace: true });
          }
        }
      }, 500);
    },
    [navigate, token],
  );

  const availableModules = useMemo(
    () => catalog.filter((entry) => moduleRegistry.getModule(entry.id)),
    [catalog],
  );

  const selectedInstance = layout?.config.modules.find(
    (instance) => instance.id === selectedInstanceId,
  );

  const selectedModuleDefinition = selectedInstance
    ? moduleRegistry.getModule(selectedInstance.moduleId)
    : undefined;

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
      getAdaptiveGridMetrics(previewCanvasBaseSize.width, previewCanvasBaseSize.height),
    [previewCanvasBaseSize.height, previewCanvasBaseSize.width],
  );

  const previewGridCanvasSize = useMemo(
    () => ({
      width: Math.max(1, previewGridMetrics.cols * previewGridMetrics.rowHeight),
      height: Math.max(1, previewGridMetrics.rows * previewGridMetrics.rowHeight),
    }),
    [
      previewGridMetrics.cols,
      previewGridMetrics.rowHeight,
      previewGridMetrics.rows,
    ],
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

        queueSave(nextLayout);
        return nextLayout;
      });
    },
    [normalizeLayoutConfigToPreviewGrid, queueSave],
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

      return areGridItemsEqual(currentDraft, editorGridItems)
        ? currentDraft
        : editorGridItems;
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
    (moduleId: string) => {
      const moduleDefinition = moduleRegistry.getModule(moduleId);
      if (!moduleDefinition) {
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

  if (!layout) {
    return (
      <main className="flex min-h-screen items-center justify-center text-slate-200">
        Loading layout editor...
      </main>
    );
  }

  return (
    <main className="mx-auto flex h-screen w-full max-w-[1800px] flex-col overflow-hidden px-4 py-5">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3">
        <div className="flex items-center gap-3">
          <Link
            to="/admin/layouts"
            className="rounded border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:border-slate-400"
          >
            Back
          </Link>
          <input
            value={layout.name}
            onChange={(event) =>
              applyLayoutPatch((current) => ({ ...current, name: event.target.value }))
            }
            className="min-w-[260px] rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
          />
          <span className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-300">
            Version {layout.version}
          </span>
          <span className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-300">
            {saveState === "saving"
              ? "Saving..."
              : saveState === "saved"
                ? "Saved"
                : saveState === "error"
                  ? "Save failed"
                  : "Idle"}
          </span>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <AdminNavActions current="layouts" onLogout={onLogout} />
        </div>
      </header>

      {error ? (
        <p className="mb-4 rounded border border-rose-500/60 bg-rose-500/10 px-3 py-2 text-rose-100">
          {error}
        </p>
      ) : null}

      <section className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
        <aside className="flex min-h-0 flex-col rounded-xl border border-slate-700 bg-slate-900/80 p-4">
          <h2 className="font-display text-lg font-semibold text-slate-100">Module palette</h2>
          <p className="mt-1 text-xs text-slate-400">
            Drag modules into the grid, or tap Add.
          </p>

          <div className="mt-3 space-y-2 overflow-y-auto pr-1">
            {availableModules.map((moduleManifest) => (
              <div
                key={moduleManifest.id}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "copyMove";
                  event.dataTransfer.setData(
                    "application/x-hearth-module",
                    moduleManifest.id,
                  );
                  event.dataTransfer.setData("text/plain", moduleManifest.id);
                  setDraggingModuleId(moduleManifest.id);
                }}
                onDragEnd={() => setDraggingModuleId(null)}
                className="cursor-grab rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 hover:border-cyan-500"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{moduleManifest.displayName}</p>
                    <p className="text-xs text-slate-400">
                      Default size: {moduleManifest.defaultSize.w} x {moduleManifest.defaultSize.h}
                    </p>
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
                      addModuleFromPalette(moduleManifest.id);
                    }}
                    className="module-no-drag min-h-9 rounded border border-cyan-500/70 px-2.5 py-1 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/20"
                  >
                    Add
                  </button>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <div className="flex min-h-0 flex-col rounded-xl border border-slate-700 bg-slate-950/70 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
            <span>
              Fixed preview canvas: {previewCanvasBaseSize.width} x{" "}
              {previewCanvasBaseSize.height}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2">
                <span>Preview aspect</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={customAspectWidth}
                  onChange={(event) => setCustomAspectWidth(event.target.value)}
                  className="w-16 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100"
                  aria-label="Custom ratio width"
                />
                <span>x</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={customAspectHeight}
                  onChange={(event) => setCustomAspectHeight(event.target.value)}
                  className="w-16 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100"
                  aria-label="Custom ratio height"
                />
              </label>
              <span>
                Preview ratio: {previewRatioLabel} | Grid{" "}
                {previewGridMetrics.cols} x {previewGridMetrics.rows} (adaptive)
              </span>
            </div>
          </div>

          <div
            ref={previewHostRef}
            className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-slate-800 bg-slate-950/60 p-3"
          >
            {previewScale > 0 ? (
              <div
                className="overflow-hidden rounded-lg border border-slate-700/70 bg-slate-950"
                style={{
                  width: `${previewDisplaySize.width}px`,
                  height: `${previewDisplaySize.height}px`,
                }}
              >
                <div
                  style={{
                    width: `${previewGridCanvasSize.width}px`,
                    height: `${previewGridCanvasSize.height}px`,
                    transform: `scale(${previewScale})`,
                    transformOrigin: "top left",
                    backgroundImage:
                      "linear-gradient(to right, rgba(148, 163, 184, 0.16) 1px, transparent 1px), linear-gradient(to bottom, rgba(148, 163, 184, 0.16) 1px, transparent 1px)",
                    backgroundSize: `${previewGridMetrics.rowHeight}px ${previewGridMetrics.rowHeight}px`,
                  }}
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
                    isDroppable
                    onDropDragOver={() => {
                      const moduleId = draggingModuleId;

                      if (!moduleId) {
                        return false;
                      }

                      const moduleDefinition = moduleRegistry.getModule(moduleId);
                      if (!moduleDefinition) {
                        return false;
                      }

                      const dropWidth = clamp(
                        moduleDefinition.defaultSize.w,
                        1,
                        previewGridMetrics.cols,
                      );
                      const dropHeight = clamp(
                        moduleDefinition.defaultSize.h,
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

                      const moduleDefinition = moduleRegistry.getModule(moduleId);

                      if (!moduleDefinition) {
                        return;
                      }

                      applyLayoutPatch((current) => {
                        const created = addModuleToLayoutAtPosition(
                          {
                            ...current.config,
                            cols: previewGridMetrics.cols,
                            rows: previewGridMetrics.rows,
                            rowHeight: Math.max(
                              10,
                              Math.round(previewGridMetrics.rowHeight),
                            ),
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

                      setDraggingModuleId(null);
                    }}
                    onResize={(nextItems) => {
                      applyLiveGridItems(nextItems as GridItem[]);
                    }}
                    onLayoutChange={(nextItems) =>
                      applyLiveGridItems(nextItems as GridItem[])
                    }
                    onDragStop={(nextItems) => persistGridItems(nextItems as GridItem[])}
                    onResizeStop={(nextItems) => persistGridItems(nextItems as GridItem[])}
                  >
                    {layout.config.modules.map((instance) => {
                      const definition = moduleRegistry.getModule(instance.moduleId);

                      return (
                        <div
                          key={instance.id}
                          className={`h-full ${
                            selectedInstanceId === instance.id ? "ring-2 ring-cyan-400" : ""
                          }`}
                        >
                          <ModuleFrame
                            title={definition?.displayName ?? instance.moduleId}
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
                            {definition ? (
                              <definition.DashboardTile
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

        <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900/80 p-4">
          <h2 className="font-display text-lg font-semibold text-slate-100">Settings</h2>
          {!selectedInstance || !selectedModuleDefinition || !selectedModuleConfig ? (
            <p className="mt-2 text-sm text-slate-400">
              Select a tile to edit module settings.
            </p>
          ) : (
            <div className="mt-3 min-h-0 space-y-4 overflow-y-auto pr-1">
              <selectedModuleDefinition.SettingsPanel
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
            </div>
          )}
        </aside>
      </section>
    </main>
  );
};
