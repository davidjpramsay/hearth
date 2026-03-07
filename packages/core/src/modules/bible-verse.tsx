import { useEffect, useMemo, useState } from "react";
import {
  bibleVerseModuleConfigSchema,
  bibleVerseModuleResponseSchema,
  type BibleVerseModuleConfig,
  type BibleVerseModuleResponse,
  type ModuleDefinition,
} from "@hearth/shared";

const DEFAULT_CONFIG = bibleVerseModuleConfigSchema.parse({});

const normalizeConfig = (config: unknown): BibleVerseModuleConfig => {
  const parsedConfig = bibleVerseModuleConfigSchema.safeParse(config);
  return parsedConfig.success ? parsedConfig.data : DEFAULT_CONFIG;
};

const emptyPayload = (): BibleVerseModuleResponse =>
  bibleVerseModuleResponseSchema.parse({
    generatedAt: new Date().toISOString(),
    verse: null,
    reference: null,
    sourceLabel: "Bible VOTD",
    warning: null,
  });

const loadVerse = async (
  instanceId: string,
  signal: AbortSignal,
): Promise<BibleVerseModuleResponse> => {
  const response = await fetch(
    `/api/modules/bible-verse/${encodeURIComponent(instanceId)}/today`,
    {
      method: "GET",
      signal,
    },
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message =
      payload && typeof payload.message === "string"
        ? payload.message
        : `Request failed (${response.status})`;
    throw new Error(message);
  }

  return bibleVerseModuleResponseSchema.parse(await response.json());
};

export const bibleVerseModule: ModuleDefinition<BibleVerseModuleConfig> = {
  id: "bible-verse",
  displayName: "Bible verse",
  defaultSize: { w: 4, h: 3 },
  configSchema: bibleVerseModuleConfigSchema,
  DashboardTile: ({ instanceId, config, isEditing }) => {
    const normalizedConfig = useMemo(() => normalizeConfig(config), [config]);
    const [payload, setPayload] = useState<BibleVerseModuleResponse>(() => emptyPayload());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      if (isEditing) {
        setLoading(false);
        setError(null);
        return;
      }

      let active = true;
      let abortController: AbortController | null = null;

      const refresh = async () => {
        abortController?.abort();
        abortController = new AbortController();

        try {
          const next = await loadVerse(instanceId, abortController.signal);
          if (!active) {
            return;
          }

          setPayload(next);
          setError(null);
        } catch (loadError) {
          if (!active || (loadError instanceof Error && loadError.name === "AbortError")) {
            return;
          }

          setError(loadError instanceof Error ? loadError.message : "Failed to load verse");
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      };

      void refresh();
      const timer = window.setInterval(
        () => {
          void refresh();
        },
        Math.max(300, normalizedConfig.refreshIntervalSeconds) * 1000,
      );

      return () => {
        active = false;
        window.clearInterval(timer);
        abortController?.abort();
      };
    }, [instanceId, isEditing, normalizedConfig.refreshIntervalSeconds]);

    if (isEditing) {
      return (
        <div className="flex h-full flex-col justify-center rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-3 text-slate-200">
          <p className="text-sm font-semibold text-slate-100">Bible verse preview</p>
          <p className="mt-2 text-xs text-slate-300">
            Refresh every {normalizedConfig.refreshIntervalSeconds}s
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Reference: {normalizedConfig.showReference ? "Shown" : "Hidden"}
          </p>
        </div>
      );
    }

    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-slate-700 bg-gradient-to-b from-slate-900 to-slate-950 p-3 text-slate-100">
        <p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">
          Verse of the day
        </p>

        {loading ? (
          <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-slate-300">
            Loading verse...
          </div>
        ) : null}

        {!loading && error ? (
          <div className="mt-2 flex min-h-0 flex-1 items-center justify-center rounded-md border border-rose-500/60 bg-rose-500/10 px-3 text-center text-xs text-rose-200">
            {error}
          </div>
        ) : null}

        {!loading && !error ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
            {payload.verse ? (
              <p className="mt-3 line-clamp-8 text-sm leading-relaxed text-slate-100">
                {payload.verse}
              </p>
            ) : null}

            {normalizedConfig.showReference && payload.reference ? (
              <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-cyan-200">
                {payload.reference}
              </p>
            ) : null}

            {payload.warning ? (
              <p className="mt-2 rounded border border-amber-500/50 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">
                {payload.warning}
              </p>
            ) : null}

            {normalizedConfig.showSource ? (
              <p className="mt-auto pt-2 text-[10px] uppercase tracking-wide text-slate-400">
                Source: {payload.sourceLabel}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  },
  SettingsPanel: ({ config, onChange }) => {
    const normalizedConfig = normalizeConfig(config);

    const applyPatch = (patch: Partial<BibleVerseModuleConfig>) => {
      onChange({
        ...normalizedConfig,
        ...patch,
      });
    };

    return (
      <div className="space-y-4 rounded-lg border border-slate-700 bg-slate-900 p-4 text-sm text-slate-200">
        <h3 className="text-base font-semibold">Bible verse settings</h3>

        <label className="block space-y-2">
          <span>Refresh interval (seconds)</span>
          <input
            className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
            type="number"
            min={300}
            max={86400}
            value={normalizedConfig.refreshIntervalSeconds}
            onChange={(event) =>
              applyPatch({
                refreshIntervalSeconds: Math.max(
                  300,
                  Math.min(86400, Number(event.target.value) || 300),
                ),
              })
            }
          />
        </label>

        <label className="flex items-center justify-between">
          <span>Show reference</span>
          <input
            type="checkbox"
            checked={normalizedConfig.showReference}
            onChange={(event) => applyPatch({ showReference: event.target.checked })}
          />
        </label>

        <label className="flex items-center justify-between">
          <span>Show source label</span>
          <input
            type="checkbox"
            checked={normalizedConfig.showSource}
            onChange={(event) => applyPatch({ showSource: event.target.checked })}
          />
        </label>
      </div>
    );
  },
};
