import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  choresBoardResponseSchema,
  choresModuleConfigSchema,
  choresModuleSummaryQuerySchema,
  choresPayoutConfigSchema,
  getMillisecondsUntilNextCalendarDateInTimeZone,
  toCalendarDateInTimeZone,
  type ChoreBoardItem,
  type ChoresBoardResponse,
  type ChoresModuleConfig,
} from "@hearth/shared";
import { defineModule } from "@hearth/module-sdk";
import {
  addDisplayTimeContextListener,
  getDisplayNow,
  getDisplaySiteTimeZone,
} from "../../runtime/display-time";
import {
  readPersistedModuleSnapshot,
  writePersistedModuleSnapshot,
} from "../data/persisted-module-snapshot";
import { ModulePresentationControls } from "../ui/ModulePresentationControls";
import { resolveModuleConnectivityState, useBrowserOnlineStatus } from "../data/connection-state";
import { ModuleConnectionBadge } from "../ui/ModuleConnectionBadge";
import { ModuleSkeleton } from "../ui/ModuleSkeleton";

const CHORES_SNAPSHOT_MAX_AGE_MS = 36 * 60 * 60 * 1000;

const localIsoDate = (timeZone: string, date: Date = getDisplayNow()): string =>
  toCalendarDateInTimeZone(date, timeZone);

const compareChoreItems = (left: ChoreBoardItem, right: ChoreBoardItem): number => {
  if (left.completed !== right.completed) {
    return Number(left.completed) - Number(right.completed);
  }

  return left.choreName.localeCompare(right.choreName);
};
const FALLBACK_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

const emptyBoard = (timeZone: string): ChoresBoardResponse =>
  choresBoardResponseSchema.parse({
    generatedAt: new Date().toISOString(),
    startDate: localIsoDate(timeZone),
    days: 1,
    payoutConfig: choresPayoutConfigSchema.parse({ siteTimezone: timeZone }),
    members: [],
    chores: [],
    board: [{ date: localIsoDate(timeZone), items: [] }],
    stats: {
      dailyCompletionRate: 0,
      weeklyCompletedCount: 0,
      weeklyTotalValue: 0,
      weeklyByMember: [],
    },
  });

const buildChoresSnapshotKey = (instanceId: string, enableMoneyTracking: boolean): string =>
  `chores:${instanceId}:${enableMoneyTracking ? "money" : "nomoney"}`;

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
): Promise<ChoresBoardResponse> => {
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

  return choresBoardResponseSchema.parse(await response.json());
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
    Component: ({ instanceId, settings, isEditing, presentationMode = "tile" }) => {
      const runtimeSiteTimeZone = getDisplaySiteTimeZone();
      const snapshotKey = useMemo(
        () => buildChoresSnapshotKey(instanceId, settings.enableMoneyTracking),
        [instanceId, settings.enableMoneyTracking],
      );
      const initialSnapshot = useMemo(
        () =>
          readPersistedModuleSnapshot({
            key: snapshotKey,
            parse: (storedPayload) => choresBoardResponseSchema.parse(storedPayload),
            maxAgeMs: CHORES_SNAPSHOT_MAX_AGE_MS,
            validate: (storedBoard) => storedBoard.startDate === localIsoDate(runtimeSiteTimeZone),
          }),
        [runtimeSiteTimeZone, snapshotKey],
      );
      const [siteTimeZone, setSiteTimeZone] = useState(
        () => initialSnapshot?.data.payoutConfig.siteTimezone ?? runtimeSiteTimeZone,
      );
      const [board, setBoard] = useState<ChoresBoardResponse>(
        () => initialSnapshot?.data ?? emptyBoard(runtimeSiteTimeZone),
      );
      const [loading, setLoading] = useState(() => initialSnapshot === null);
      const [error, setError] = useState<string | null>(null);
      const [savingKeys, setSavingKeys] = useState<string[]>([]);
      const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
      const [lastUpdatedMs, setLastUpdatedMs] = useState<number | null>(
        () => initialSnapshot?.updatedAtMs ?? null,
      );
      const boardRef = useRef(board);
      const loadRef = useRef<() => Promise<void>>(async () => undefined);
      const browserOnline = useBrowserOnlineStatus();
      const connectivityState = resolveModuleConnectivityState({
        error,
        hasSnapshot: lastUpdatedMs !== null,
        isOnline: browserOnline,
      });

      useEffect(() => {
        boardRef.current = board;
      }, [board]);

      useEffect(() => {
        if (!initialSnapshot) {
          return;
        }

        setBoard(initialSnapshot.data);
        setSiteTimeZone(initialSnapshot.data.payoutConfig.siteTimezone);
        setLastUpdatedMs(initialSnapshot.updatedAtMs);
        setLoading(false);
      }, [initialSnapshot]);

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

            const updatedAtMs = Date.now();
            setBoard(summary);
            setSiteTimeZone(summary.payoutConfig.siteTimezone);
            setLastUpdatedMs(updatedAtMs);
            setError(null);
            writePersistedModuleSnapshot(snapshotKey, summary, updatedAtMs);
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
        loadRef.current = load;

        const onChoresUpdated = () => {
          void load();
        };
        const onDisplayTimeUpdated = () => {
          const nextSiteTimeZone = getDisplaySiteTimeZone();
          setSiteTimeZone(nextSiteTimeZone);
          const expectedDate = localIsoDate(nextSiteTimeZone);
          if (boardRef.current.startDate !== expectedDate) {
            void load();
          }
        };
        const onVisibilityChange = () => {
          if (document.visibilityState === "visible") {
            void load();
          }
        };
        const onPageShow = () => {
          void load();
        };
        const onWindowFocus = () => {
          void load();
        };

        void load();
        const removeDisplayTimeListener = addDisplayTimeContextListener(() => {
          onDisplayTimeUpdated();
        });
        window.addEventListener("hearth:chores-updated", onChoresUpdated);
        document.addEventListener("visibilitychange", onVisibilityChange);
        window.addEventListener("pageshow", onPageShow);
        window.addEventListener("focus", onWindowFocus);
        const timer = window.setInterval(() => {
          void load();
        }, FALLBACK_REFRESH_INTERVAL_MS);

        return () => {
          active = false;
          removeDisplayTimeListener();
          window.removeEventListener("hearth:chores-updated", onChoresUpdated);
          document.removeEventListener("visibilitychange", onVisibilityChange);
          window.removeEventListener("pageshow", onPageShow);
          window.removeEventListener("focus", onWindowFocus);
          window.clearInterval(timer);
        };
      }, [instanceId, isEditing, snapshotKey]);

      useEffect(() => {
        if (isEditing) {
          return;
        }

        const delayMs =
          getMillisecondsUntilNextCalendarDateInTimeZone(getDisplayNow(), siteTimeZone) + 250;
        const timer = window.setTimeout(() => {
          void loadRef.current();
        }, delayMs);

        return () => {
          window.clearTimeout(timer);
        };
      }, [board.startDate, isEditing, siteTimeZone]);

      if (isEditing) {
        return (
          <div className="flex h-full flex-col justify-center rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-3 text-slate-200">
            <p className="module-copy-title text-slate-100">Chores preview</p>
            <p className="module-copy-meta mt-2 text-slate-300">Today-only display</p>
            <p className="module-copy-meta mt-1 text-slate-400">
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
      for (const [memberId, items] of todayItemsByMember) {
        todayItemsByMember.set(memberId, [...items].sort(compareChoreItems));
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
          const summary = await setCompletion(instanceId, {
            choreId: item.choreId,
            date: item.date,
            completed,
          });
          const updatedAtMs = Date.now();
          setBoard(summary);
          setSiteTimeZone(summary.payoutConfig.siteTimezone);
          setLastUpdatedMs(updatedAtMs);
          writePersistedModuleSnapshot(snapshotKey, summary, updatedAtMs);
        } catch (toggleError) {
          const summary = await fetchSummary(instanceId).catch(() => null);
          if (summary) {
            const updatedAtMs = Date.now();
            setBoard(summary);
            setSiteTimeZone(summary.payoutConfig.siteTimezone);
            setLastUpdatedMs(updatedAtMs);
            writePersistedModuleSnapshot(snapshotKey, summary, updatedAtMs);
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

      const activeMemberId = memberRows.some((member) => member.memberId === selectedMemberId)
        ? selectedMemberId
        : (memberRows[0]?.memberId ?? null);
      const activeMember = memberRows.find((member) => member.memberId === activeMemberId) ?? null;
      const visibleItems =
        activeMemberId === null ? [] : (todayItemsByMember.get(activeMemberId) ?? []);
      const activeCompletionPercent = activeMember
        ? Math.round(activeMember.completionRatio * 100)
        : 0;
      const memberAccents = ["#f27668", "#668bc2", "#dda427", "#8ca27b", "#9a7bb8"];

      return (
        <div
          className={`chores-module relative flex h-full min-h-0 flex-col overflow-hidden ${presentationMode === "focus" ? "chores-module--focus" : "chores-module--tile"}`}
        >
          <ModuleConnectionBadge
            visible={connectivityState.showDisconnected}
            title={connectivityState.disconnectedTitle ?? undefined}
            label={connectivityState.disconnectedLabel}
          />
          <header className="chores-module__heading">
            <div>
              <p className="module-copy-label">Today</p>
              <h2 className="module-copy-title">Chores</h2>
            </div>
            <div
              className="chores-module__total"
              aria-label={`${totalTodayCompleted} of ${todayItems.length} chores complete`}
            >
              <strong>{totalTodayCompleted}</strong>
              <span>/ {todayItems.length}</span>
            </div>
          </header>

          {loading ? <ModuleSkeleton variant="list" /> : null}
          {!loading && connectivityState.blockingError ? (
            <p className="module-copy-meta rounded border border-rose-500/60 bg-rose-500/10 px-2 py-1 text-rose-200">
              {connectivityState.blockingError}
            </p>
          ) : null}

          {!loading && !connectivityState.blockingError ? (
            <div className="chores-module__content">
              <div
                className="chores-module__members"
                role="tablist"
                aria-label="Choose a family member"
              >
                {memberRows.map((member, memberIndex) => {
                  const completionPercent = Math.round(member.completionRatio * 100);
                  const isSelected = member.memberId === activeMemberId;
                  const accent = memberAccents[memberIndex % memberAccents.length];
                  return (
                    <button
                      key={member.memberId}
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      className={isSelected ? "is-selected" : undefined}
                      style={{ "--chore-member-accent": accent } as CSSProperties}
                      onClick={() => setSelectedMemberId(member.memberId)}
                    >
                      <span className="chores-module__avatar">
                        {member.memberAvatarUrl ? (
                          <img src={member.memberAvatarUrl} alt="" />
                        ) : (
                          member.memberName.slice(0, 1).toUpperCase()
                        )}
                      </span>
                      <span className="chores-module__member-copy">
                        <strong>{member.memberName}</strong>
                        <small>{completionPercent}% this week</small>
                      </span>
                    </button>
                  );
                })}
              </div>

              {activeMember ? (
                <section className="chores-module__list" role="tabpanel">
                  <header>
                    <div>
                      <p className="module-copy-label">{activeMember.memberName}&apos;s list</p>
                      <p className="module-copy-body">Tap a chore when it&apos;s done.</p>
                    </div>
                    {settings.showStats ? (
                      <div className="chores-module__progress">
                        <div>
                          <strong>{activeCompletionPercent}%</strong>
                          <span>this week</span>
                        </div>
                        {settings.enableMoneyTracking ? (
                          <small>
                            Earned ${activeMember.basePayout.toFixed(2)} of $
                            {activeMember.baseAllowance.toFixed(2)}
                          </small>
                        ) : null}
                      </div>
                    ) : null}
                  </header>
                  <div className="chores-module__items">
                    {visibleItems.length > 0 ? (
                      visibleItems.map((item) => (
                        <label
                          key={itemKey(item)}
                          className={item.completed ? "is-complete" : undefined}
                        >
                          <input
                            type="checkbox"
                            checked={item.completed}
                            disabled={savingSet.has(itemKey(item))}
                            onChange={(event) =>
                              void onToggleCompletion(item, event.currentTarget.checked)
                            }
                          />
                          <span className="chores-module__check" aria-hidden>
                            {item.completed ? "✓" : ""}
                          </span>
                          <span className="chores-module__name">{item.choreName}</span>
                          {settings.enableMoneyTracking && item.valueAmount !== null ? (
                            <span className="chores-module__value">
                              ${item.valueAmount.toFixed(2)}
                            </span>
                          ) : null}
                        </label>
                      ))
                    ) : (
                      <p className="chores-module__empty">Nothing left for today. Nice work!</p>
                    )}
                  </div>
                </section>
              ) : null}
              {memberRows.length === 0 ? (
                <p className="chores-module__empty">No children configured yet.</p>
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
