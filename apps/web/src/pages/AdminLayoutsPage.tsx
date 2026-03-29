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
      setError(`Set logic error: ${validationIssue.message}`);
      return;
    }

    let nextConfig: ScreenFamilyLayoutConfig;
    try {
      nextConfig = buildSetConfigFromAuthoring({
        current: currentSetConfig,
        nextAuthoring: nextAuthoringRaw,
        knownLayoutNames,
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to build set routing");
      return;
    }
    const runtimeHealth = analyzeSetRuntimeHealth({
      graph: nextConfig.logicGraph,
      knownLayoutNames,
    });
    const blockingIssue = runtimeHealth.issues.find((issue) => issue.severity === "error");
    if (blockingIssue) {
      setError(`Set logic error: ${blockingIssue.message}`);
      return;
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
      setError(updateError instanceof Error ? updateError.message : "Failed to update set routing");
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
      subtitle="Create and manage dashboard layouts."
      rightActions={<AdminNavActions current="layouts" onLogout={onLogout} />}
    >
      <section className="mb-6 rounded-xl border border-slate-700 bg-slate-900/80 p-4">
        <form className="flex flex-wrap items-end gap-3" onSubmit={onCreateLayout}>
          <label className="flex min-w-[260px] flex-1 flex-col gap-2 text-sm text-slate-300">
            <span>New layout name</span>
            <input
              value={newLayoutName}
              onChange={(event) => setNewLayoutName(event.target.value)}
              className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
              required
            />
          </label>
          <button
            type="submit"
            className="h-10 rounded bg-cyan-500 px-4 text-sm font-semibold text-slate-950 hover:bg-cyan-400"
          >
            Create layout
          </button>
        </form>
      </section>

      {loading ? <p className="text-slate-300">Loading layouts...</p> : null}
      {error ? (
        <p className="rounded border border-rose-600/70 bg-rose-500/10 px-3 py-2 text-rose-200">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4">
        {sortedLayouts.map((layout) => (
          <article
            key={layout.id}
            className="rounded-xl border border-slate-700 bg-slate-900/70 p-4"
          >
            <div className="flex flex-wrap items-center gap-3">
              <input
                defaultValue={layout.name}
                className="min-w-[220px] flex-1 rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
                onKeyDown={(event) => {
                  if (event.key !== "Enter") {
                    return;
                  }
                  event.preventDefault();
                  event.currentTarget.blur();
                }}
                onBlur={(event) => {
                  if (event.target.value !== layout.name) {
                    void onRenameLayout(layout, event.target.value);
                  }
                }}
              />
              <span className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-300">
                v{layout.version}
              </span>
              <button
                type="button"
                onClick={() => navigate(`/admin/layouts/${layout.id}`)}
                className="h-10 rounded border border-slate-500 px-3 text-sm font-semibold text-slate-100 hover:border-slate-300"
              >
                Edit layout
              </button>
              <button
                type="button"
                onClick={() => void onDuplicateLayout(layout)}
                className="h-10 rounded border border-cyan-500/70 px-3 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/20"
              >
                Duplicate
              </button>
              <button
                type="button"
                onClick={() => void onDeleteLayout(layout)}
                className="h-10 rounded border border-rose-400 px-3 text-sm font-semibold text-rose-200 hover:bg-rose-500/20"
              >
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>

      <section className="mt-6 rounded-xl border border-slate-700 bg-slate-900/80 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-100">Photo Collections</h2>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void onRefreshPhotoFolders()}
              disabled={refreshingPhotoFolders}
              className="h-10 rounded border border-slate-500/70 bg-slate-800/70 px-3 text-sm font-semibold text-slate-100 hover:bg-slate-700/70 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {refreshingPhotoFolders ? "Refreshing..." : "Refresh folders"}
            </button>
            <button
              type="button"
              onClick={() => void onAddPhotoCollection()}
              className="h-10 rounded border border-cyan-500/60 bg-cyan-500/10 px-3 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/20"
            >
              Add collection
            </button>
          </div>
        </div>
        <p className="mt-1 text-sm text-slate-300">
          <span className="block">
            Collections are built from subfolders in your main photos library. Add one or more
            folders to each collection.
          </span>
          <span className="block">
            If no collection is selected, the default /photos library root is used.
          </span>
        </p>
        {sortedPhotoLibraryFolders.length === 0 ? (
          <p className="mt-1 text-xs text-amber-200/90">
            No folders were found under the photos library yet.
          </p>
        ) : null}

        <div className="mt-4 grid gap-3">
          {photoCollectionOptions.length === 0 ? (
            <p className="rounded border border-slate-700 bg-slate-950/60 px-3 py-3 text-sm text-slate-300">
              No collections yet. Add one to reuse across sets and layouts.
            </p>
          ) : null}
          {sortedPhotoCollections.map((collection) => (
            <article
              key={collection.id}
              className="rounded-lg border border-slate-700 bg-slate-950/60 p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <input
                  defaultValue={collection.name}
                  className="h-10 min-w-[220px] flex-1 rounded border border-slate-700 bg-slate-800 px-3 text-base font-semibold text-slate-100 outline-none focus:border-cyan-500"
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
                  className="h-10 rounded border border-rose-400/70 px-3 text-sm font-semibold text-rose-100 hover:bg-rose-500/20"
                >
                  Remove
                </button>
              </div>

              <div className="mt-3 space-y-2">
                {collection.folders.map((folder, folderIndex) => (
                  <div key={`${collection.id}-folder-${folderIndex}`} className="flex gap-2">
                    <select
                      value={folder}
                      className="h-10 flex-1 rounded border border-slate-700 bg-slate-800 px-3 text-slate-100 outline-none focus:border-cyan-500"
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
                      onClick={() => {
                        const nextFolders = collection.folders.filter(
                          (_entry, index) => index !== folderIndex,
                        );
                        void onUpdatePhotoCollectionFolders(collection.id, nextFolders);
                      }}
                      className="h-10 rounded border border-rose-400/60 px-3 text-xs font-semibold text-rose-100 hover:bg-rose-500/20"
                      disabled={collection.folders.length <= 1}
                    >
                      Remove folder
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                className="mt-2 h-10 rounded border border-cyan-500/50 px-3 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/20"
                onClick={() => {
                  const nextFolder = getNextCollectionFolderPath(
                    collection.folders,
                    sortedPhotoLibraryFolders,
                  );
                  if (!nextFolder) {
                    return;
                  }
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
      </section>

      <section className="mt-6 rounded-xl border border-slate-700 bg-slate-900/80 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-100">Layout Sets</h2>
          <button
            type="button"
            onClick={() => void onAddSet()}
            className="h-10 rounded border border-cyan-500/60 bg-cyan-500/10 px-3 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/20"
          >
            Add set
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-300">
          <span className="block">Build each set as an action graph.</span>
          <span className="block">
            Start with a Photo Orientation node: choose a photo source, define portrait and
            landscape conditions, drag action and layout nodes into the top-down canvas, wire the
            paths, and the runtime compiles that into the execution graph automatically.
          </span>
        </p>

        <div className="mt-4 grid gap-3">
          {setEntries.map(([setId, setConfig]) => {
            const runtimeHealth = runtimeHealthBySetId[setId];

            return (
              <article
                key={setId}
                className="rounded-lg border border-slate-700 bg-slate-950/60 p-3"
              >
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <input
                    defaultValue={setConfig.name}
                    className="h-10 min-w-[220px] flex-1 rounded border border-slate-700 bg-slate-800 px-3 text-base font-semibold text-slate-100 outline-none focus:border-cyan-500"
                    onBlur={(event) => {
                      void onRenameSet(setId, event.target.value);
                    }}
                  />
                  <button
                    type="button"
                    disabled={setEntries.length <= 1}
                    className="h-10 rounded border border-rose-400/70 px-4 text-sm font-semibold text-rose-100 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => {
                      void onRemoveSet(setId);
                    }}
                  >
                    Remove set
                  </button>
                </div>

                <Suspense fallback={<GraphEditorLoading />}>
                  <SetLogicEditor
                    authoring={setConfig.logicBlocks}
                    layoutOptions={layoutOptions}
                    photoCollectionOptions={photoCollectionOptions}
                    runtimeHealth={runtimeHealth}
                    onChange={(nextAuthoring) => {
                      void onUpdateSetAuthoring(setId, nextAuthoring);
                    }}
                  />
                </Suspense>
              </article>
            );
          })}
        </div>
      </section>
    </PageShell>
  );
};
