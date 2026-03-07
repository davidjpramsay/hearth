import { useEffect, useRef, useState } from "react";
import {
  bibleVerseModuleConfigSchema,
  bibleVerseModuleResponseSchema,
  type BibleVerseModuleConfig,
  type BibleVerseModuleResponse,
} from "@hearth/shared";
import { defineModule } from "@hearth/module-sdk";

const emptyPayload = (): BibleVerseModuleResponse =>
  bibleVerseModuleResponseSchema.parse({
    generatedAt: new Date().toISOString(),
    verse: null,
    reference: null,
    sourceLabel: "Bible VOTD",
    warning: null,
  });

const AUTO_SCROLL_GAP_PX = 48;
const AUTO_SCROLL_SPEED_PX_PER_SECOND = 8;

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

export const moduleDefinition = defineModule({
  manifest: {
    id: "bible-verse",
    name: "Bible verse",
    version: "2.0.0",
    description: "Bible verse module migrated to Hearth Module SDK",
    icon: "book-open",
    defaultSize: { w: 4, h: 3 },
    categories: ["faith", "text"],
    permissions: ["network"],
    dataSources: [{ id: "verse-of-the-day", kind: "rest" }],
  },
  settingsSchema: bibleVerseModuleConfigSchema,
  dataSchema: bibleVerseModuleResponseSchema,
  runtime: {
    Component: ({ instanceId, settings, isEditing }) => {
      const [payload, setPayload] = useState<BibleVerseModuleResponse>(() => emptyPayload());
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState<string | null>(null);
      const verseViewportRef = useRef<HTMLDivElement | null>(null);
      const verseContentRef = useRef<HTMLDivElement | null>(null);
      const [shouldAutoScroll, setShouldAutoScroll] = useState(false);
      const [maxScrollOffset, setMaxScrollOffset] = useState(0);

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
          Math.max(300, settings.refreshIntervalSeconds) * 1000,
        );

        return () => {
          active = false;
          window.clearInterval(timer);
          abortController?.abort();
        };
      }, [instanceId, isEditing, settings.refreshIntervalSeconds]);

      useEffect(() => {
        const viewport = verseViewportRef.current;
        const content = verseContentRef.current;
        if (!viewport || !content || loading || Boolean(error) || !payload.verse) {
          setShouldAutoScroll(false);
          setMaxScrollOffset(0);
          return;
        }

        const measureOverflow = () => {
          const overflowAmount = Math.max(0, content.scrollHeight - viewport.clientHeight);
          const hasOverflow = overflowAmount > 6;
          setShouldAutoScroll(hasOverflow);
          setMaxScrollOffset(overflowAmount);
          if (!hasOverflow) {
            viewport.scrollTop = 0;
          } else {
            viewport.scrollTop = Math.min(viewport.scrollTop, overflowAmount);
          }
        };

        measureOverflow();

        const resizeObserver = new ResizeObserver(() => {
          measureOverflow();
        });
        resizeObserver.observe(viewport);
        resizeObserver.observe(content);

        return () => {
          resizeObserver.disconnect();
        };
      }, [
        payload.verse,
        loading,
        error,
        settings.showReference,
        settings.showSource,
        payload.warning,
      ]);

      useEffect(() => {
        if (!shouldAutoScroll || maxScrollOffset <= 0 || loading || Boolean(error)) {
          return;
        }

        const viewport = verseViewportRef.current;
        if (!viewport) {
          return;
        }

        let animationFrame = 0;
        let lastTickMs = 0;
        let currentScroll = 0;
        let pauseUntilMs = 0;
        let resetAfterPause = false;
        const topPauseMs = 700;
        const bottomPauseMs = 1100;

        viewport.scrollTop = 0;
        pauseUntilMs = performance.now() + topPauseMs;

        const animate = (timestampMs: number) => {
          const activeViewport = verseViewportRef.current;
          if (!activeViewport) {
            return;
          }

          if (lastTickMs === 0) {
            lastTickMs = timestampMs;
          }

          if (timestampMs >= pauseUntilMs) {
            if (resetAfterPause) {
              currentScroll = 0;
              activeViewport.scrollTop = 0;
              resetAfterPause = false;
              pauseUntilMs = timestampMs + topPauseMs;
              lastTickMs = timestampMs;
              animationFrame = window.requestAnimationFrame(animate);
              return;
            }

            const elapsedSeconds = (timestampMs - lastTickMs) / 1000;
            currentScroll += AUTO_SCROLL_SPEED_PX_PER_SECOND * elapsedSeconds;

            if (currentScroll >= maxScrollOffset) {
              currentScroll = maxScrollOffset;
              pauseUntilMs = timestampMs + bottomPauseMs;
              resetAfterPause = true;
            }

            activeViewport.scrollTop = currentScroll;
          }

          lastTickMs = timestampMs;
          animationFrame = window.requestAnimationFrame(animate);
        };

        animationFrame = window.requestAnimationFrame(animate);

        return () => {
          window.cancelAnimationFrame(animationFrame);
        };
      }, [shouldAutoScroll, maxScrollOffset, loading, error]);

      if (isEditing) {
        return (
          <div className="flex h-full flex-col justify-center rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-3 text-slate-200">
            <p className="text-sm font-semibold text-slate-100">Bible verse preview</p>
            <p className="mt-2 text-xs text-slate-300">
              Refresh every {settings.refreshIntervalSeconds}s
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Reference: {settings.showReference ? "Shown" : "Hidden"}
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
            <div className="mt-2 flex min-h-0 flex-1 flex-col">
              <div
                ref={verseViewportRef}
                className={`min-h-0 flex-1 pr-1 ${
                  shouldAutoScroll ? "overflow-hidden" : "flex items-center justify-center"
                }`}
              >
              <div ref={verseContentRef} className="w-full">
                  {payload.verse ? (
                    <p className="text-center text-sm leading-relaxed text-slate-100">
                      {payload.verse}
                    </p>
                  ) : (
                    <p className="text-center text-sm text-slate-300">No verse available.</p>
                  )}
                  {shouldAutoScroll ? (
                    <div
                      aria-hidden
                      style={{ height: `${AUTO_SCROLL_GAP_PX}px` }}
                    />
                  ) : null}
                </div>
              </div>

              <div className="mt-2 space-y-1 border-t border-slate-800/80 pt-2 text-center">
                {settings.showReference && payload.reference ? (
                  <p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">
                    {payload.reference}
                  </p>
                ) : null}

                {payload.warning ? (
                  <p className="rounded border border-amber-500/50 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">
                    {payload.warning}
                  </p>
                ) : null}

                {settings.showSource ? (
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">
                    Source: {payload.sourceLabel}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      );
    },
  },
  admin: {
    SettingsPanel: ({ settings, onChange }) => {
      const applyPatch = (patch: Partial<BibleVerseModuleConfig>) => {
        onChange({
          ...settings,
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
              value={settings.refreshIntervalSeconds}
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
              checked={settings.showReference}
              onChange={(event) => applyPatch({ showReference: event.target.checked })}
            />
          </label>

          <label className="flex items-center justify-between">
            <span>Show source label</span>
            <input
              type="checkbox"
              checked={settings.showSource}
              onChange={(event) => applyPatch({ showSource: event.target.checked })}
            />
          </label>

        </div>
      );
    },
  },
});

export default moduleDefinition;
