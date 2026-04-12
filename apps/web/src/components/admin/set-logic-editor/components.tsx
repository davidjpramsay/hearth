import {
  useEffect,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  BaseEdge,
  Handle,
  Position,
  getBezierPath,
  useUpdateNodeInternals,
  type EdgeProps,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import { weatherLocationSearchResponseSchema } from "@hearth/shared";
import { type LogicParamFieldDefinition, type LogicParams } from "../logicNodeRegistry";
import type { RouterNodeType, StepNodeType, TerminalNodeType } from "./shared";
import {
  GRAPH_ENDPOINT_HANDLE_SIZE,
  GRAPH_TARGET_HANDLE_HEIGHT,
  GRAPH_TARGET_HANDLE_WIDTH,
} from "./shared";

export const GRAPH_TEXT_INPUT_CLASS =
  "cursor-text h-10 w-full rounded border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100";
export const GRAPH_SELECT_INPUT_CLASS =
  "cursor-pointer h-10 w-full rounded border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100";
const GRAPH_CHECKBOX_CLASS = "cursor-pointer";

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
  const stopCanvasEventPropagation = (
    event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>,
  ) => {
    event.stopPropagation();
  };
  const stopResultButtonMouseDown = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  };

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
      setError(nextError instanceof Error ? nextError.message : "Failed to search locations.");
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
    <div
      className="rounded-xl border border-slate-700 bg-slate-950/50 p-3 md:col-span-2"
      onPointerDown={stopCanvasEventPropagation}
      onMouseDown={stopCanvasEventPropagation}
      onClick={stopCanvasEventPropagation}
    >
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {field.label}
        </span>
        <input
          type="text"
          value={locationValue}
          placeholder={field.placeholder}
          className={GRAPH_TEXT_INPUT_CLASS}
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
          Using pinned coordinates: {(latitudeValue as number).toFixed(4)},{" "}
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
              onMouseDown={stopResultButtonMouseDown}
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

export const ParamFieldEditor = ({
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
          className={GRAPH_CHECKBOX_CLASS}
          onChange={(event) => onPatch({ [field.key]: event.target.checked })}
        />
      </label>
    );
  }

  if (field.kind === "number") {
    const fallback = typeof field.min === "number" && Number.isFinite(field.min) ? field.min : 0;
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
          className={GRAPH_TEXT_INPUT_CLASS}
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
          className={GRAPH_SELECT_INPUT_CLASS}
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
        className={GRAPH_TEXT_INPUT_CLASS}
        onChange={(event) => onPatch({ [field.key]: event.target.value })}
      />
    </label>
  );
};

const RouterNode = ({ id, data, selected }: NodeProps<RouterNodeType>) => {
  const updateNodeInternals = useUpdateNodeInternals();
  const routeHandleKey = data.routes.map((route) => route.key).join("|");

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, routeHandleKey, updateNodeInternals]);

  return (
    <div
      onClick={() => data.onSelect?.()}
      className={`relative rounded-2xl border bg-slate-950/95 px-4 py-4 shadow-[0_0_0_1px_rgba(15,23,42,0.75)] ${
        selected ? "border-cyan-300 shadow-[0_0_0_2px_rgba(34,211,238,0.35)]" : "border-slate-700"
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="nodrag nopan !pointer-events-auto !border-0 !bg-transparent"
        isConnectable
        style={{
          top: -14,
          left: "50%",
          transform: "translateX(-50%)",
          width: GRAPH_TARGET_HANDLE_WIDTH,
          height: GRAPH_TARGET_HANDLE_HEIGHT,
          zIndex: 30,
          pointerEvents: "all",
          opacity: 0.001,
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-slate-950 bg-slate-300 shadow-sm"
      />
      <div
        className={`flex items-start justify-between gap-3 ${
          data.onRemove ? "hearth-graph-node-drag-handle cursor-grab active:cursor-grabbing" : ""
        }`}
      >
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

      <div
        className={`pointer-events-none mt-4 overflow-visible pb-4 grid gap-2 ${data.routes.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}
      >
        {data.routes.map((route) => (
          <div
            key={route.key}
            className={`pointer-events-none relative overflow-visible rounded-lg border px-3 py-2 text-sm ${route.borderClassName} ${route.bgClassName}`}
          >
            {route.connectable !== false ? (
              <Handle
                type="source"
                id={route.key}
                position={Position.Bottom}
                className="nodrag nopan !z-30 !pointer-events-auto !h-4 !w-4 !border-2 !border-slate-950"
                isConnectable
                style={{
                  bottom: -12,
                  left: "50%",
                  transform: "translateX(-50%)",
                  backgroundColor: route.color,
                  zIndex: 30,
                  pointerEvents: "all",
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
};

const LayoutNode = ({ data, selected }: NodeProps<StepNodeType>) => (
  <div
    onClick={() => data.onSelect?.()}
    className={`rounded-xl border bg-slate-950/95 px-4 py-3 shadow-[0_0_0_1px_rgba(15,23,42,0.75)] ${
      selected ? "border-cyan-300 shadow-[0_0_0_2px_rgba(34,211,238,0.35)]" : "border-slate-700"
    }`}
  >
    <Handle
      type="target"
      position={Position.Top}
      className="nodrag nopan !pointer-events-auto !border-0 !bg-transparent"
      style={{
        top: -14,
        left: "50%",
        transform: "translateX(-50%)",
        width: GRAPH_TARGET_HANDLE_WIDTH,
        height: GRAPH_TARGET_HANDLE_HEIGHT,
        zIndex: 30,
        pointerEvents: "all",
        opacity: 0.001,
      }}
    />
    <div
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 top-0 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-slate-950 bg-slate-300 shadow-sm"
    />
    <Handle
      type="source"
      id="next"
      position={Position.Bottom}
      className="nodrag nopan !pointer-events-auto !h-4 !w-4 !border-2 !border-slate-950 !bg-slate-300"
      style={{ bottom: -8, zIndex: 20, pointerEvents: "all" }}
    />

    <div className="hearth-graph-node-drag-handle flex cursor-grab items-start justify-between gap-3 active:cursor-grabbing">
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
        className="nodrag nopan !pointer-events-auto !border-0 !bg-transparent !opacity-0"
        style={{
          bottom: -10,
          width: GRAPH_ENDPOINT_HANDLE_SIZE,
          height: GRAPH_ENDPOINT_HANDLE_SIZE,
          zIndex: 30,
          pointerEvents: "all",
        }}
      />
    ) : (
      <Handle
        type="target"
        position={Position.Top}
        className="nodrag nopan !pointer-events-auto !border-0 !bg-transparent !opacity-0"
        style={{
          top: -10,
          width: GRAPH_ENDPOINT_HANDLE_SIZE,
          height: GRAPH_ENDPOINT_HANDLE_SIZE,
          zIndex: 30,
          pointerEvents: "all",
        }}
      />
    )}
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute left-1/2 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-slate-950 bg-slate-300 shadow-sm ${
        data.tone === "start" ? "-bottom-2" : "-top-2"
      }`}
    />
    <div>
      {data.tone === "end" ? (
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] opacity-75">
          {data.tone}
        </p>
      ) : null}
      <p className={`${data.tone === "end" ? "mt-1" : ""} text-base font-semibold`}>{data.title}</p>
    </div>
  </div>
);

export const CanvasControlButton = ({
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

export const FitViewIcon = () => (
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

export const LockIcon = ({ locked }: { locked: boolean }) => (
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
          strokeWidth: typeof style?.strokeWidth === "number" ? style.strokeWidth + 8 : 10,
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

export const nodeTypes: NodeTypes = {
  routerNode: RouterNode,
  layoutNode: LayoutNode,
  terminalNode: TerminalNode,
};

export const edgeTypes = {
  hearthEdge: GraphEdge,
};
