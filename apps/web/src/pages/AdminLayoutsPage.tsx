import {
  FormEvent,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  createLayout,
  deleteLayout,
  getLayouts,
  getPhotoCollections,
  getPhotoLibraryFolders,
  getScreenProfileLayouts,
  updatePhotoCollections,
  updateLayout,
  updateScreenProfileLayouts,
} from "../api/client";
import { logoutAdminSession } from "../auth/session";
import { getAuthToken } from "../auth/storage";
import { AdminNavActions } from "../components/admin/AdminNavActions";
import {
  AdminSection,
  AdminSectionHeader,
  ADMIN_BUTTON_DANGER_CLASS,
  ADMIN_BUTTON_PRIMARY_CLASS,
  ADMIN_BUTTON_SECONDARY_CLASS,
  ADMIN_INPUT_CLASS,
  ADMIN_PANEL_CLASS,
} from "../components/admin/AdminSection";
import type { LogicBranchTrigger } from "../components/admin/logicNodeRegistry";
import { PageShell } from "../components/PageShell";
import { buildDuplicateLayoutName } from "./layout-name-utils";
import { analyzeSetRuntimeHealth, type RuntimeHealthReport } from "./layout-set-runtime-health";
import {
  compileLayoutSetAuthoringToLogicGraph,
  getLayoutSetAuthoringValidationIssues,
  getLayoutSetLogicBranches,
  getDefaultLayoutSetAuthoring,
  getPrimaryPhotoRouterBlock,
  normalizeLayoutSetLogicEdgeState,
  normalizeLayoutSetAuthoring,
  normalizeLayoutSetLogicGraph,
  normalizeScreenProfileLayoutsConfig,
  photoCollectionsConfigSchema,
  screenProfileLayoutsSchema,
  setPrimaryPhotoRouterBlock,
  toAutoLayoutTargetsFromLogicGraph,
  DEFAULT_LAYOUT_LOGIC_PHOTO_ACTION_TYPE,
  type AutoLayoutTarget,
  type LayoutSetAuthoring,
  type PhotoCollectionsConfig,
  type LayoutRecord,
  type ScreenProfileLayouts,
} from "@hearth/shared";

const SetLogicEditor = lazy(async () => {
  const module = await import("../components/admin/SetLogicEditor");
  return { default: module.SetLogicEditor };
});

const GraphEditorLoading = () => (
  <div className="flex min-h-[22rem] items-center justify-center rounded-lg border border-slate-800 bg-slate-950/40 px-4 text-sm text-slate-400">
    Loading graph editor...
  </div>
);

const LAYOUT_PREVIEW_COLORS = ["#f6d8d1", "#e4ecdf", "#e3daf0", "#dbe8f1", "#f7e4b8"];

const LayoutPreview = ({ layout }: { layout: LayoutRecord }) => {
  const rows = Math.max(
    1,
    ...layout.config.items.map((item) => item.y + item.h),
    layout.config.rows ?? 1,
  );
  const cols = Math.max(1, layout.config.cols);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-stone-200 bg-[#f8f6f0]">
      {layout.config.items.map((item, index) => {
        const module = layout.config.modules.find((entry) => entry.id === item.i);
        return (
          <div
            key={item.i}
            className="absolute overflow-hidden rounded-[5px] border border-white/70 p-1 text-[7px] font-semibold leading-tight text-stone-700"
            style={{
              left: `${(item.x / cols) * 100}%`,
              top: `${(item.y / rows) * 100}%`,
              width: `${(item.w / cols) * 100}%`,
              height: `${(item.h / rows) * 100}%`,
              background: LAYOUT_PREVIEW_COLORS[index % LAYOUT_PREVIEW_COLORS.length],
            }}
          >
            {module?.moduleId.replaceAll("-", " ")}
          </div>
        );
      })}
    </div>
  );
};

const defaultProfileLayouts: ScreenProfileLayouts = screenProfileLayoutsSchema.parse({});
const defaultPhotoCollections: PhotoCollectionsConfig = photoCollectionsConfigSchema.parse({});
const DEFAULT_TARGET_CYCLE_SECONDS = 20;
const DEFAULT_PHOTO_ACTION_TYPE = DEFAULT_LAYOUT_LOGIC_PHOTO_ACTION_TYPE;
const LOGIC_BRANCH_ORDER = ["always", "portrait-photo", "landscape-photo"] as const;

const toSetIdFromName = (name: string): string => {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug.slice(0, 80) : "set";
};

const toUniqueSetId = (name: string, usedIds: Set<string>): string => {
  const baseId = toSetIdFromName(name);
  if (!usedIds.has(baseId)) {
    return baseId;
  }

  let suffix = 2;
  while (suffix < 1000) {
    const candidate = `${baseId}-${suffix}`.slice(0, 80);
    if (!usedIds.has(candidate)) {
      return candidate;
    }
    suffix += 1;
  }

  return `${baseId}-${Date.now().toString(36)}`.slice(0, 80);
};

const toCollectionIdFromName = (name: string): string => {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug.slice(0, 80) : "collection";
};

const toUniqueCollectionId = (name: string, usedIds: Set<string>): string => {
  const baseId = toCollectionIdFromName(name);
  if (!usedIds.has(baseId)) {
    return baseId;
  }

  let suffix = 2;
  while (suffix < 1000) {
    const candidate = `${baseId}-${suffix}`.slice(0, 80);
    if (!usedIds.has(candidate)) {
      return candidate;
    }
    suffix += 1;
  }

  return `${baseId}-${Date.now().toString(36)}`.slice(0, 80);
};

const normalizeCollectionName = (name: string): string => {
  const trimmed = name.trim().slice(0, 80);
  return trimmed.length > 0 ? trimmed : "Collection";
};

const toUniqueCollectionName = (input: {
  desiredName: string;
  existing: Array<{ id: string; name: string }>;
  excludeId?: string;
}): string => {
  const baseName = normalizeCollectionName(input.desiredName);
  const usedNames = new Set(
    input.existing
      .filter((entry) => entry.id !== input.excludeId)
      .map((entry) => entry.name.trim().toLowerCase()),
  );

  if (!usedNames.has(baseName.toLowerCase())) {
    return baseName;
  }

  let suffix = 2;
  while (suffix < 1000) {
    const suffixText = ` (${suffix})`;
    const prefixMaxLength = Math.max(1, 80 - suffixText.length);
    const candidate = `${baseName.slice(0, prefixMaxLength)}${suffixText}`;
    if (!usedNames.has(candidate.toLowerCase())) {
      return candidate;
    }
    suffix += 1;
  }

  return `${baseName.slice(0, 70)} (${Date.now().toString(36)})`.slice(0, 80);
};

const normalizeCollectionFolders = (folders: string[]): string[] => {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const folder of folders) {
    const trimmed = folder.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized.length > 0 ? normalized : ["."];
};

const getDefaultCollectionFolder = (availableFolders: string[]): string =>
  availableFolders[0] ?? ".";

const getNextCollectionFolderPath = (
  folders: string[],
  availableFolders: string[],
): string | null => {
  const used = new Set(
    folders.map((folder) => folder.trim()).filter((folder) => folder.length > 0),
  );

  for (const folder of availableFolders) {
    const candidate = folder.trim();
    if (!candidate) {
      continue;
    }
    if (!used.has(candidate)) {
      return candidate;
    }
  }

  return null;
};

const normalizePhotoLibraryFolders = (folders: string[]): string[] =>
  folders
    .map((folder) => folder.trim())
    .filter((folder, index, all) => folder.length > 0 && all.indexOf(folder) === index);

const areProfileLayoutsEqual = (left: ScreenProfileLayouts, right: ScreenProfileLayouts): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const unique = (values: Array<string | null | undefined>): string[] => {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    if (!value) {
      continue;
    }
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    output.push(value);
  }
  return output;
};

const normalizeProfileLayouts = (
  layouts: LayoutRecord[],
  input: ScreenProfileLayouts,
): ScreenProfileLayouts => {
  return normalizeScreenProfileLayoutsConfig({
    input,
    knownLayoutNames: layouts.map((layout) => layout.name),
    fallbackStaticLayoutName:
      layouts.find((layout) => layout.active)?.name ?? layouts[0]?.name ?? null,
    defaultPhotoActionType: DEFAULT_PHOTO_ACTION_TYPE,
  });
};

const getBranchTargets = (
  targets: AutoLayoutTarget[],
  trigger: LogicBranchTrigger,
): AutoLayoutTarget[] => targets.filter((target) => target.trigger === trigger);

const buildTargetsFromBranches = (branches: Record<LogicBranchTrigger, AutoLayoutTarget[]>) =>
  LOGIC_BRANCH_ORDER.flatMap((trigger) =>
    branches[trigger].map((target) => ({
      ...target,
      trigger,
    })),
  );

type ScreenFamilyLayoutConfig = ScreenProfileLayouts["families"][string];

const removeCollectionFromAuthoring = (
  authoring: LayoutSetAuthoring,
  collectionId: string,
): LayoutSetAuthoring => {
  const currentBlock = getPrimaryPhotoRouterBlock(authoring);

  return setPrimaryPhotoRouterBlock({
    authoring,
    block: {
      ...currentBlock,
      photoActionCollectionId:
        currentBlock.photoActionCollectionId === collectionId
          ? null
          : currentBlock.photoActionCollectionId,
      nodes: currentBlock.nodes.map((node) => {
        if (node.nodeType === "layout") {
          const nextActionParams = { ...(node.actionParams ?? {}) };
          if (nextActionParams.photoCollectionId === collectionId) {
            delete nextActionParams.photoCollectionId;
          }
          return {
            ...node,
            actionParams: nextActionParams,
          };
        }

        if (
          node.nodeType === "photo-orientation" &&
          node.photoActionCollectionId === collectionId
        ) {
          return {
            ...node,
            photoActionCollectionId: null,
          };
        }

        return node;
      }),
    },
  });
};

const buildSetConfigFromAuthoring = (input: {
  current: ScreenFamilyLayoutConfig;
  nextAuthoring: LayoutSetAuthoring;
  knownLayoutNames: Set<string>;
}): ScreenFamilyLayoutConfig => {
  const logicBlocks = normalizeLayoutSetAuthoring({
    authoring: input.nextAuthoring,
    knownLayoutNames: input.knownLayoutNames,
  });
  const nextGraph = normalizeLayoutSetLogicGraph({
    graph: compileLayoutSetAuthoringToLogicGraph(logicBlocks),
    knownLayoutNames: input.knownLayoutNames,
  });
  const nextTargets = toAutoLayoutTargetsFromLogicGraph(nextGraph);
  const nextBranches = getLayoutSetLogicBranches(nextGraph);
  const nextPortraitLayoutNames = unique(
    [...nextBranches.alwaysRules, ...nextBranches.portraitRules].map((target) => target.layoutName),
  );
  const nextLandscapeLayoutNames = unique(
    [...nextBranches.alwaysRules, ...nextBranches.landscapeRules].map(
      (target) => target.layoutName,
    ),
  );
  const photoRouter = getPrimaryPhotoRouterBlock(logicBlocks);

  return {
    ...input.current,
    staticLayoutName: nextTargets[0]?.layoutName ?? null,
    photoActionType: photoRouter.photoActionType,
    photoActionCollectionId: photoRouter.photoActionCollectionId ?? null,
    logicBlocks,
    logicGraph: nextGraph,
    logicNodePositions: {},
    logicEdgeOverrides: {},
    logicDisconnectedEdgeIds: [],
    autoLayoutTargets: nextTargets,
    portraitPhotoLayoutName: nextPortraitLayoutNames[0] ?? null,
    landscapePhotoLayoutName: nextLandscapeLayoutNames[0] ?? null,
    portraitPhotoLayoutNames: nextPortraitLayoutNames,
    landscapePhotoLayoutNames: nextLandscapeLayoutNames,
  };
};

type SetEdgeStatePayload = {
  nodePositions: Record<
    string,
    {
      x: number;
      y: number;
    }
  >;
  edgeOverrides: Record<
    string,
    {
      source: string;
      target: string;
      sourceHandle?: string | null;
      targetHandle?: string | null;
    }
  >;
  disconnectedEdgeIds: string[];
};

const serializeSetEdgeState = (input: SetEdgeStatePayload): string => {
  const sortedNodePositions = Object.fromEntries(
    Object.keys(input.nodePositions)
      .sort((left, right) => left.localeCompare(right))
      .map((nodeId) => {
        const position = input.nodePositions[nodeId];
        return [
          nodeId,
          {
            x: Number.isFinite(position.x) ? position.x : 0,
            y: Number.isFinite(position.y) ? position.y : 0,
          },
        ] as const;
      }),
  );

  const sortedEdgeOverrides = Object.fromEntries(
    Object.keys(input.edgeOverrides)
      .sort((left, right) => left.localeCompare(right))
      .map((edgeId) => {
        const override = input.edgeOverrides[edgeId];
        return [
          edgeId,
          {
            source: override.source,
            target: override.target,
            sourceHandle: override.sourceHandle ?? null,
            targetHandle: override.targetHandle ?? null,
          },
        ] as const;
      }),
  );

  return JSON.stringify({
    nodePositions: sortedNodePositions,
    edgeOverrides: sortedEdgeOverrides,
    disconnectedEdgeIds: [...input.disconnectedEdgeIds]
      .map((edgeId) => edgeId.trim())
      .filter((edgeId) => edgeId.length > 0)
      .sort((left, right) => left.localeCompare(right)),
  });
};

const normalizeSetNodePositions = (
  positions: SetEdgeStatePayload["nodePositions"],
): SetEdgeStatePayload["nodePositions"] =>
  Object.fromEntries(
    Object.entries(positions).flatMap(([nodeId, position]) => {
      if (!nodeId.trim()) {
        return [];
      }
      if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
        return [];
      }
      return [[nodeId, { x: position.x, y: position.y }] as const];
    }),
  );

export const AdminLayoutsPage = () => {
  const navigate = useNavigate();
  const token = getAuthToken();
  const [layouts, setLayouts] = useState<LayoutRecord[]>([]);
  const [newLayoutName, setNewLayoutName] = useState("Home layout");
  const [screenProfileLayouts, setScreenProfileLayouts] =
    useState<ScreenProfileLayouts>(defaultProfileLayouts);
  const [photoCollections, setPhotoCollections] =
    useState<PhotoCollectionsConfig>(defaultPhotoCollections);
  const [photoLibraryFolders, setPhotoLibraryFolders] = useState<string[]>([]);
  const screenProfileLayoutsRef = useRef<ScreenProfileLayouts>(defaultProfileLayouts);
  const photoCollectionsRef = useRef<PhotoCollectionsConfig>(defaultPhotoCollections);
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve());
  const persistRevisionRef = useRef(0);
  const persistCollectionsQueueRef = useRef<Promise<void>>(Promise.resolve());
  const persistCollectionsRevisionRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [refreshingPhotoFolders, setRefreshingPhotoFolders] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<"layouts" | "switching" | "photos">("layouts");
  const [creatingLayout, setCreatingLayout] = useState(false);

  useEffect(() => {
    screenProfileLayoutsRef.current = screenProfileLayouts;
  }, [screenProfileLayouts]);

  useEffect(() => {
    photoCollectionsRef.current = photoCollections;
  }, [photoCollections]);

  const loadLayouts = useCallback(async () => {
    if (!token) {
      navigate("/admin/login", { replace: true });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [layoutData, profileData, collectionsData, folderData] = await Promise.all([
        getLayouts(false, token),
        getScreenProfileLayouts(token),
        getPhotoCollections(token),
        getPhotoLibraryFolders(token).catch(() => ({ folders: [] })),
      ]);

      const normalizedProfileLayouts = normalizeProfileLayouts(layoutData, profileData);
      const normalizedLibraryFolders = normalizePhotoLibraryFolders(folderData.folders);
      const hasFamilyFolder = normalizedLibraryFolders.includes("family");
      const fallbackCollectionFolder = getDefaultCollectionFolder(normalizedLibraryFolders);
      const normalizedCollectionsDraft = photoCollectionsConfigSchema.parse({
        collections: collectionsData.collections.map((collection) => ({
          ...collection,
          name: collection.name.trim().slice(0, 80),
          folders: normalizeCollectionFolders(
            collection.folders.map((folder) => {
              const trimmed = folder.trim();
              if (trimmed === "family" && !hasFamilyFolder) {
                return fallbackCollectionFolder;
              }
              return trimmed;
            }),
          ),
        })),
      });
      const normalizedCollections =
        JSON.stringify(collectionsData) === JSON.stringify(normalizedCollectionsDraft)
          ? normalizedCollectionsDraft
          : photoCollectionsConfigSchema.parse(
              await updatePhotoCollections(token, normalizedCollectionsDraft),
            );
      if (!areProfileLayoutsEqual(profileData, normalizedProfileLayouts)) {
        const savedProfileLayouts = await updateScreenProfileLayouts(
          token,
          normalizedProfileLayouts,
        );
        const normalizedSaved = normalizeProfileLayouts(layoutData, savedProfileLayouts);
        setScreenProfileLayouts(normalizedSaved);
        screenProfileLayoutsRef.current = normalizedSaved;
      } else {
        setScreenProfileLayouts(normalizedProfileLayouts);
        screenProfileLayoutsRef.current = normalizedProfileLayouts;
      }

      setLayouts(layoutData);
      setPhotoCollections(normalizedCollections);
      photoCollectionsRef.current = normalizedCollections;
      setPhotoLibraryFolders(normalizedLibraryFolders);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [navigate, token]);

  useEffect(() => {
    void loadLayouts();
  }, [loadLayouts]);

  const onRefreshPhotoFolders = useCallback(async () => {
    if (!token) {
      navigate("/admin/login", { replace: true });
      return;
    }

    setRefreshingPhotoFolders(true);
    try {
      const folderData = await getPhotoLibraryFolders(token);
      setPhotoLibraryFolders(normalizePhotoLibraryFolders(folderData.folders));
      setError(null);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error ? refreshError.message : "Failed to refresh photo folders",
      );
    } finally {
      setRefreshingPhotoFolders(false);
    }
  }, [navigate, token]);

  const persistScreenRouting = useCallback(
    async (updater: (current: ScreenProfileLayouts) => ScreenProfileLayouts) => {
      if (!token) {
        return;
      }

      const nextDraft = updater(screenProfileLayoutsRef.current);
      const normalizedNext = normalizeProfileLayouts(layouts, nextDraft);
      screenProfileLayoutsRef.current = normalizedNext;
      setScreenProfileLayouts(normalizedNext);

      const revision = persistRevisionRef.current + 1;
      persistRevisionRef.current = revision;

      persistQueueRef.current = persistQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const updated = await updateScreenProfileLayouts(token, normalizedNext);
          if (revision !== persistRevisionRef.current) {
            return;
          }

          const normalizedUpdated = normalizeProfileLayouts(layouts, updated);
          screenProfileLayoutsRef.current = normalizedUpdated;
          setScreenProfileLayouts(normalizedUpdated);
        })
        .catch((persistError) => {
          setError(
            persistError instanceof Error
              ? persistError.message
              : "Failed to persist layout set changes",
          );
        });

      await persistQueueRef.current;
    },
    [layouts, token],
  );

  const persistPhotoCollections = useCallback(
    async (updater: (current: PhotoCollectionsConfig) => PhotoCollectionsConfig) => {
      if (!token) {
        return;
      }

      const nextDraft = updater(photoCollectionsRef.current);
      const normalizedNext = photoCollectionsConfigSchema.parse({
        collections: nextDraft.collections.map((collection) => ({
          ...collection,
          name: collection.name.trim().slice(0, 80),
          folders: normalizeCollectionFolders(collection.folders),
        })),
      });
      photoCollectionsRef.current = normalizedNext;
      setPhotoCollections(normalizedNext);

      const revision = persistCollectionsRevisionRef.current + 1;
      persistCollectionsRevisionRef.current = revision;

      persistCollectionsQueueRef.current = persistCollectionsQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const saved = await updatePhotoCollections(token, normalizedNext);
          if (revision !== persistCollectionsRevisionRef.current) {
            return;
          }

          const normalizedSaved = photoCollectionsConfigSchema.parse(saved);
          photoCollectionsRef.current = normalizedSaved;
          setPhotoCollections(normalizedSaved);
        })
        .catch((persistError) => {
          setError(
            persistError instanceof Error
              ? persistError.message
              : "Failed to persist photo collections",
          );
        });

      await persistCollectionsQueueRef.current;
    },
    [token],
  );

  const onCreateLayout = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) {
      return;
    }

    const trimmedName = newLayoutName.trim();
    if (!trimmedName) {
      return;
    }
    const hasDuplicateName = layouts.some(
      (layout) => layout.name.trim().toLowerCase() === trimmedName.toLowerCase(),
    );
    if (hasDuplicateName) {
      setError(`Layout "${trimmedName}" already exists. Use a unique name.`);
      return;
    }

    try {
      await createLayout(token, { name: trimmedName });
      setNewLayoutName(`Layout ${layouts.length + 1}`);
      await loadLayouts();
      setError(null);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create layout");
    }
  };

  const onRenameLayout = async (layout: LayoutRecord, name: string) => {
    if (!token || !name.trim()) {
      return;
    }

    try {
      await updateLayout(token, layout.id, { name: name.trim() });
      await loadLayouts();
      setError(null);
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : "Failed to rename layout");
    }
  };

  const onDeleteLayout = async (layout: LayoutRecord) => {
    if (!token) {
      return;
    }

    const confirmed = window.confirm(`Delete layout "${layout.name}"? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    try {
      await deleteLayout(token, layout.id);
      await loadLayouts();
      setError(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete layout");
    }
  };

  const onDuplicateLayout = async (layout: LayoutRecord) => {
    if (!token) {
      return;
    }

    const nextName = buildDuplicateLayoutName({
      sourceName: layout.name,
      existingNames: layouts.map((entry) => entry.name),
    });

    try {
      await createLayout(token, {
        name: nextName,
        config: layout.config,
      });
      await loadLayouts();
      setError(null);
    } catch (duplicateError) {
      setError(
        duplicateError instanceof Error ? duplicateError.message : "Failed to duplicate layout",
      );
    }
  };

  const onAddPhotoCollection = async () => {
    const nextIndex = photoCollectionsRef.current.collections.length + 1;
    const nextName = toUniqueCollectionName({
      desiredName: `Collection ${nextIndex}`,
      existing: photoCollectionsRef.current.collections,
    });
    const nextId = toUniqueCollectionId(
      nextName,
      new Set(photoCollectionsRef.current.collections.map((entry) => entry.id)),
    );

    try {
      await persistPhotoCollections((current) => ({
        collections: [
          ...current.collections,
          {
            id: nextId,
            name: nextName,
            folders: [getDefaultCollectionFolder(sortedPhotoLibraryFolders)],
          },
        ],
      }));
      setError(null);
    } catch (updateError) {
      setError(
        updateError instanceof Error ? updateError.message : "Failed to add photo collection",
      );
    }
  };

  const onRenamePhotoCollection = async (collectionId: string, nextNameRaw: string) => {
    const nextName = toUniqueCollectionName({
      desiredName: nextNameRaw,
      existing: photoCollectionsRef.current.collections,
      excludeId: collectionId,
    });

    try {
      await persistPhotoCollections((current) => ({
        collections: current.collections.map((collection) =>
          collection.id === collectionId
            ? {
                ...collection,
                name: nextName,
              }
            : collection,
        ),
      }));
      setError(null);
    } catch (updateError) {
      setError(
        updateError instanceof Error ? updateError.message : "Failed to rename photo collection",
      );
    }
  };

  const onUpdatePhotoCollectionFolders = async (collectionId: string, nextFolders: string[]) => {
    try {
      await persistPhotoCollections((current) => ({
        collections: current.collections.map((collection) =>
          collection.id === collectionId
            ? {
                ...collection,
                folders: nextFolders,
              }
            : collection,
        ),
      }));
      setError(null);
    } catch (updateError) {
      setError(
        updateError instanceof Error ? updateError.message : "Failed to update collection folders",
      );
    }
  };

  const onRemovePhotoCollection = async (collectionId: string) => {
    const collection = photoCollectionsRef.current.collections.find(
      (entry) => entry.id === collectionId,
    );
    if (!collection) {
      return;
    }

    const confirmed = window.confirm(`Remove photo collection "${collection.name}"?`);
    if (!confirmed) {
      return;
    }

    try {
      await persistPhotoCollections((current) => ({
        collections: current.collections.filter((entry) => entry.id !== collectionId),
      }));

      await persistScreenRouting((current) => {
        const nextFamilies = Object.fromEntries(
          Object.entries(current.families).map(([setId, setConfig]) => {
            const nextAuthoring = removeCollectionFromAuthoring(
              setConfig.logicBlocks,
              collectionId,
            );

            return [
              setId,
              buildSetConfigFromAuthoring({
                current: {
                  ...setConfig,
                  defaultPhotoCollectionId:
                    setConfig.defaultPhotoCollectionId === collectionId
                      ? null
                      : setConfig.defaultPhotoCollectionId,
                },
                nextAuthoring,
                knownLayoutNames: new Set(layouts.map((layout) => layout.name)),
              }),
            ];
          }),
        );

        return {
          ...current,
          families: nextFamilies,
        };
      });

      setError(null);
    } catch (updateError) {
      setError(
        updateError instanceof Error ? updateError.message : "Failed to remove photo collection",
      );
    }
  };

  const onUpdateSetAuthoring = async (family: string, nextAuthoringRaw: LayoutSetAuthoring) => {
    const knownLayoutNames = new Set(layouts.map((layout) => layout.name));
    const currentSetConfig = screenProfileLayoutsRef.current.families[family];
    if (!currentSetConfig) {
      return;
    }

    const validationIssue = getLayoutSetAuthoringValidationIssues(nextAuthoringRaw)[0] ?? null;
    if (validationIssue) {
      const message = `Set logic error: ${validationIssue.message}`;
      setError(message);
      throw new Error(message);
    }

    let nextConfig: ScreenFamilyLayoutConfig;
    try {
      nextConfig = buildSetConfigFromAuthoring({
        current: currentSetConfig,
        nextAuthoring: nextAuthoringRaw,
        knownLayoutNames,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to build set routing";
      setError(message);
      throw new Error(message);
    }
    const runtimeHealth = analyzeSetRuntimeHealth({
      graph: nextConfig.logicGraph,
      knownLayoutNames,
    });
    const blockingIssue = runtimeHealth.issues.find((issue) => issue.severity === "error");
    if (blockingIssue) {
      const message = `Set logic error: ${blockingIssue.message}`;
      setError(message);
      throw new Error(message);
    }

    try {
      await persistScreenRouting((current) => {
        const familyTargets = current.families[family];
        if (!familyTargets) {
          return current;
        }

        return {
          ...current,
          families: {
            ...current.families,
            [family]: nextConfig,
          },
        };
      });
      setError(null);
    } catch (updateError) {
      const message =
        updateError instanceof Error ? updateError.message : "Failed to update set routing";
      setError(message);
      throw new Error(message);
    }
  };

  const onRenameSet = async (setId: string, nextNameRaw: string) => {
    const nextName = nextNameRaw.trim();
    if (!nextName) {
      return;
    }

    try {
      await persistScreenRouting((current) => {
        const currentSet = current.families[setId];
        if (!currentSet || currentSet.name === nextName) {
          return current;
        }

        return {
          ...current,
          families: {
            ...current.families,
            [setId]: {
              ...currentSet,
              name: nextName,
            },
          },
        };
      });
      setError(null);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to rename set");
    }
  };

  const onAddSet = async () => {
    const usedIds = new Set(Object.keys(screenProfileLayoutsRef.current.families));
    const nextIndex = Object.keys(screenProfileLayoutsRef.current.families).length + 1;
    const nextName = `Layout set ${nextIndex}`;
    const nextId = toUniqueSetId(nextName, usedIds);
    const fallbackLayoutName = layoutOptions[0]?.name ?? null;
    const fallbackAuthoring = getDefaultLayoutSetAuthoring({
      fallbackLayoutName,
      photoActionType: DEFAULT_PHOTO_ACTION_TYPE,
      photoActionCollectionId: null,
    });

    try {
      await persistScreenRouting((current) => ({
        ...current,
        families: {
          ...current.families,
          [nextId]: buildSetConfigFromAuthoring({
            current: {
              name: nextName,
              staticLayoutName: fallbackLayoutName,
              defaultPhotoCollectionId: null,
              photoActionCollectionId: null,
              photoActionType: DEFAULT_PHOTO_ACTION_TYPE,
              logicBlocks: fallbackAuthoring,
              logicGraph: compileLayoutSetAuthoringToLogicGraph(fallbackAuthoring),
              logicNodePositions: {},
              logicEdgeOverrides: {},
              logicDisconnectedEdgeIds: [],
              autoLayoutTargets: [],
              portraitPhotoLayoutName: fallbackLayoutName,
              landscapePhotoLayoutName: fallbackLayoutName,
              portraitPhotoLayoutNames: fallbackLayoutName ? [fallbackLayoutName] : [],
              landscapePhotoLayoutNames: fallbackLayoutName ? [fallbackLayoutName] : [],
            },
            nextAuthoring: fallbackAuthoring,
            knownLayoutNames: new Set(layouts.map((layout) => layout.name)),
          }),
        },
      }));
      setError(null);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to add set");
    }
  };

  const onRemoveSet = async (setId: string) => {
    const setIds = Object.keys(screenProfileLayoutsRef.current.families);
    if (setIds.length <= 1) {
      return;
    }

    const setName = screenProfileLayoutsRef.current.families[setId]?.name ?? setId;
    const confirmed = window.confirm(`Remove set "${setName}"?`);
    if (!confirmed) {
      return;
    }

    try {
      await persistScreenRouting((current) => {
        const nextFamilies = { ...current.families };
        delete nextFamilies[setId];
        return {
          ...current,
          families: nextFamilies,
        };
      });
      setError(null);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to remove set");
    }
  };

  const onLogout = () => {
    logoutAdminSession();
  };

  const sortedLayouts = useMemo(
    () =>
      [...layouts].sort((left, right) =>
        left.name.localeCompare(right.name, undefined, {
          sensitivity: "base",
          numeric: true,
        }),
      ),
    [layouts],
  );

  const layoutOptions = useMemo(
    () => sortedLayouts.map((layout) => ({ id: layout.id, name: layout.name })),
    [sortedLayouts],
  );

  const sortedPhotoCollections = useMemo(
    () =>
      [...photoCollections.collections].sort((left, right) =>
        left.name.localeCompare(right.name, undefined, {
          sensitivity: "base",
          numeric: true,
        }),
      ),
    [photoCollections.collections],
  );

  const sortedPhotoLibraryFolders = useMemo(
    () =>
      [...photoLibraryFolders].sort((left, right) =>
        left.localeCompare(right, undefined, {
          sensitivity: "base",
          numeric: true,
        }),
      ),
    [photoLibraryFolders],
  );

  const photoCollectionOptions = useMemo(
    () =>
      sortedPhotoCollections.map((collection) => ({
        id: collection.id,
        name: collection.name,
      })),
    [sortedPhotoCollections],
  );

  const setEntries = useMemo(
    () =>
      Object.entries(screenProfileLayouts.families).sort((left, right) =>
        left[1].name.localeCompare(right[1].name, undefined, {
          sensitivity: "base",
          numeric: true,
        }),
      ),
    [screenProfileLayouts.families],
  );

  const knownLayoutNames = useMemo(
    () => new Set(layoutOptions.map((layout) => layout.name)),
    [layoutOptions],
  );

  const runtimeHealthBySetId = useMemo(
    (): Record<string, RuntimeHealthReport> =>
      Object.fromEntries(
        setEntries.map(([setId, setConfig]) => [
          setId,
          analyzeSetRuntimeHealth({
            graph: setConfig.logicGraph,
            knownLayoutNames,
            edgeOverrides: setConfig.logicEdgeOverrides,
            disconnectedEdgeIds: setConfig.logicDisconnectedEdgeIds,
          }),
        ]),
      ),
    [knownLayoutNames, setEntries],
  );

  return (
    <PageShell
      title="Layouts"
      subtitle="Design what your family sees throughout the day."
      rightActions={<AdminNavActions current="layouts" onLogout={onLogout} />}
    >
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-stone-200">
        <div className="flex gap-7" role="tablist" aria-label="Layout workspaces">
          {(["layouts", "switching", "photos"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={workspace === tab}
              onClick={() => setWorkspace(tab)}
              className={`border-b-2 px-0.5 pb-3 text-sm font-semibold capitalize transition ${
                workspace === tab
                  ? "border-teal-700 text-teal-800"
                  : "border-transparent text-stone-500 hover:text-stone-800"
              }`}
            >
              {tab === "switching"
                ? "Automatic switching"
                : tab === "photos"
                  ? "Photo sources"
                  : "Your layouts"}
            </button>
          ))}
        </div>
        {workspace === "layouts" ? (
          <button
            type="button"
            className={`${ADMIN_BUTTON_PRIMARY_CLASS} mb-2`}
            onClick={() => setCreatingLayout(true)}
          >
            + New layout
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-800">
          {error}
        </p>
      ) : null}
      {loading ? <p className="text-stone-600">Loading your layouts…</p> : null}

      {workspace === "layouts" ? (
        <section>
          {creatingLayout ? (
            <form
              className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-stone-200 bg-white p-5"
              onSubmit={(event) => {
                void onCreateLayout(event);
                setCreatingLayout(false);
              }}
            >
              <label className="flex min-w-[260px] flex-1 flex-col gap-2 text-sm font-medium text-stone-700">
                <span>Layout name</span>
                <input
                  value={newLayoutName}
                  onChange={(event) => setNewLayoutName(event.target.value)}
                  className={ADMIN_INPUT_CLASS}
                  autoFocus
                  required
                />
              </label>
              <button
                type="button"
                className={ADMIN_BUTTON_SECONDARY_CLASS}
                onClick={() => setCreatingLayout(false)}
              >
                Cancel
              </button>
              <button type="submit" className={ADMIN_BUTTON_PRIMARY_CLASS}>
                Create layout
              </button>
            </form>
          ) : null}

          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
            {sortedLayouts.map((layout, index) => (
              <article
                key={layout.id}
                className="grid gap-5 border-b border-stone-200 p-5 last:border-b-0 md:grid-cols-[minmax(260px,440px)_1fr_auto] md:items-center"
              >
                <button
                  type="button"
                  onClick={() => navigate(`/admin/layouts/${layout.id}`)}
                  className="text-left transition hover:opacity-90"
                >
                  <LayoutPreview layout={layout} />
                </button>
                <div className="min-w-0">
                  <input
                    defaultValue={layout.name}
                    aria-label={`Layout name: ${layout.name}`}
                    className="w-full border-0 bg-transparent p-0 text-xl font-semibold text-stone-900 outline-none focus:text-teal-800"
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        event.currentTarget.blur();
                      }
                    }}
                    onBlur={(event) => {
                      if (event.target.value !== layout.name)
                        void onRenameLayout(layout, event.target.value);
                    }}
                  />
                  <p className="mt-2 text-sm text-stone-500">
                    {layout.config.cols}:{layout.config.rows ?? "auto"} grid ·{" "}
                    {layout.config.modules.length} modules
                  </p>
                  {index === 0 ? (
                    <p className="mt-3 text-sm italic text-stone-500">Default fallback</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2 md:justify-end">
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/layouts/${layout.id}`)}
                    className={ADMIN_BUTTON_PRIMARY_CLASS}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDuplicateLayout(layout)}
                    className={ADMIN_BUTTON_SECONDARY_CLASS}
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDeleteLayout(layout)}
                    className={ADMIN_BUTTON_DANGER_CLASS}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {workspace === "photos" ? (
        <AdminSection>
          <AdminSectionHeader
            title="Photo sources"
            description="Group folders from your main photo library so layouts and switching rules can reuse them."
            actions={
              <>
                <button
                  type="button"
                  onClick={() => void onRefreshPhotoFolders()}
                  disabled={refreshingPhotoFolders}
                  className={ADMIN_BUTTON_SECONDARY_CLASS}
                >
                  {refreshingPhotoFolders ? "Refreshing…" : "Refresh folders"}
                </button>
                <button
                  type="button"
                  onClick={() => void onAddPhotoCollection()}
                  className={ADMIN_BUTTON_PRIMARY_CLASS}
                >
                  Add source
                </button>
              </>
            }
          />
          {sortedPhotoLibraryFolders.length === 0 ? (
            <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              No folders were found under the photo library yet.
            </p>
          ) : null}
          <div className="mt-5 grid gap-3">
            {photoCollectionOptions.length === 0 ? (
              <p className={ADMIN_PANEL_CLASS}>No photo sources yet.</p>
            ) : null}
            {sortedPhotoCollections.map((collection) => (
              <article key={collection.id} className={ADMIN_PANEL_CLASS}>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    defaultValue={collection.name}
                    className={`${ADMIN_INPUT_CLASS} min-w-[220px] flex-1 text-base font-semibold`}
                    onBlur={(event) => {
                      const resolvedName = toUniqueCollectionName({
                        desiredName: event.target.value,
                        existing: photoCollectionsRef.current.collections,
                        excludeId: collection.id,
                      });
                      event.target.value = resolvedName;
                      void onRenamePhotoCollection(collection.id, resolvedName);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => void onRemovePhotoCollection(collection.id)}
                    className={ADMIN_BUTTON_DANGER_CLASS}
                  >
                    Remove source
                  </button>
                </div>
                <div className="mt-3 space-y-2">
                  {collection.folders.map((folder, folderIndex) => (
                    <div
                      key={`${collection.id}-folder-${folderIndex}`}
                      className="flex flex-wrap gap-2"
                    >
                      <select
                        value={folder}
                        className={`${ADMIN_INPUT_CLASS} h-11 min-w-[220px] flex-1`}
                        onChange={(event) => {
                          const nextFolders = [...collection.folders];
                          nextFolders[folderIndex] = event.target.value;
                          void onUpdatePhotoCollectionFolders(collection.id, nextFolders);
                        }}
                      >
                        {[
                          ...sortedPhotoLibraryFolders,
                          ...(sortedPhotoLibraryFolders.includes(folder) ? [] : [folder]),
                        ].map((folderPath) => (
                          <option key={folderPath} value={folderPath}>
                            {folderPath}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() =>
                          void onUpdatePhotoCollectionFolders(
                            collection.id,
                            collection.folders.filter((_entry, index) => index !== folderIndex),
                          )
                        }
                        className={ADMIN_BUTTON_DANGER_CLASS}
                        disabled={collection.folders.length <= 1}
                      >
                        Remove folder
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className={`${ADMIN_BUTTON_SECONDARY_CLASS} mt-3`}
                  onClick={() => {
                    const nextFolder = getNextCollectionFolderPath(
                      collection.folders,
                      sortedPhotoLibraryFolders,
                    );
                    if (nextFolder)
                      void onUpdatePhotoCollectionFolders(collection.id, [
                        ...collection.folders,
                        nextFolder,
                      ]);
                  }}
                  disabled={
                    getNextCollectionFolderPath(collection.folders, sortedPhotoLibraryFolders) ===
                    null
                  }
                >
                  Add folder
                </button>
              </article>
            ))}
          </div>
        </AdminSection>
      ) : null}

      {workspace === "switching" ? (
        <section className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-stone-200 bg-white p-5">
            <div>
              <h2 className="text-xl font-semibold text-stone-900">Automatic switching</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-600">
                Choose which layout appears when the photo orientation, time, or household context
                changes. The graph remains available for advanced rules.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void onAddSet()}
              className={ADMIN_BUTTON_PRIMARY_CLASS}
            >
              Add rule set
            </button>
          </div>
          {setEntries.map(([setId, setConfig]) => {
            const runtimeHealth = runtimeHealthBySetId[setId];
            const portrait =
              setConfig.portraitPhotoLayoutNames[0] ??
              setConfig.portraitPhotoLayoutName ??
              "fallback layout";
            const landscape =
              setConfig.landscapePhotoLayoutNames[0] ??
              setConfig.landscapePhotoLayoutName ??
              "fallback layout";
            return (
              <article
                key={setId}
                className="overflow-hidden rounded-2xl border border-stone-200 bg-white"
              >
                <div className="flex flex-wrap items-center gap-4 border-b border-stone-200 p-5">
                  <input
                    defaultValue={setConfig.name}
                    className="min-w-[220px] flex-1 border-0 bg-transparent p-0 text-xl font-semibold text-stone-900 outline-none focus:text-teal-800"
                    onBlur={(event) => void onRenameSet(setId, event.target.value)}
                  />
                  <button
                    type="button"
                    disabled={setEntries.length <= 1}
                    className={ADMIN_BUTTON_DANGER_CLASS}
                    onClick={() => void onRemoveSet(setId)}
                  >
                    Remove set
                  </button>
                </div>
                <div className="grid gap-4 bg-[#fbfaf7] px-5 py-4 text-sm text-stone-700 md:grid-cols-3">
                  <p>
                    <strong className="block text-stone-900">Portrait photo</strong>
                    {portrait}
                  </p>
                  <p>
                    <strong className="block text-stone-900">Landscape photo</strong>
                    {landscape}
                  </p>
                  <p>
                    <strong className="block text-stone-900">Runtime</strong>
                    {runtimeHealth.status === "ok"
                      ? "Ready"
                      : `${runtimeHealth.issues.length} items need attention`}
                  </p>
                </div>
                <details className="group">
                  <summary className="cursor-pointer list-none border-t border-stone-200 px-5 py-4 font-semibold text-teal-800">
                    Advanced rule editor{" "}
                    <span className="ml-1 text-stone-400 group-open:hidden">+</span>
                    <span className="ml-1 hidden text-stone-400 group-open:inline">−</span>
                  </summary>
                  <div className="border-t border-stone-200 p-4">
                    <Suspense fallback={<GraphEditorLoading />}>
                      <SetLogicEditor
                        draftStorageKey={`set-logic:${setId}`}
                        authoring={setConfig.logicBlocks}
                        layoutOptions={layoutOptions}
                        photoCollectionOptions={photoCollectionOptions}
                        runtimeHealth={runtimeHealth}
                        onChange={(nextAuthoring) =>
                          void onUpdateSetAuthoring(setId, nextAuthoring)
                        }
                      />
                    </Suspense>
                  </div>
                </details>
              </article>
            );
          })}
        </section>
      ) : null}
    </PageShell>
  );
};
