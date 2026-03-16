import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import {
  BaseEdge,
  Background,
  ConnectionLineType,
  Handle,
  Panel,
  Position,
  ReactFlow,
  applyEdgeChanges,
  applyNodeChanges,
  getBezierPath,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
  type ReactFlowInstance,
} from "@xyflow/react";
import {
  DEFAULT_LANDSCAPE_LAYOUT_LOGIC_CONDITION_TYPE,
  LOCAL_WARNING_CANVAS_ACTION_TYPE,
  LOCAL_WARNING_CONDITION_TYPE,
  DEFAULT_PORTRAIT_LAYOUT_LOGIC_CONDITION_TYPE,
  PHOTO_COLLECTION_ACTION_PARAM_KEY,
  getPrimaryPhotoRouterBlock,
  setPrimaryPhotoRouterBlock,
  weatherLocationSearchResponseSchema,
  type LayoutSetAuthoring,
  type PhotoRouterBlock,
  type PhotoRouterConnection,
  type PhotoRouterGraphNode,
  type PhotoRouterLayoutNode,
  type PhotoRouterPhotoOrientationNode,
} from "@hearth/shared";
import type { RuntimeHealthReport } from "../../pages/layout-set-runtime-health";
import {
  LOGIC_ACTION_TYPES,
  LOGIC_CONDITION_TYPES,
  getActionTypeById,
  getCanvasActionTypeById,
  getConditionTypeById,
  getDefaultActionParams,
  getDefaultCanvasActionTypeId,
  getDefaultConditionTypeForTrigger,
  parseActionParamsByType,
  parseConditionParamsByType,
  type LogicParamFieldDefinition,
  type LogicParams,
} from "./logicNodeRegistry";

interface LayoutOption {
  id: number;
  name: string;
}

interface PhotoCollectionOption {
  id: string;
  name: string;
}

interface PhotoRouterBlockEditorProps {
  authoring: LayoutSetAuthoring;
  layoutOptions: LayoutOption[];
  photoCollectionOptions: PhotoCollectionOption[];
  runtimeHealth?: RuntimeHealthReport;
  onChange: (nextAuthoring: LayoutSetAuthoring) => void;
}

type ConditionalTrigger = "portrait-photo";
type BranchKey = "fallback" | "portrait";
type ActionNodeKind = "photo" | "warning";
type StepNodeType = Node<LayoutNodeData, "layoutNode">;
type RouterNodeType = Node<RouterNodeData, "routerNode">;
type TerminalNodeType = Node<TerminalNodeData, "terminalNode">;

interface RouterNodeData extends Record<string, unknown> {
  title: string;
  kindLabel: string;
  actionSummary: string;
  sourceLabel: string | null;
  onRemove?: () => void;
  routes: Array<{
    key: BranchKey;
    label: string;
    count: number;
    enabled: boolean;
    connectable?: boolean;
  }>;
}

interface LayoutNodeData extends Record<string, unknown> {
  title: string;
  subtitle: string;
  routeLabel: string;
  onRemove?: () => void;
}

interface TerminalNodeData extends Record<string, unknown> {
  title: string;
  tone: "start" | "end";
}

const GRAPH_NODE_DRAG_TYPE = "application/hearth-graph-node";
const START_NODE_ID = "__start__";
const END_NODE_ID = "__end__";
const ROUTER_NODE_WIDTH = 360;
const ROUTER_NODE_HEIGHT = 200;
const LAYOUT_NODE_WIDTH = 260;
const LAYOUT_NODE_HEIGHT = 92;
const TERMINAL_NODE_SIZE = 96;
const START_NODE_GAP = 128;
const END_NODE_GAP = 168;
const DEFAULT_ROUTER_POSITION = { x: 420, y: 48 };
const DEFAULT_DETACHED_ORIGIN = { x: 96, y: 980 };
const DEFAULT_DETACHED_X_GAP = 332;
const DEFAULT_DETACHED_Y_GAP = 168;
const ROUTER_ROUTE_ORDER: BranchKey[] = ["portrait", "fallback"];
const EDGE_DASH_PATTERN = "8 12";

const BRANCH_META: Record<
  BranchKey,
  {
    color: string;
    bgClassName: string;
    borderClassName: string;
  }
> = {
  portrait: {
    color: "#22d3ee",
    bgClassName: "bg-cyan-500/10 text-cyan-100",
    borderClassName: "border-cyan-400/50",
  },
  fallback: {
    color: "#f59e0b",
    bgClassName: "bg-amber-500/10 text-amber-100",
    borderClassName: "border-amber-400/50",
  },
};

const getConditionBranchCopy = (conditionType: string | null | undefined) => {
  const normalizedConditionType = conditionType?.trim() ?? "";

  if (normalizedConditionType === DEFAULT_LANDSCAPE_LAYOUT_LOGIC_CONDITION_TYPE) {
    return {
      title: "Landscape photo",
      matchedLabel: "Landscape",
      fallbackLabel: "Not Landscape",
    };
  }

  if (normalizedConditionType === DEFAULT_PORTRAIT_LAYOUT_LOGIC_CONDITION_TYPE) {
    return {
      title: "Portrait photo",
      matchedLabel: "Portrait",
      fallbackLabel: "Not Portrait",
    };
  }

  if (normalizedConditionType === LOCAL_WARNING_CONDITION_TYPE) {
    return {
      title: "Warning check",
      matchedLabel: "Warning Active",
      fallbackLabel: "No Warning",
    };
  }

  return {
    title: "Condition branch",
    matchedLabel: "Matches",
    fallbackLabel: "Otherwise",
  };
};

const clampCycleSeconds = (value: number): number =>
  Math.max(3, Math.min(3600, Math.round(value)));

const roundPosition = (value: number): number => Math.round(value);

const toLayoutNodeSubtitle = (input: {
  actionSummary: string;
  layoutName: string;
  cycleSeconds: number;
}): string => {
  const trimmedSummary = input.actionSummary.trim();
  const trimmedLayoutName = input.layoutName.trim();

  if (!trimmedSummary) {
    return `${input.cycleSeconds}s`;
  }

  if (trimmedLayoutName.length > 0 && trimmedSummary.startsWith(trimmedLayoutName)) {
    const remainder = trimmedSummary.slice(trimmedLayoutName.length).trim();
    if (remainder.startsWith("for ")) {
      return remainder;
    }
  }

  return trimmedSummary;
};

const toParamStringValue = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return "";
};

const toParamNumberValue = (value: unknown, fallback: number): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
};

const toParamBooleanValue = (value: unknown): boolean => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }
  return false;
};

interface LocationSearchResult {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
}

const searchWeatherLocations = async (
  query: string,
  path: string,
): Promise<{
  results: LocationSearchResult[];
  warning: string | null;
}> => {
  const response = await fetch(`${path}?q=${encodeURIComponent(query)}`, {
    method: "GET",
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message =
      payload && typeof payload.message === "string"
        ? payload.message
        : `Request failed (${response.status})`;
    throw new Error(message);
  }

  const parsed = weatherLocationSearchResponseSchema.parse(await response.json());
  return {
    results: parsed.results.map((result) => ({
      id: result.id,
      label: result.label,
      latitude: result.latitude,
      longitude: result.longitude,
    })),
    warning: parsed.warning,
  };
};

const LocationSearchFieldEditor = ({
  field,
  params,
  onPatch,
}: {
  field: LogicParamFieldDefinition;
  params: LogicParams;
  onPatch: (patch: LogicParams) => void;
}) => {
  const [results, setResults] = useState<LocationSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);

  const locationValue = toParamStringValue(params[field.key]);
  const latitudeKey = field.latitudeKey ?? "latitude";
  const longitudeKey = field.longitudeKey ?? "longitude";
  const latitudeValue = params[latitudeKey];
  const longitudeValue = params[longitudeKey];
  const hasPinnedCoordinates =
    typeof latitudeValue === "number" && typeof longitudeValue === "number";

  const applyLocationResult = (result: LocationSearchResult) => {
    onPatch({
      [field.key]: result.label,
      [latitudeKey]: result.latitude,
      [longitudeKey]: result.longitude,
    });
    setResults([]);
    setError(null);
    setWarning(null);
  };

  const runSearch = async () => {
    const query = locationValue.trim();
    if (!query) {
      setError("Enter a location to search.");
      setWarning(null);
      setResults([]);
      return;
    }

    setLoading(true);
    setError(null);
    setWarning(null);

    try {
      const payload = await searchWeatherLocations(
        query,
        field.searchPath ?? "/api/modules/weather/locations",
      );
      setResults(payload.results);
      setWarning(
        payload.warning ?? (payload.results.length === 0 ? "No matching locations found." : null),
      );
    } catch (nextError) {
      setResults([]);
      setWarning(null);
      setError(
        nextError instanceof Error ? nextError.message : "Failed to search locations.",
      );
    } finally {
      setLoading(false);
    }
  };

  const useDeviceLocation = async () => {
    if (!("geolocation" in navigator)) {
      setError("Geolocation is not available in this browser.");
      return;
    }

    setGeoLoading(true);
    setError(null);

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15_000,
          maximumAge: 60_000,
        });
      });

      const latitude = Number(position.coords.latitude.toFixed(6));
      const longitude = Number(position.coords.longitude.toFixed(6));
      onPatch({
        [field.key]: `Local (${latitude.toFixed(3)}, ${longitude.toFixed(3)})`,
        [latitudeKey]: latitude,
        [longitudeKey]: longitude,
      });
      setResults([]);
      setWarning(null);
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Unable to read this device location.",
      );
    } finally {
      setGeoLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3 md:col-span-2">
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {field.label}
        </span>
        <input
          type="text"
          value={locationValue}
          placeholder={field.placeholder}
          className="h-10 w-full rounded border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100"
          onChange={(event) =>
            onPatch({
              [field.key]: event.target.value,
              [latitudeKey]: null,
              [longitudeKey]: null,
            })
          }
        />
      </label>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded border border-cyan-500/60 bg-cyan-500/20 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/30 disabled:opacity-60"
          onClick={() => void runSearch()}
          disabled={loading}
        >
          {loading ? "Searching..." : "Search places"}
        </button>
        {field.allowDeviceLocation ? (
          <button
            type="button"
            className="rounded border border-emerald-500/60 bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/30 disabled:opacity-60"
            onClick={() => void useDeviceLocation()}
            disabled={geoLoading}
          >
            {geoLoading ? "Locating..." : "Use this device location"}
          </button>
        ) : null}
        {hasPinnedCoordinates ? (
          <button
            type="button"
            className="rounded border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-400"
            onClick={() =>
              onPatch({
                [latitudeKey]: null,
                [longitudeKey]: null,
              })
            }
          >
            Clear pinned coordinates
          </button>
        ) : null}
      </div>

      {hasPinnedCoordinates ? (
        <p className="mt-3 rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">
          Using pinned coordinates: {(latitudeValue as number).toFixed(4)}, {" "}
          {(longitudeValue as number).toFixed(4)}
        </p>
      ) : (
        <p className="mt-3 rounded border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs text-slate-300">
          Using the place name for Emergency WA matching. Pinned coordinates improve local area
          matching when the warning feed includes map geometry.
        </p>
      )}

      {error ? (
        <p className="mt-3 rounded border border-rose-500/50 bg-rose-500/10 px-2 py-1 text-xs text-rose-200">
          {error}
        </p>
      ) : null}

      {warning ? (
        <p className="mt-3 rounded border border-amber-500/50 bg-amber-500/10 px-2 py-1 text-xs text-amber-200">
          {warning}
        </p>
      ) : null}

      {results.length > 0 ? (
        <div className="mt-3 max-h-44 space-y-1 overflow-y-auto rounded border border-slate-700 bg-slate-950/70 p-1">
          {results.map((result) => (
            <button
              key={result.id}
              type="button"
              className="w-full rounded border border-slate-700 bg-slate-900/70 px-2 py-1.5 text-left text-xs text-slate-100 hover:border-cyan-400"
              onClick={() => applyLocationResult(result)}
            >
              {result.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};

const createStepId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `step-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

const createActionNodeId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `action-${crypto.randomUUID()}`;
  }

  return `action-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

const toConnectionId = (input: {
  source: string;
  sourceHandle?: string | null;
  target: string;
}): string =>
  [input.source.trim(), input.sourceHandle?.trim() || "default", input.target.trim()].join(
    "::",
  );

const toPhotoSourceLabel = (
  collectionId: string | null | undefined,
  photoCollectionOptions: PhotoCollectionOption[],
): string => {
  if (!collectionId) {
    return "/photos";
  }

  const match = photoCollectionOptions.find((collection) => collection.id === collectionId);
  return match ? `Collection: ${match.name}` : "/photos";
};

const omitNodePositions = (
  nodePositions: Record<string, { x: number; y: number }>,
  nodeIds: Set<string>,
) =>
  Object.fromEntries(
    Object.entries(nodePositions).filter(([nodeId]) => !nodeIds.has(nodeId)),
  );

const isLayoutGraphNode = (
  node: PhotoRouterGraphNode,
): node is PhotoRouterLayoutNode => node.nodeType === "layout";

const isPhotoOrientationNode = (
  node: PhotoRouterGraphNode,
): node is PhotoRouterPhotoOrientationNode => node.nodeType === "photo-orientation";

const isWarningCanvasActionType = (
  actionType: string | null | undefined,
): boolean => (actionType?.trim() ?? "") === LOCAL_WARNING_CANVAS_ACTION_TYPE;

const getActionNodeKind = (
  actionType: string | null | undefined,
): ActionNodeKind => (isWarningCanvasActionType(actionType) ? "warning" : "photo");

const getAvailableConditionTypes = (
  kind: ActionNodeKind,
  trigger: ConditionalTrigger,
) =>
  LOGIC_CONDITION_TYPES.filter((condition) => {
    if (kind === "warning") {
      return condition.id === LOCAL_WARNING_CONDITION_TYPE;
    }
    if (condition.id === LOCAL_WARNING_CONDITION_TYPE) {
      return false;
    }
    return condition.trigger === trigger || condition.trigger === "landscape-photo";
  });

const getNormalizedConditionTypeForNodeKind = (
  kind: ActionNodeKind,
  trigger: ConditionalTrigger,
  conditionType: string | null | undefined,
): string | null => {
  const availableConditionTypes = getAvailableConditionTypes(kind, trigger);
  const normalizedConditionType = conditionType?.trim() ?? "";
  if (availableConditionTypes.some((condition) => condition.id === normalizedConditionType)) {
    return normalizedConditionType;
  }
  return availableConditionTypes[0]?.id ?? getDefaultConditionTypeForTrigger(trigger);
};

const getActionNodeKindLabel = (kind: ActionNodeKind): string =>
  kind === "warning" ? "Warning" : "Photo Orientation";

const getDefaultActionNodeTitle = (
  kind: ActionNodeKind,
  existingCount: number,
): string => {
  const baseTitle = kind === "warning" ? "Warning Node" : "Photo Orientation Node";
  return existingCount === 0 ? baseTitle : `${baseTitle} ${existingCount + 1}`;
};

const isBranchKey = (value: string | null | undefined): value is BranchKey =>
  value === "portrait" || value === "fallback";

const getGraphNodeById = (
  block: PhotoRouterBlock,
  nodeId: string | null | undefined,
): PhotoRouterGraphNode | null =>
  nodeId ? block.nodes.find((node) => node.id === nodeId) ?? null : null;

const wouldCreateGraphCycle = (
  block: PhotoRouterBlock,
  sourceId: string,
  targetId: string,
): boolean => {
  if (sourceId === START_NODE_ID || targetId === END_NODE_ID) {
    return false;
  }

  const nextBySource = new Map<string, string[]>();

  for (const connection of block.connections) {
    if (
      connection.source === START_NODE_ID ||
      connection.target === END_NODE_ID ||
      connection.source === sourceId
    ) {
      continue;
    }
    const current = nextBySource.get(connection.source) ?? [];
    current.push(connection.target);
    nextBySource.set(connection.source, current);
  }

  const visited = new Set<string>();
  const queue = [targetId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId || visited.has(currentId)) {
      continue;
    }
    if (currentId === sourceId) {
      return true;
    }
    visited.add(currentId);
    for (const nextId of nextBySource.get(currentId) ?? []) {
      if (!visited.has(nextId)) {
        queue.push(nextId);
      }
    }
  }

  return false;
};

const createEdge = (input: {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  stroke: string;
  dashed?: boolean;
}): Edge => ({
  id: input.id,
  source: input.source,
  target: input.target,
  sourceHandle: input.sourceHandle ?? undefined,
  type: "hearthEdge",
  style: {
    stroke: input.stroke,
    strokeOpacity: input.dashed ? 0.38 : 0.64,
    strokeWidth: input.dashed ? 2 : 2.5,
    strokeDasharray: EDGE_DASH_PATTERN,
  },
  selectable: true,
});

const ParamFieldEditor = ({
  field,
  params,
  onPatch,
}: {
  field: LogicParamFieldDefinition;
  params: LogicParams;
  onPatch: (patch: LogicParams) => void;
}) => {
  if (field.kind === "location-search") {
    return <LocationSearchFieldEditor field={field} params={params} onPatch={onPatch} />;
  }

  const value = params[field.key];

  if (field.kind === "boolean") {
    return (
      <label className="flex items-center justify-between rounded border border-slate-700 bg-slate-800/40 px-3 py-2">
        <span className="text-sm text-slate-200">{field.label}</span>
        <input
          type="checkbox"
          checked={toParamBooleanValue(value)}
          onChange={(event) => onPatch({ [field.key]: event.target.checked })}
        />
      </label>
    );
  }

  if (field.kind === "number") {
    const fallback =
      typeof field.min === "number" && Number.isFinite(field.min) ? field.min : 0;
    return (
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {field.label}
        </span>
        <input
          type="number"
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          value={toParamNumberValue(value, fallback)}
          className="h-10 w-full rounded border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100"
          onChange={(event) => {
            const parsed = Number.parseFloat(event.target.value);
            if (!Number.isFinite(parsed)) {
              return;
            }
            onPatch({ [field.key]: parsed });
          }}
        />
      </label>
    );
  }

  if (field.kind === "select") {
    return (
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {field.label}
        </span>
        <select
          className="h-10 w-full rounded border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100"
          value={toParamStringValue(value)}
          onChange={(event) => onPatch({ [field.key]: event.target.value })}
        >
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {field.label}
      </span>
      <input
        type="text"
        value={toParamStringValue(value)}
        className="h-10 w-full rounded border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100"
        onChange={(event) => onPatch({ [field.key]: event.target.value })}
      />
    </label>
  );
};

const RouterNode = ({ data, selected }: NodeProps<RouterNodeType>) => (
  <div
    className={`relative rounded-2xl border bg-slate-950/95 px-4 py-4 shadow-[0_0_0_1px_rgba(15,23,42,0.75)] ${
      selected ? "border-cyan-300 shadow-[0_0_0_2px_rgba(34,211,238,0.35)]" : "border-slate-700"
    }`}
  >
    <Handle
      type="target"
      position={Position.Top}
      className="!h-3 !w-3 !border-none !bg-slate-300"
      style={{ top: -7 }}
    />
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-200/90">
          {data.kindLabel}
        </p>
        <h4 className="mt-1 text-lg font-semibold text-slate-100">{data.title}</h4>
        <p className="mt-2 text-sm text-slate-300">{data.actionSummary}</p>
        {data.sourceLabel ? (
          <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">
            Source: {data.sourceLabel}
          </p>
        ) : null}
      </div>
      {data.onRemove ? (
        <button
          type="button"
          className="nodrag nopan rounded border border-rose-400/70 px-2.5 py-1.5 text-xs font-semibold text-rose-100 hover:bg-rose-500/20"
          onTouchStart={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            data.onRemove?.();
          }}
        >
          Remove
        </button>
      ) : null}
    </div>

    <div className={`mt-4 grid gap-2 ${data.routes.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
      {data.routes.map((route) => (
        <div
          key={route.key}
          className={`relative rounded-lg border px-3 py-2 text-sm ${BRANCH_META[route.key].borderClassName} ${BRANCH_META[route.key].bgClassName}`}
        >
          {route.connectable !== false ? (
            <Handle
              type="source"
              id={route.key}
              position={Position.Bottom}
              className="!h-3 !w-3 !border-none"
              style={{
                bottom: -7,
                left: "50%",
                transform: "translateX(-50%)",
                backgroundColor: BRANCH_META[route.key].color,
              }}
            />
          ) : null}
          <div className="text-center">
            <span className="block font-semibold">{route.label}</span>
            <span className="mt-1 block text-[11px] uppercase tracking-wide opacity-80">
              {route.enabled ? `${route.count} linked` : `disabled · ${route.count} linked`}
            </span>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const LayoutNode = ({ data, selected }: NodeProps<StepNodeType>) => (
  <div
    className={`rounded-xl border bg-slate-950/95 px-4 py-3 shadow-[0_0_0_1px_rgba(15,23,42,0.75)] ${
      selected ? "border-cyan-300 shadow-[0_0_0_2px_rgba(34,211,238,0.35)]" : "border-slate-700"
    }`}
  >
    <Handle
      type="target"
      position={Position.Top}
      className="!h-3 !w-3 !border-none !bg-slate-300"
      style={{ top: -7 }}
    />
    <Handle
      type="source"
      id="next"
      position={Position.Bottom}
      className="!h-3 !w-3 !border-none !bg-slate-300"
      style={{ bottom: -7 }}
    />

    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
          Layout
        </p>
        <h4 className="mt-1 truncate text-base font-semibold text-slate-100">{data.title}</h4>
      </div>
      {data.onRemove ? (
        <button
          type="button"
          className="nodrag nopan rounded border border-rose-400/70 px-2.5 py-1.5 text-xs font-semibold text-rose-100 hover:bg-rose-500/20"
          onTouchStart={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            data.onRemove?.();
          }}
        >
          Remove
        </button>
      ) : null}
    </div>
    <p className="mt-1 text-sm text-slate-300">{data.subtitle}</p>
    <div className="mt-3 inline-flex rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-300">
      {data.routeLabel}
    </div>
  </div>
);

const TerminalNode = ({ data }: NodeProps<TerminalNodeType>) => (
  <div
    className={`flex h-full w-full items-center justify-center rounded-full border text-center ${
      data.tone === "start"
        ? "border-cyan-400/50 bg-cyan-500/10 text-cyan-100"
        : "border-slate-600 bg-slate-900/90 text-slate-200"
    }`}
  >
    {data.tone === "start" ? (
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !border-none !bg-slate-300"
        style={{ bottom: -7 }}
      />
    ) : (
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-none !bg-slate-300"
        style={{ top: -7 }}
      />
    )}
    <div>
      {data.tone === "end" ? (
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] opacity-75">
          {data.tone}
        </p>
      ) : null}
      <p className={`${data.tone === "end" ? "mt-1" : ""} text-base font-semibold`}>
        {data.title}
      </p>
    </div>
  </div>
);

const CanvasControlButton = ({
  title,
  disabled = false,
  active = false,
  onClick,
  children,
}: {
  title: string;
  disabled?: boolean;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    disabled={disabled}
    onClick={onClick}
    className={`flex h-12 w-12 items-center justify-center transition ${
      active
        ? "bg-cyan-500/18 text-cyan-100 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.22)]"
        : "bg-slate-950/92 text-sky-100 hover:bg-slate-800/95 hover:text-cyan-100"
    } ${
      disabled
        ? "cursor-not-allowed bg-slate-950/90 text-slate-500 hover:bg-slate-950/90 hover:text-slate-500"
        : ""
    }`}
  >
    {children}
  </button>
);

const FitViewIcon = () => (
  <svg
    viewBox="0 0 20 20"
    aria-hidden="true"
    className="h-[18px] w-[18px]"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M7 3H3v4" />
    <path d="M13 3h4v4" />
    <path d="M17 13v4h-4" />
    <path d="M7 17H3v-4" />
  </svg>
);

const LockIcon = ({ locked }: { locked: boolean }) => (
  <svg
    viewBox="0 0 20 20"
    aria-hidden="true"
    className="h-[18px] w-[18px]"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="4.5" y="9" width="11" height="7.5" rx="1.8" />
    {locked ? (
      <path d="M6.5 9V6.8a3.5 3.5 0 1 1 7 0V9" />
    ) : (
      <path d="M13.5 9V6.8a3.5 3.5 0 0 0-6-2.45" />
    )}
  </svg>
);

const GraphEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  selected,
}: EdgeProps) => {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.42,
  });

  return (
    <>
      <BaseEdge
        id={`${id}-underlay`}
        path={edgePath}
        style={{
          stroke: style?.stroke ?? "#cbd5e1",
          strokeOpacity: selected ? 0.18 : 0.08,
          strokeWidth:
            typeof style?.strokeWidth === "number" ? style.strokeWidth + 8 : 10,
          strokeLinecap: "round",
          strokeLinejoin: "round",
        }}
      />
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          strokeLinecap: "round",
          strokeLinejoin: "round",
        }}
        interactionWidth={28}
      />
    </>
  );
};

const nodeTypes: NodeTypes = {
  routerNode: RouterNode,
  layoutNode: LayoutNode,
  terminalNode: TerminalNode,
};

const edgeTypes = {
  hearthEdge: GraphEdge,
};

const getDefaultGraphNodePosition = (input: {
  node: PhotoRouterGraphNode;
  index: number;
}): { x: number; y: number } =>
  isPhotoOrientationNode(input.node)
    ? {
        x: DEFAULT_ROUTER_POSITION.x + (input.index % 2) * 420,
        y: DEFAULT_ROUTER_POSITION.y + Math.floor(input.index / 2) * 260,
      }
    : {
        x: DEFAULT_DETACHED_ORIGIN.x + (input.index % 3) * DEFAULT_DETACHED_X_GAP,
        y: DEFAULT_DETACHED_ORIGIN.y + Math.floor(input.index / 3) * DEFAULT_DETACHED_Y_GAP,
      };

const getGraphNodeSize = (
  node: PhotoRouterGraphNode | null | undefined,
): { width: number; height: number } =>
  node && isPhotoOrientationNode(node)
    ? {
        width: ROUTER_NODE_WIDTH,
        height: ROUTER_NODE_HEIGHT,
      }
    : {
        width: LAYOUT_NODE_WIDTH,
        height: LAYOUT_NODE_HEIGHT,
      };

const buildFlowGraph = (input: {
  block: PhotoRouterBlock;
  selectedNodeId: string | null;
  photoCollectionOptions: PhotoCollectionOption[];
  onRemoveNode: (nodeId: string) => void;
  isCanvasInteractive: boolean;
}): { nodes: Node[]; edges: Edge[] } => {
  const actionNodes = input.block.nodes.filter(
    (node): node is PhotoRouterPhotoOrientationNode => isPhotoOrientationNode(node),
  );
  const layoutNodes = input.block.nodes.filter(
    (node): node is PhotoRouterLayoutNode => isLayoutGraphNode(node),
  );
  const hiddenWarningPortraitSources = new Set(
    actionNodes
      .filter((node) => getActionNodeKind(node.photoActionType) === "warning")
      .map((node) => `${node.id}::portrait`),
  );
  const visibleConnections = input.block.connections.filter(
    (connection) =>
      !hiddenWarningPortraitSources.has(
        `${connection.source}::${connection.sourceHandle?.trim() || "default"}`,
      ),
  );
  const incomingCounts = new Map<string, number>();
  const connectionBySourceHandle = new Map<string, PhotoRouterConnection>();

  visibleConnections.forEach((connection) => {
    incomingCounts.set(
      connection.target,
      (incomingCounts.get(connection.target) ?? 0) + 1,
    );
    connectionBySourceHandle.set(
      `${connection.source}::${connection.sourceHandle?.trim() || "default"}`,
      connection,
    );
  });

  const nodes: Node[] = [];
  const positionedNodes = input.block.nodes.map((node, index) => ({
    node,
    position:
      input.block.nodePositions[node.id] ?? getDefaultGraphNodePosition({ node, index }),
  }));

  const firstGraphNodePosition =
    positionedNodes[0]?.position ?? DEFAULT_ROUTER_POSITION;
  const startTargetId =
    input.block.connections.find((connection) => connection.source === START_NODE_ID)?.target ??
    null;
  const startAnchorEntry =
    (startTargetId
      ? positionedNodes.find((entry) => entry.node.id === startTargetId) ?? null
      : null) ?? positionedNodes[0] ?? null;
  const startAnchorSize = getGraphNodeSize(startAnchorEntry?.node);

  nodes.push({
    id: START_NODE_ID,
    type: "terminalNode",
    position:
      input.block.nodePositions[START_NODE_ID] ?? {
        x:
          (startAnchorEntry?.position.x ?? firstGraphNodePosition.x) +
          startAnchorSize.width / 2 -
          TERMINAL_NODE_SIZE / 2,
        y: Math.max(
          24,
          (startAnchorEntry?.position.y ?? firstGraphNodePosition.y) - START_NODE_GAP,
        ),
      },
    draggable: input.isCanvasInteractive,
    selectable: false,
    deletable: false,
    style: {
      width: TERMINAL_NODE_SIZE,
      height: TERMINAL_NODE_SIZE,
    },
    data: {
      title: "Start",
      tone: "start",
    },
  } satisfies TerminalNodeType);

  actionNodes.forEach((node, index) => {
    const actionNodeKind = getActionNodeKind(node.photoActionType);
    const conditionBranchCopy = getConditionBranchCopy(
      getNormalizedConditionTypeForNodeKind(
        actionNodeKind,
        "portrait-photo",
        node.portrait.conditionType,
      ),
    );

    nodes.push({
      id: node.id,
      type: "routerNode",
      position:
        input.block.nodePositions[node.id] ??
        getDefaultGraphNodePosition({ node, index }),
      draggable: input.isCanvasInteractive,
      selectable: true,
      deletable: true,
      style: {
        width: ROUTER_NODE_WIDTH,
        minHeight: ROUTER_NODE_HEIGHT,
      },
      selected: input.selectedNodeId === node.id,
      data: {
        title: node.title,
        kindLabel: getActionNodeKindLabel(actionNodeKind),
        actionSummary: getCanvasActionTypeById(node.photoActionType).description,
        sourceLabel:
          actionNodeKind === "warning"
            ? null
            : toPhotoSourceLabel(
                node.photoActionCollectionId,
                input.photoCollectionOptions,
              ),
        onRemove: () => input.onRemoveNode(node.id),
        routes:
          actionNodeKind === "warning"
            ? [
                {
                  key: "fallback" as const,
                  label: conditionBranchCopy.fallbackLabel,
                  count: connectionBySourceHandle.has(`${node.id}::fallback`) ? 1 : 0,
                  enabled: true,
                  connectable: true,
                },
              ]
            : ROUTER_ROUTE_ORDER.map((branchKey) => ({
                key: branchKey,
                label:
                  branchKey === "portrait"
                    ? conditionBranchCopy.matchedLabel
                    : conditionBranchCopy.fallbackLabel,
                count: connectionBySourceHandle.has(`${node.id}::${branchKey}`) ? 1 : 0,
                enabled: true,
                connectable: true,
              })),
      },
    } satisfies RouterNodeType);
  });

  layoutNodes.forEach((node, index) => {
    const actionType = getActionTypeById(node.actionType);
    const actionParams = parseActionParamsByType(node.actionType, node.actionParams);
    const incomingCount = incomingCounts.get(node.id) ?? 0;

    nodes.push({
      id: node.id,
      type: "layoutNode",
      position:
        input.block.nodePositions[node.id] ??
        getDefaultGraphNodePosition({
          node,
          index: actionNodes.length + index,
        }),
      draggable: input.isCanvasInteractive,
      selectable: true,
      deletable: true,
      style: {
        width: LAYOUT_NODE_WIDTH,
        minHeight: LAYOUT_NODE_HEIGHT,
      },
      selected: input.selectedNodeId === node.id,
      data: {
        title: node.layoutName,
        subtitle: toLayoutNodeSubtitle({
          actionSummary: actionType.renderSummary({
            layoutName: node.layoutName,
            cycleSeconds: node.cycleSeconds,
            actionType: node.actionType,
            actionParams,
            conditionParams: {},
          }),
          layoutName: node.layoutName,
          cycleSeconds: node.cycleSeconds,
        }),
        onRemove: () => input.onRemoveNode(node.id),
        routeLabel:
          incomingCount > 0
            ? `${incomingCount} input${incomingCount === 1 ? "" : "s"}`
            : "Detached",
      },
    } satisfies StepNodeType);
  });

  const lowestNodeEntry = positionedNodes.reduce<{
    node: PhotoRouterGraphNode | null;
    position: { x: number; y: number };
  }>(
    (result, entry) =>
      entry.position.y > result.position.y
        ? { node: entry.node, position: entry.position }
        : result,
    {
      node: null,
      position: firstGraphNodePosition,
    },
  );
  const lowestNodeSize = getGraphNodeSize(lowestNodeEntry.node);

  nodes.push({
    id: END_NODE_ID,
    type: "terminalNode",
    position:
      input.block.nodePositions[END_NODE_ID] ?? {
        x:
          lowestNodeEntry.position.x +
          lowestNodeSize.width / 2 -
          TERMINAL_NODE_SIZE / 2,
        y: lowestNodeEntry.position.y + lowestNodeSize.height + END_NODE_GAP,
      },
    draggable: input.isCanvasInteractive,
    selectable: false,
    deletable: false,
    style: {
      width: TERMINAL_NODE_SIZE,
      height: TERMINAL_NODE_SIZE,
    },
    data: {
      title: "Return to start",
      tone: "end",
    },
  } satisfies TerminalNodeType);

  const edges = visibleConnections.map((connection) => {
    const sourceNode = getGraphNodeById(input.block, connection.source);
    const branchKey = isBranchKey(connection.sourceHandle)
      ? connection.sourceHandle
      : null;
    const stroke = branchKey
      ? BRANCH_META[branchKey].color
      : sourceNode && isPhotoOrientationNode(sourceNode)
        ? "#94a3b8"
        : "#94a3b8";
    const dashed = false;

    return createEdge({
      id: connection.id,
      source: connection.source,
      sourceHandle: connection.sourceHandle,
      target: connection.target,
      stroke,
      dashed,
    });
  });

  return { nodes, edges };
};

export const PhotoRouterBlockEditor = ({
  authoring,
  layoutOptions,
  photoCollectionOptions,
  runtimeHealth,
  onChange,
}: PhotoRouterBlockEditorProps) => {
  const block = useMemo(() => getPrimaryPhotoRouterBlock(authoring), [authoring]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isCanvasInteractive, setIsCanvasInteractive] = useState(true);
  const [reactFlowInstance, setReactFlowInstance] =
    useState<ReactFlowInstance<Node, Edge> | null>(null);
  const updateBlock = useCallback((updater: (current: PhotoRouterBlock) => PhotoRouterBlock) => {
    const nextBlock = updater(block);
    onChange(
      setPrimaryPhotoRouterBlock({
        authoring,
        block: nextBlock,
      }),
    );
  }, [authoring, block, onChange]);

  const addLayoutNodeAtPosition = useCallback((position: { x: number; y: number }) => {
    const fallbackLayoutName =
      layoutOptions[0]?.name ??
      block.nodes.find((node): node is PhotoRouterLayoutNode => isLayoutGraphNode(node))
        ?.layoutName ??
      "";

    if (!fallbackLayoutName) {
      return;
    }

    const nextLayoutNode: PhotoRouterLayoutNode = {
      id: createStepId(),
      nodeType: "layout",
      layoutName: fallbackLayoutName,
      cycleSeconds: 20,
      actionType: LOGIC_ACTION_TYPES[0]?.id ?? "layout.display",
      actionParams: getDefaultActionParams(LOGIC_ACTION_TYPES[0]?.id),
    };

    setSelectedNodeId(nextLayoutNode.id);
    updateBlock((current) => ({
      ...current,
      nodes: [...current.nodes, nextLayoutNode],
      nodePositions: {
        ...current.nodePositions,
        [nextLayoutNode.id]: {
          x: roundPosition(position.x),
          y: roundPosition(position.y),
        },
      },
    }));
  }, [block.nodes, layoutOptions, updateBlock]);

  const addActionNodeAtPosition = useCallback((
    kind: ActionNodeKind,
    position: { x: number; y: number },
  ) => {
    const existingActionCount = block.nodes.filter(
      (node) =>
        isPhotoOrientationNode(node) &&
        getActionNodeKind(node.photoActionType) === kind,
    ).length;
    const nextConditionType =
      kind === "warning"
        ? LOCAL_WARNING_CONDITION_TYPE
        : getDefaultConditionTypeForTrigger("portrait-photo");
    const nextActionNode: PhotoRouterPhotoOrientationNode = {
      id: createActionNodeId(),
      nodeType: "photo-orientation",
      title: getDefaultActionNodeTitle(kind, existingActionCount),
      photoActionType:
        kind === "warning"
          ? LOCAL_WARNING_CANVAS_ACTION_TYPE
          : getDefaultCanvasActionTypeId(),
      photoActionCollectionId: null,
      portrait: {
        enabled: true,
        conditionType: nextConditionType,
        conditionParams: parseConditionParamsByType(nextConditionType, {}),
      },
      landscape: {
        enabled: false,
        conditionType: "photo.orientation.landscape",
        conditionParams: {},
      },
    };

    setSelectedNodeId(nextActionNode.id);
    updateBlock((current) => ({
      ...current,
      nodes: [...current.nodes, nextActionNode],
      nodePositions: {
        ...current.nodePositions,
        [nextActionNode.id]: {
          x: roundPosition(position.x),
          y: roundPosition(position.y),
        },
      },
    }));
  }, [block.nodes, updateBlock]);

  const handleNodesDelete = useCallback((deletedNodes: Node[]) => {
    const deletedNodeIds = new Set(
      deletedNodes
        .map((node) => node.id)
        .filter((nodeId) => nodeId !== START_NODE_ID && nodeId !== END_NODE_ID),
    );
    if (deletedNodeIds.size === 0) {
      return;
    }

    setSelectedNodeId(null);
    updateBlock((current) => {
      const remainingNodes = current.nodes.filter((node) => !deletedNodeIds.has(node.id));
      const remainingNodeIds = new Set(remainingNodes.map((node) => node.id));

      return {
        ...current,
        nodes: remainingNodes,
        layoutNodes: current.layoutNodes.filter((step) => remainingNodeIds.has(step.id)),
        connections: current.connections.filter(
          (connection) =>
            !deletedNodeIds.has(connection.source) && !deletedNodeIds.has(connection.target),
        ),
        nodePositions: omitNodePositions(current.nodePositions, deletedNodeIds),
        fallback: {
          ...current.fallback,
          steps: current.fallback.steps.filter((step) => remainingNodeIds.has(step.id)),
        },
        portrait: {
          ...current.portrait,
          steps: current.portrait.steps.filter((step) => remainingNodeIds.has(step.id)),
        },
        landscape: {
          ...current.landscape,
          steps: current.landscape.steps.filter((step) => remainingNodeIds.has(step.id)),
        },
      };
    });
  }, [updateBlock]);

  const removeNodeById = useCallback((nodeId: string) => {
    if (nodeId === START_NODE_ID || nodeId === END_NODE_ID) {
      return;
    }

    handleNodesDelete([
      {
        id: nodeId,
        position: block.nodePositions[nodeId] ?? {
          x: 0,
          y: 0,
        },
        data: {},
      } as Node,
    ]);
  }, [block.nodePositions, handleNodesDelete]);

  const graph = useMemo(
    () =>
      buildFlowGraph({
        block,
        selectedNodeId,
        photoCollectionOptions,
        onRemoveNode: removeNodeById,
        isCanvasInteractive,
      }),
    [block, isCanvasInteractive, photoCollectionOptions, removeNodeById, selectedNodeId],
  );
  const [nodes, setNodes] = useState<Node[]>(graph.nodes);
  const [edges, setEdges] = useState<Edge[]>(graph.edges);

  useEffect(() => {
    setNodes(graph.nodes);
    setEdges(graph.edges);
  }, [graph]);

  useEffect(() => {
    if (!reactFlowInstance) {
      return;
    }

    requestAnimationFrame(() => {
      reactFlowInstance.fitView({
        padding: 0.2,
        duration: 180,
      });
    });
  }, [graph.nodes.map((node) => node.id).join("|"), reactFlowInstance]);

  useEffect(() => {
    if (selectedNodeId === null) {
      return;
    }
    if (block.nodes.some((node) => node.id === selectedNodeId)) {
      return;
    }
    setSelectedNodeId(null);
  }, [block, selectedNodeId]);

  const isValidConnection = (candidate: Edge | Connection): boolean => {
    const source = candidate.source?.trim();
    const target = candidate.target?.trim();
    if (!source || !target || source === target) {
      return false;
    }
    if (source === END_NODE_ID || target === START_NODE_ID) {
      return false;
    }
    if (
      target !== END_NODE_ID &&
      !block.nodes.some((node) => node.id === target)
    ) {
      return false;
    }

    if (source === START_NODE_ID) {
      return target !== END_NODE_ID;
    }

    const sourceNode = getGraphNodeById(block, source);
    if (!sourceNode) {
      return false;
    }

    if (isLayoutGraphNode(sourceNode)) {
      return !wouldCreateGraphCycle(block, source, target);
    }

    if (
      getActionNodeKind(sourceNode.photoActionType) === "warning" &&
      (candidate.sourceHandle?.trim() ?? null) === "portrait"
    ) {
      return false;
    }

    return (
      isBranchKey(candidate.sourceHandle?.trim() ?? null) &&
      !wouldCreateGraphCycle(block, source, target)
    );
  };

  const handleConnect = (connection: Connection) => {
    if (!isValidConnection(connection)) {
      return;
    }

    updateBlock((current) => {
      const source = connection.source!.trim();
      const target = connection.target!.trim();
      const sourceNode = getGraphNodeById(current, source);
      const sourceHandle =
        source === START_NODE_ID
          ? null
          : sourceNode && isLayoutGraphNode(sourceNode)
            ? "next"
            : connection.sourceHandle?.trim() ?? null;
      if (source !== START_NODE_ID && !sourceHandle) {
        return current;
      }

      return {
        ...current,
        connections: [
          ...current.connections.filter(
            (entry) =>
              !(
                entry.source === source &&
                (entry.sourceHandle?.trim() || null) === sourceHandle
              ),
          ),
          {
            id: toConnectionId({
              source,
              sourceHandle,
              target,
            }),
            source,
            sourceHandle,
            target,
          },
        ],
      };
    });
  };

  const handleNodesChange = (changes: NodeChange[]) => {
    if (!isCanvasInteractive) {
      return;
    }
    setNodes((current) => applyNodeChanges(changes, current));
  };

  const handleEdgesChange = (changes: EdgeChange[]) => {
    if (!isCanvasInteractive) {
      return;
    }
    setEdges((current) => applyEdgeChanges(changes, current));
  };

  const handleNodeDragStop = (_event: unknown, node: Node) => {
    if (!isCanvasInteractive) {
      return;
    }
    updateBlock((current) => ({
      ...current,
      nodePositions: {
        ...current.nodePositions,
        [node.id]: {
          x: roundPosition(node.position.x),
          y: roundPosition(node.position.y),
        },
      },
    }));
  };

  const handleEdgesDelete = (deletedEdges: Edge[]) => {
    const deletedEdgeIds = new Set(deletedEdges.map((edge) => edge.id));
    if (deletedEdgeIds.size === 0) {
      return;
    }

    updateBlock((current) => ({
      ...current,
      connections: current.connections.filter(
        (connection) => !deletedEdgeIds.has(connection.id),
      ),
    }));
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!reactFlowInstance || !isCanvasInteractive) {
      return;
    }

    const blockType = event.dataTransfer.getData(GRAPH_NODE_DRAG_TYPE);
    if (
      blockType !== "layout-node" &&
      blockType !== "photo-node" &&
      blockType !== "warning-node"
    ) {
      return;
    }

    const position = reactFlowInstance.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    if (blockType === "photo-node") {
      addActionNodeAtPosition("photo", position);
      return;
    }

    if (blockType === "warning-node") {
      addActionNodeAtPosition("warning", position);
      return;
    }

    if (layoutOptions.length === 0) {
      return;
    }

    addLayoutNodeAtPosition(position);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = isCanvasInteractive ? "copy" : "none";
  };

  const selectedLayoutNode = selectedNodeId
    ? block.nodes.find(
        (node): node is PhotoRouterLayoutNode =>
          node.id === selectedNodeId && isLayoutGraphNode(node),
      ) ?? null
    : null;
  const selectedActionNode = selectedNodeId
    ? block.nodes.find(
        (node): node is PhotoRouterPhotoOrientationNode =>
          node.id === selectedNodeId && isPhotoOrientationNode(node),
      ) ?? null
    : null;
  const selectedActionKind = selectedActionNode
    ? getActionNodeKind(selectedActionNode.photoActionType)
    : null;
  const selectedCanvasAction = getCanvasActionTypeById(
    selectedActionNode?.photoActionType || getDefaultCanvasActionTypeId(),
  );
  const selectedActionUsesPhotoSource = selectedActionKind === "photo";
  const runtimeStatusMeta = useMemo(() => {
    if (!runtimeHealth) {
      return null;
    }

    const summaryLines =
      runtimeHealth.issues.length === 0
        ? ["No issues found. Runtime path resolves for current set logic."]
        : runtimeHealth.issues.map((issue) => issue.message);
    const pathLines = runtimeHealth.paths.map((path) => `${path.label}: ${path.summary}`);

    return {
      icon: runtimeHealth.status === "ok" ? "✓" : "!",
      className:
        runtimeHealth.status === "ok"
          ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-100"
          : "border-amber-400/60 bg-amber-500/15 text-amber-100",
      title: [
        runtimeHealth.status === "ok" ? "Runtime healthy" : "Runtime warnings found",
        "Checks use the same logic the display runtime executes.",
        ...summaryLines,
        ...pathLines,
      ].join("\n"),
    };
  }, [runtimeHealth]);

  const updateSelectedLayoutNode = (
    updater: (current: PhotoRouterLayoutNode) => PhotoRouterLayoutNode,
  ) => {
    if (!selectedLayoutNode) {
      return;
    }

    updateBlock((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === selectedLayoutNode.id && isLayoutGraphNode(node)
          ? updater(node)
          : node,
      ),
    }));
  };

  const updateSelectedActionNode = (
    updater: (
      current: PhotoRouterPhotoOrientationNode,
    ) => PhotoRouterPhotoOrientationNode,
  ) => {
    if (!selectedActionNode) {
      return;
    }

    updateBlock((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === selectedActionNode.id && isPhotoOrientationNode(node)
          ? updater(node)
          : node,
      ),
    }));
  };

  useEffect(() => {
    let hasChanges = false;

    for (const node of block.nodes) {
      if (!isPhotoOrientationNode(node)) {
        continue;
      }
      const nextConditionType = getNormalizedConditionTypeForNodeKind(
        getActionNodeKind(node.photoActionType),
        "portrait-photo",
        node.portrait.conditionType,
      );
      if ((node.portrait.conditionType?.trim() ?? "") !== (nextConditionType ?? "")) {
        hasChanges = true;
        break;
      }
    }

    if (!hasChanges) {
      return;
    }

    updateBlock((current) => ({
      ...current,
      nodes: current.nodes.map((node) => {
        if (!isPhotoOrientationNode(node)) {
          return node;
        }
        const nextConditionType = getNormalizedConditionTypeForNodeKind(
          getActionNodeKind(node.photoActionType),
          "portrait-photo",
          node.portrait.conditionType,
        );
        if ((node.portrait.conditionType?.trim() ?? "") === (nextConditionType ?? "")) {
          return node;
        }
        return {
          ...node,
          portrait: {
            ...node.portrait,
            conditionType: nextConditionType,
            conditionParams: parseConditionParamsByType(
              nextConditionType,
              node.portrait.conditionParams,
            ),
          },
        };
      }),
    }));
  }, [block.nodes, updateBlock]);

  const renderConditionalSettings = (
    actionKind: ActionNodeKind,
    trigger: ConditionalTrigger,
    branch: PhotoRouterPhotoOrientationNode["portrait"],
    updateBranch: (
      updater: (current: PhotoRouterPhotoOrientationNode["portrait"]) => PhotoRouterPhotoOrientationNode["portrait"],
    ) => void,
  ) => {
    const availableConditionTypes = getAvailableConditionTypes(actionKind, trigger);
    const normalizedConditionType = getNormalizedConditionTypeForNodeKind(
      actionKind,
      trigger,
      branch.conditionType,
    );
    const conditionDefinition = getConditionTypeById(normalizedConditionType);
    const conditionParams = parseConditionParamsByType(
      normalizedConditionType,
      branch.conditionParams,
    );
    const conditionBranchCopy = getConditionBranchCopy(normalizedConditionType);
    const autoWarningLayout = actionKind === "warning";

    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
        <div>
          <p className="text-sm font-semibold text-slate-100">
            {conditionBranchCopy.title}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {autoWarningLayout
              ? "When active, this node shows the automatic warning layout. Connect No Warning to continue the normal flow."
              : "Connect this output to the first layout node when the condition matches."}
          </p>
        </div>

        {actionKind === "warning" ? (
          <div className="mt-4">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Condition
            </span>
            <div className="flex h-10 items-center rounded border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100">
              {conditionDefinition?.label ?? "Local warning is active"}
            </div>
          </div>
        ) : (
          <label className="mt-4 block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Condition
            </span>
            <select
              className="h-10 w-full rounded border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100"
              value={normalizedConditionType ?? ""}
              onChange={(event) =>
                updateBranch((current) => ({
                  ...current,
                  enabled: true,
                  conditionType: event.target.value,
                  conditionParams: parseConditionParamsByType(event.target.value, {}),
                }))
              }
            >
              {availableConditionTypes.map((condition) => (
                <option key={condition.id} value={condition.id}>
                  {condition.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <p className="mt-2 text-xs text-slate-400">
          {conditionDefinition?.description ??
            "Select which condition must match before this route runs."}
        </p>

        {conditionDefinition?.paramFields?.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {conditionDefinition.paramFields.map((field) => (
              <ParamFieldEditor
                key={field.key}
                field={field}
                params={conditionParams}
                onPatch={(patch) =>
                  updateBranch((current) => ({
                    ...current,
                    conditionType: normalizedConditionType,
                    conditionParams: {
                      ...conditionParams,
                      ...patch,
                    },
                  }))
                }
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <section className="rounded-xl border border-slate-700/80 bg-slate-950/70 p-4">
      <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_340px]">
        <aside className="space-y-4 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">
              Palette
            </p>
            <p className="mt-1 text-xs text-slate-500">Drag a node to canvas.</p>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Layout Nodes
            </p>
            <button
              type="button"
              draggable={layoutOptions.length > 0}
              disabled={layoutOptions.length === 0}
              className="mt-3 flex w-full items-center justify-between rounded-xl border border-cyan-500/50 bg-cyan-500/10 px-3 py-3 text-left text-cyan-100 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              onDragStart={(event) => {
                event.dataTransfer.setData(GRAPH_NODE_DRAG_TYPE, "layout-node");
                event.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() =>
                addLayoutNodeAtPosition({
                  x: DEFAULT_DETACHED_ORIGIN.x,
                  y: DEFAULT_DETACHED_ORIGIN.y,
                })
              }
            >
              <span className="block text-sm font-semibold">Layout Node</span>
            </button>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Routing Nodes
            </p>
            <button
              type="button"
              draggable
              className="mt-3 flex w-full items-center justify-between rounded-xl border border-emerald-500/50 bg-emerald-500/10 px-3 py-3 text-left text-emerald-100 transition hover:bg-emerald-500/20"
              onDragStart={(event) => {
                event.dataTransfer.setData(GRAPH_NODE_DRAG_TYPE, "photo-node");
                event.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => addActionNodeAtPosition("photo", DEFAULT_ROUTER_POSITION)}
            >
              <span className="block text-sm font-semibold">Photo Orientation Node</span>
            </button>
            <button
              type="button"
              draggable
              className="mt-3 flex w-full items-center justify-between rounded-xl border border-amber-500/50 bg-amber-500/10 px-3 py-3 text-left text-amber-100 transition hover:bg-amber-500/20"
              onDragStart={(event) => {
                event.dataTransfer.setData(GRAPH_NODE_DRAG_TYPE, "warning-node");
                event.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() =>
                addActionNodeAtPosition("warning", {
                  x: DEFAULT_ROUTER_POSITION.x + 48,
                  y: DEFAULT_ROUTER_POSITION.y + 48,
                })
              }
            >
              <span className="block text-sm font-semibold">Warning Node</span>
            </button>
          </div>

        </aside>

        <div
          className="h-[760px] overflow-hidden rounded-xl border border-slate-700 bg-slate-950"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            proOptions={{ hideAttribution: true }}
            onInit={setReactFlowInstance}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={handleConnect}
            onNodeDragStop={handleNodeDragStop}
            onNodesDelete={handleNodesDelete}
            onEdgesDelete={handleEdgesDelete}
            onNodeClick={(_event, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            fitView
            minZoom={0.35}
            maxZoom={1.5}
            deleteKeyCode={["Backspace", "Delete"]}
            isValidConnection={isValidConnection}
            panOnDrag={isCanvasInteractive}
            zoomOnScroll={isCanvasInteractive}
            zoomOnPinch={isCanvasInteractive}
            zoomOnDoubleClick={isCanvasInteractive}
            connectionLineType={ConnectionLineType.SimpleBezier}
            connectionLineStyle={{
              stroke: "#cbd5e1",
              strokeOpacity: 0.55,
              strokeWidth: 2.2,
              strokeDasharray: EDGE_DASH_PATTERN,
              strokeLinecap: "round",
              strokeLinejoin: "round",
            }}
            className="bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.08),_rgba(2,6,23,0.95)_55%)]"
            nodesConnectable={isCanvasInteractive}
            nodesDraggable={isCanvasInteractive}
            elementsSelectable={isCanvasInteractive}
          >
            <Background color="#1e293b" gap={24} size={1.2} />
            {runtimeStatusMeta ? (
              <Panel position="top-right">
                <div
                  title={runtimeStatusMeta.title}
                  aria-label={runtimeStatusMeta.title}
                  className={`flex h-10 w-10 items-center justify-center rounded-full border text-base font-bold shadow-[0_10px_30px_rgba(2,6,23,0.35)] ${runtimeStatusMeta.className}`}
                >
                  {runtimeStatusMeta.icon}
                </div>
              </Panel>
            ) : null}
            <Panel position="bottom-right">
              <div className="divide-y divide-cyan-500/25 overflow-hidden rounded-[22px] border border-cyan-500/40 bg-slate-950/92 shadow-[0_0_0_1px_rgba(14,116,144,0.25),0_8px_18px_rgba(2,6,23,0.55)]">
                <CanvasControlButton
                  title="Zoom in"
                  disabled={!reactFlowInstance || !isCanvasInteractive}
                  onClick={() => {
                    void reactFlowInstance?.zoomIn({ duration: 140 });
                  }}
                >
                  <span className="text-[30px] font-light leading-none">+</span>
                </CanvasControlButton>
                <CanvasControlButton
                  title="Zoom out"
                  disabled={!reactFlowInstance || !isCanvasInteractive}
                  onClick={() => {
                    void reactFlowInstance?.zoomOut({ duration: 140 });
                  }}
                >
                  <span className="text-[30px] font-light leading-none">−</span>
                </CanvasControlButton>
                <CanvasControlButton
                  title="Fit canvas"
                  disabled={!reactFlowInstance || !isCanvasInteractive}
                  onClick={() => {
                    void reactFlowInstance?.fitView({
                      duration: 160,
                      padding: 0.18,
                    });
                  }}
                >
                  <FitViewIcon />
                </CanvasControlButton>
                <CanvasControlButton
                  title={isCanvasInteractive ? "Lock canvas" : "Unlock canvas"}
                  active={!isCanvasInteractive}
                  onClick={() => {
                    setIsCanvasInteractive((current) => !current);
                  }}
                >
                  <LockIcon locked={!isCanvasInteractive} />
                </CanvasControlButton>
              </div>
            </Panel>
          </ReactFlow>
        </div>

        <aside className="space-y-4 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">
              Inspector
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {selectedLayoutNode
                ? "Edit the selected layout node."
                : selectedActionNode
                  ? `Edit the selected ${selectedActionKind === "warning" ? "warning" : "photo orientation"} node settings.`
                  : "Select a photo orientation, warning, or layout node to edit it."}
            </p>
          </div>

          {selectedLayoutNode ? (
            <>
              <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-4">
                <div>
                  <p className="text-base font-semibold text-slate-100">
                    Layout Node
                  </p>
                  <p className="mt-1 text-sm text-slate-300">
                    {selectedLayoutNode.layoutName}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Node {selectedLayoutNode.id.slice(0, 8)}
                  </p>
                </div>

                <div className="mt-4 space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Layout
                    </span>
                    <select
                      className="h-10 w-full rounded border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100"
                      value={selectedLayoutNode.layoutName}
                      onChange={(event) =>
                        updateSelectedLayoutNode((current) => ({
                          ...current,
                          layoutName: event.target.value,
                        }))
                      }
                    >
                      {layoutOptions.map((layout) => (
                        <option key={layout.id} value={layout.name}>
                          {layout.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Show (sec)
                    </span>
                    <input
                      type="number"
                      min={3}
                      max={3600}
                      step={1}
                      value={selectedLayoutNode.cycleSeconds}
                      className="h-10 w-full rounded border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100"
                      onChange={(event) => {
                        const parsed = Number.parseInt(event.target.value, 10);
                        if (!Number.isFinite(parsed)) {
                          return;
                        }
                        updateSelectedLayoutNode((current) => ({
                          ...current,
                          cycleSeconds: clampCycleSeconds(parsed),
                        }));
                      }}
                    />
                  </label>

                </div>
              </div>

              {(() => {
                const actionType = getActionTypeById(selectedLayoutNode.actionType);
                const actionParams = parseActionParamsByType(
                  selectedLayoutNode.actionType,
                  selectedLayoutNode.actionParams,
                );
                const photoCollectionId =
                  typeof actionParams[PHOTO_COLLECTION_ACTION_PARAM_KEY] === "string"
                    ? actionParams[PHOTO_COLLECTION_ACTION_PARAM_KEY].trim()
                    : "";

                return (
                  <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-4">
                    <p className="text-sm font-semibold text-slate-100">Action settings</p>
                    <p className="mt-1 text-xs text-slate-400">{actionType.description}</p>

                    <div className="mt-4 space-y-3">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          Photo source override
                        </span>
                        <select
                          className="h-10 w-full rounded border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100"
                          value={photoCollectionId}
                          onChange={(event) =>
                            updateSelectedLayoutNode((current) => ({
                              ...current,
                              actionParams: {
                                ...actionParams,
                                [PHOTO_COLLECTION_ACTION_PARAM_KEY]:
                                  event.target.value.trim() || null,
                              },
                            }))
                          }
                        >
                          <option value="">/photos</option>
                          {photoCollectionOptions.map((collection) => (
                            <option key={collection.id} value={collection.id}>
                              Collection: {collection.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      {actionType.paramFields?.map((field) => (
                        <ParamFieldEditor
                          key={field.key}
                          field={field}
                          params={actionParams}
                          onPatch={(patch) =>
                            updateSelectedLayoutNode((current) => ({
                              ...current,
                              actionParams: {
                                ...actionParams,
                                ...patch,
                              },
                            }))
                          }
                        />
                      ))}
                    </div>
                  </div>
                );
              })()}
            </>
          ) : selectedActionNode ? (
            <>
              <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-4">
                <p className="text-base font-semibold text-slate-100">
                  {selectedActionKind === "warning"
                    ? "Warning node settings"
                    : "Photo orientation node settings"}
                </p>
                <div className="mt-4 space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Node name
                    </span>
                    <input
                      type="text"
                      value={selectedActionNode.title}
                      className="h-10 w-full rounded border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100"
                      onChange={(event) =>
                        updateSelectedActionNode((current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                    />
                  </label>

                  {selectedActionUsesPhotoSource ? (
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Photo source
                      </span>
                      <select
                        className="h-10 w-full rounded border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100"
                        value={selectedActionNode.photoActionCollectionId ?? ""}
                        onChange={(event) =>
                          updateSelectedActionNode((current) => ({
                            ...current,
                            photoActionCollectionId: event.target.value.trim() || null,
                          }))
                        }
                      >
                        <option value="">/photos</option>
                        {photoCollectionOptions.map((collection) => (
                          <option key={collection.id} value={collection.id}>
                            Collection: {collection.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <p className="rounded border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-300">
                      This node does not need a photo source. When a warning is active it shows
                      the automatic warning layout, and the No Warning output continues the graph.
                    </p>
                  )}
                </div>
                <p className="mt-3 text-xs text-slate-400">{selectedCanvasAction.description}</p>
              </div>

              {renderConditionalSettings(
                selectedActionKind ?? "photo",
                "portrait-photo",
                selectedActionNode.portrait,
                (updater) =>
                  updateSelectedActionNode((current) => ({
                    ...current,
                    portrait: updater(current.portrait),
                  })),
              )}
            </>
          ) : null}
        </aside>
      </div>
    </section>
  );
};

export default PhotoRouterBlockEditor;
