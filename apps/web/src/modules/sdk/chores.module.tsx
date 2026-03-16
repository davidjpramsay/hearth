import { useEffect, useState } from "react";
import {
  choresBoardResponseSchema,
  choresModuleConfigSchema,
  choresModuleSummaryQuerySchema,
  choresPayoutConfigSchema,
  getRuntimeTimeZone,
  toCalendarDateInTimeZone,
  type ChoreBoardItem,
  type ChoresBoardResponse,
  type ChoresModuleConfig,
} from "@hearth/shared";
import { defineModule } from "@hearth/module-sdk";
import {
  ModulePresentationControls,
} from "../ui/ModulePresentationControls";
import {
  resolveModuleConnectivityState,
  useBrowserOnlineStatus,
} from "../data/connection-state";
import { ModuleConnectionBadge } from "../ui/ModuleConnectionBadge";

const localIsoDate = (date: Date = new Date()): string =>
  toCalendarDateInTimeZone(date, getRuntimeTimeZone());

const emptyBoard = (): ChoresBoardResponse =>
  choresBoardResponseSchema.parse({
    generatedAt: new Date().toISOString(),
    startDate: localIsoDate(),
    days: 1,
    payoutConfig: choresPayoutConfigSchema.parse({}),
    members: [],
    chores: [],
    board: [{ date: localIsoDate(), items: [] }],
    stats: {
      dailyCompletionRate: 0,
      weeklyCompletedCount: 0,
      weeklyTotalValue: 0,
      weeklyByMember: [],
    },
  });

const fetchSummary = async (
  instanceId: string,
  options: { startDate?: string } = {},
): Promise<ChoresBoardResponse> => {
  const query = choresModuleSummaryQuerySchema.parse(options);
  const params = new URLSearchParams();
  if (query.startDate) {
    params.set("startDate", query.startDate);
  }
  const queryString = params.toString();

  const response = await fetch(
    `/api/modules/chores/${encodeURIComponent(instanceId)}/summary${
      queryString.length > 0 ? `?${queryString}` : ""
    }`,
    {
      method: "GET",
      cache: "no-store",
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

  return choresBoardResponseSchema.parse(await response.json());
};

const setCompletion = async (
  instanceId: string,
  input: { choreId: number; date: string; completed: boolean },
): Promise<void> => {
  const response = await fetch(
    `/api/modules/chores/${encodeURIComponent(instanceId)}/completions`,
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
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
};

export const moduleDefinition = defineModule({
  manifest: {
    id: "chores",
    name: "Chores",
    version: "2.0.0",
    description: "Chores module migrated to Hearth Module SDK",
    icon: "check-square",
    defaultSize: { w: 6, h: 4 },
    timeMode: "site-local",
    categories: ["family", "tasks"],
    permissions: ["network"],
    dataSources: [{ id: "chores-summary", kind: "rest" }],
  },
  settingsSchema: choresModuleConfigSchema,
  dataSchema: choresBoardResponseSchema,
  runtime: {
    Component: ({ instanceId, settings, isEditing }) => {
      const [board, setBoard] = useState<ChoresBoardResponse>(emptyBoard);
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState<string | null>(null);
      const [savingKeys, setSavingKeys] = useState<string[]>([]);
      const [lastUpdatedMs, setLastUpdatedMs] = useState<number | null>(null);
      const browserOnline = useBrowserOnlineStatus();
      const connectivityState = resolveModuleConnectivityState({
        error,
        hasSnapshot: lastUpdatedMs !== null,
        isOnline: browserOnline,
      });

      useEffect(() => {
        if (isEditing) {
          setLoading(false);
          setError(null);
          return;
        }

        let active = true;

        const load = async () => {
          try {
            const summary = await fetchSummary(instanceId);
            if (!active) {
              return;
            }

            setBoard(summary);
            setLastUpdatedMs(Date.now());
            setError(null);
          } catch (loadError) {
            if (!active) {
              return;
            }

            setError(loadError instanceof Error ? loadError.message : "Failed to load chores");
          } finally {
            if (active) {
              setLoading(false);
            }
          }
        };

        const onChoresUpdated = () => {
          void load();
        };

        void load();
        window.addEventListener("hearth:chores-updated", onChoresUpdated);
        const timer = window.setInterval(() => {
          void load();
        }, 60_000);

        return () => {
          active = false;
          window.removeEventListener("hearth:chores-updated", onChoresUpdated);
          window.clearInterval(timer);
        };
      }, [instanceId, isEditing]);

      if (isEditing) {
        return (
          <div className="flex h-full flex-col justify-center rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-3 text-slate-200">
            <p className="module-text-title text-slate-100">
              Chores preview
            </p>
            <p className="module-text-small mt-2 text-slate-300">
              Preview days: {settings.previewDays}
            </p>
            <p className="module-text-small mt-1 text-slate-400">
              Stats: {settings.showStats ? "On" : "Off"} | Money:{" "}
              {settings.enableMoneyTracking ? "On" : "Off"}
            </p>
          </div>
        );
      }

      const today = board.board[0];
      const todayItems = today?.items ?? [];
      const itemKey = (item: Pick<ChoreBoardItem, "date" | "choreId">): string =>
        `${item.date}:${item.choreId}`;
      const savingSet = new Set(savingKeys);
      const totalTodayCompleted = todayItems.filter((item) => item.completed).length;
      const todayItemsByMember = new Map<number, ChoreBoardItem[]>();
      for (const item of todayItems) {
        const existing = todayItemsByMember.get(item.memberId) ?? [];
        existing.push(item);
        todayItemsByMember.set(item.memberId, existing);
      }

      const memberRows =
        board.stats.weeklyByMember.length > 0
          ? board.stats.weeklyByMember
          : board.members
              .map((member) => ({
                memberId: member.id,
                memberName: member.name,
                memberAvatarUrl: member.avatarUrl,
                completedCount: 0,
                totalValue: 0,
                recurringScheduledCount: 0,
                recurringCompletedCount: 0,
                completionRatio: 0,
                baseAllowance: member.weeklyAllowance,
                basePayout: 0,
                bonusPayout: 0,
                payoutTotal: 0,
              }))
              .sort((left, right) => left.memberName.localeCompare(right.memberName));

      const onToggleCompletion = async (item: ChoreBoardItem, completed: boolean) => {
        const key = itemKey(item);
        const previousBoard = board;
        setSavingKeys((current) => (current.includes(key) ? current : [...current, key]));
        setError(null);
        setBoard((current) => ({
          ...current,
          board: current.board.map((dayEntry, index) =>
            index !== 0
              ? dayEntry
              : {
                  ...dayEntry,
                  items: dayEntry.items.map((entry) =>
                    entry.choreId === item.choreId &&
                    entry.date === item.date &&
                    entry.memberId === item.memberId
                      ? { ...entry, completed }
                      : entry,
                  ),
                },
          ),
        }));

        try {
          await setCompletion(instanceId, {
            choreId: item.choreId,
            date: item.date,
            completed,
          });
          const summary = await fetchSummary(instanceId);
          setBoard(summary);
          setLastUpdatedMs(Date.now());
        } catch (toggleError) {
          const summary = await fetchSummary(instanceId).catch(() => null);
          if (summary) {
            setBoard(summary);
            setLastUpdatedMs(Date.now());
          } else {
            setBoard(previousBoard);
          }
          setError(
            toggleError instanceof Error ? toggleError.message : "Failed to update completion",
          );
        } finally {
          setSavingKeys((current) => current.filter((entry) => entry !== key));
        }
      };

      return (
        <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-950 p-2 text-slate-100">
          <ModuleConnectionBadge visible={connectivityState.showDisconnected} />
          <header className="mb-2 flex items-center justify-between rounded border border-slate-700 bg-slate-900/80 px-3 py-2">
            <p className="module-text-body font-semibold tracking-wide">
              Today&apos;s Chores
            </p>
            <p className="module-text-small text-slate-300">
              {`${totalTodayCompleted}/${todayItems.length}`}
            </p>
          </header>

          {loading ? (
            <p className="module-text-small text-slate-300">
              Loading chores...
            </p>
          ) : null}
          {!loading && connectivityState.blockingError ? (
            <p className="module-text-small rounded border border-rose-500/60 bg-rose-500/10 px-2 py-1 text-rose-200">
              {connectivityState.blockingError}
            </p>
          ) : null}

          {!loading && !connectivityState.blockingError ? (
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {memberRows.map((member) => {
                const memberItems = todayItemsByMember.get(member.memberId) ?? [];
                const completionPercent = Math.round(member.completionRatio * 100);
                const basePayEarned = member.baseAllowance * member.completionRatio;

                return (
                  <section
                    key={member.memberId}
                    className="rounded border border-slate-700 bg-slate-900/70"
                  >
                    <header className="flex items-center justify-between border-b border-slate-700 px-2 py-1.5">
                      <p className="module-text-body font-semibold text-slate-100">
                        {member.memberName}
                      </p>
                      <div
                        className="module-text-small flex items-center gap-2 font-display uppercase tracking-[0.18em] text-slate-300"
                      >
                        <span
                          className="rounded border border-cyan-500/40 bg-cyan-500/10 px-1.5 py-0.5 text-cyan-200"
                        >
                          Week {completionPercent}%
                        </span>
                        {settings.enableMoneyTracking ? (
                          <span
                            className="rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-200"
                          >
                            Pay ${basePayEarned.toFixed(2)} / ${member.baseAllowance.toFixed(2)}
                          </span>
                        ) : null}
                        {settings.enableMoneyTracking && member.bonusPayout > 0 ? (
                          <span
                            className="rounded border border-emerald-500/30 bg-emerald-500/5 px-1.5 py-0.5 text-emerald-100"
                          >
                            +${member.bonusPayout.toFixed(2)} bonus
                          </span>
                        ) : null}
                      </div>
                    </header>

                    <div className="space-y-1 px-2 py-1.5">
                      {memberItems.length > 0 ? (
                        memberItems.map((item) => (
                          <label
                            key={itemKey(item)}
                            className={`flex items-center gap-2 rounded border px-2 py-1 ${
                              item.completed
                                ? "border-emerald-500/60 bg-emerald-500/15"
                                : "border-slate-700 bg-slate-900/90"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={item.completed}
                              disabled={savingSet.has(itemKey(item))}
                              onChange={(event) =>
                                void onToggleCompletion(item, event.currentTarget.checked)
                              }
                              className="h-4 w-4 accent-cyan-500"
                            />
                            <span
                              className="module-text-small min-w-0 flex-1 font-medium text-slate-100"
                            >
                              {item.choreName}
                            </span>
                            {settings.enableMoneyTracking && item.valueAmount !== null ? (
                              <span
                                className="module-text-small font-display uppercase tracking-[0.18em] text-emerald-200"
                              >
                                ${item.valueAmount.toFixed(2)}
                              </span>
                            ) : null}
                          </label>
                        ))
                      ) : (
                        <p className="module-text-small rounded border border-slate-700 bg-slate-900/60 px-2 py-1 font-display uppercase tracking-[0.18em] text-slate-300">
                          No chores today.
                        </p>
                      )}
                    </div>
                  </section>
                );
              })}
              {memberRows.length === 0 ? (
                <p className="module-text-small rounded border border-slate-700 bg-slate-900/60 px-2 py-1 text-slate-300">
                  No children configured yet.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      );
    },
  },
  admin: {
    SettingsPanel: ({ settings, onChange }) => {
      const applyPatch = (patch: Partial<ChoresModuleConfig>) => {
        onChange({
          ...settings,
          ...patch,
        });
      };

      return (
        <div className="space-y-4 rounded-lg border border-slate-700 bg-slate-900 p-4 text-sm text-slate-200">
          <h3 className="text-base font-semibold">Chores settings</h3>

          <label className="flex items-center justify-between">
            <span>Enable money tracking</span>
            <input
              type="checkbox"
              checked={settings.enableMoneyTracking}
              onChange={(event) => applyPatch({ enableMoneyTracking: event.target.checked })}
            />
          </label>

          <label className="flex items-center justify-between">
            <span>Show stats</span>
            <input
              type="checkbox"
              checked={settings.showStats}
              onChange={(event) => applyPatch({ showStats: event.target.checked })}
            />
          </label>

          <label className="block space-y-2">
            <span>Preview days</span>
            <input
              className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
              type="number"
              min={0}
              max={14}
              value={settings.previewDays}
              onChange={(event) =>
                applyPatch({
                  previewDays: Math.max(0, Math.min(14, Number(event.target.value) || 0)),
                })
              }
            />
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
