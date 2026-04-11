import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  createChoreItem,
  deleteChoreItem,
  getChoresDashboard,
  setChoreCompletion,
  updateChoresPayoutConfig,
  updateChoreItem,
} from "../api/client";
import { logoutAdminSession } from "../auth/session";
import { getAuthToken } from "../auth/storage";
import { useNavigate } from "react-router-dom";
import { AdminNavActions } from "../components/admin/AdminNavActions";
import { PageShell } from "../components/PageShell";
import { useModuleQuery } from "../modules/data/useModuleQuery";
import {
  getRuntimeTimeZone,
  toCalendarDateInTimeZone,
  type ChoreRecord,
  type ChoreSchedule,
  type ChoresBoardResponse,
  type ChoresDashboardResponse,
  type ChoresPayoutConfig,
} from "@hearth/shared";

type ChoreScheduleType = ChoreSchedule["type"];

interface ChoreFormState {
  id: number | null;
  name: string;
  memberId: string;
  scheduleType: ChoreScheduleType;
  weeklyDay: number;
  specificDays: number[];
  startsOn: string;
  oneOffDate: string;
  valueAmount: string;
  active: boolean;
}

const todayDate = (timeZone = getRuntimeTimeZone()): string =>
  toCalendarDateInTimeZone(new Date(), timeZone);

const dayLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const FALLBACK_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

const parseIsoDate = (value: string): Date => new Date(`${value}T00:00:00Z`);

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10);

const getWeekRangeForPayday = (
  referenceDate: string,
  paydayDayOfWeek: number,
): { startDate: string; endDate: string } => {
  const reference = parseIsoDate(referenceDate);
  const dayOfWeek = reference.getUTCDay();
  const weekStartDayOfWeek = (paydayDayOfWeek + 1) % 7;
  const offsetFromStart = (dayOfWeek - weekStartDayOfWeek + 7) % 7;
  const startDate = toIsoDate(addDays(reference, -offsetFromStart));
  const endDate = toIsoDate(addDays(parseIsoDate(startDate), 6));

  return {
    startDate,
    endDate,
  };
};

const clampIsoDateToRange = (
  date: string,
  range: { startDate: string; endDate: string },
): string => {
  if (date < range.startDate) {
    return range.startDate;
  }
  if (date > range.endDate) {
    return range.endDate;
  }
  return date;
};

const emptyChoreForm = (referenceDate: string): ChoreFormState => ({
  id: null,
  name: "",
  memberId: "",
  scheduleType: "daily",
  weeklyDay: 1,
  specificDays: [1],
  startsOn: referenceDate,
  oneOffDate: referenceDate,
  valueAmount: "",
  active: true,
});

const scheduleLabel = (chore: ChoreRecord): string => {
  switch (chore.schedule.type) {
    case "daily":
      return `Daily from ${formatDateLabel(chore.startsOn)}`;
    case "weekly":
      return `Weekly (${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][chore.schedule.dayOfWeek]}) from ${formatDateLabel(chore.startsOn)}`;
    case "specific-days":
      return `Specific (${chore.schedule.days
        .map((day) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day])
        .join(", ")}) from ${formatDateLabel(chore.startsOn)}`;
    case "one-off":
      return `One-off (${formatDateLabel(chore.schedule.date)})`;
    default:
      return "Unknown";
  }
};

const formatDateLabel = (date: string): string =>
  new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${date}T00:00:00`));

const formatWeekButtonDateLabel = (date: string): string =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(`${date}T00:00:00`));

export const AdminChoresPage = () => {
  const token = getAuthToken();
  const navigate = useNavigate();
  const [siteToday, setSiteToday] = useState(() => todayDate());
  const [selectedDate, setSelectedDate] = useState(() => todayDate());
  const [board, setBoard] = useState<ChoresBoardResponse | null>(null);
  const [members, setMembers] = useState<ChoresBoardResponse["members"]>([]);
  const [chores, setChores] = useState<ChoreRecord[]>([]);
  const [choreForm, setChoreForm] = useState<ChoreFormState>(() => emptyChoreForm(todayDate()));
  const [payoutConfig, setPayoutConfig] = useState<ChoresPayoutConfig>({
    mode: "all-or-nothing",
    oneOffBonusEnabled: true,
    paydayDayOfWeek: 6,
    siteTimezone: getRuntimeTimeZone(),
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const applyDashboardState = useCallback((snapshot: ChoresDashboardResponse) => {
    setMembers(snapshot.members);
    setChores(snapshot.chores);
    setPayoutConfig(snapshot.payoutConfig);
    setSiteToday(snapshot.siteToday);
    setBoard(snapshot.board);
    setSelectedDate((current) => clampIsoDateToRange(current, snapshot.selectableWeekRange));
  }, []);

  const choresQuery = useModuleQuery<ChoresDashboardResponse>({
    key: `admin-chores:${token ?? "anonymous"}`,
    enabled: Boolean(token),
    queryFn: async () => getChoresDashboard(token!),
    intervalMs: FALLBACK_REFRESH_INTERVAL_MS,
    staleMs: 0,
    eventSourceUrl: "/api/events/layouts",
    eventNames: ["chores-updated", "site-time-updated"],
  });
  const loading = choresQuery.loading && board === null;
  const activeError = error ?? choresQuery.error;

  useEffect(() => {
    if (!token) {
      navigate("/admin/login", { replace: true });
    }
  }, [navigate, token]);

  useEffect(() => {
    if (choresQuery.data) {
      applyDashboardState(choresQuery.data);
    }
  }, [applyDashboardState, choresQuery.data]);

  const currentWeekRange = useMemo(
    () => getWeekRangeForPayday(siteToday, payoutConfig.paydayDayOfWeek),
    [payoutConfig.paydayDayOfWeek, siteToday],
  );
  const selectableWeekRange = useMemo(
    () => ({
      startDate: currentWeekRange.startDate,
      endDate: currentWeekRange.endDate < siteToday ? currentWeekRange.endDate : siteToday,
    }),
    [currentWeekRange.endDate, currentWeekRange.startDate, siteToday],
  );
  const activeSelectedDate = clampIsoDateToRange(selectedDate, selectableWeekRange);

  useEffect(() => {
    if (selectedDate !== activeSelectedDate) {
      setSelectedDate(activeSelectedDate);
    }
  }, [activeSelectedDate, selectedDate]);

  const boardEntriesByDate = useMemo(
    () => new Map((board?.board ?? []).map((entry) => [entry.date, entry])),
    [board],
  );
  const choresOnSelectedDay = useMemo(
    () => boardEntriesByDate.get(activeSelectedDate)?.items ?? [],
    [activeSelectedDate, boardEntriesByDate],
  );
  const weekDayButtons = useMemo(
    () =>
      Array.from({ length: 7 }, (_entry, index) => {
        const date = toIsoDate(addDays(parseIsoDate(currentWeekRange.startDate), index));
        const items = boardEntriesByDate.get(date)?.items ?? [];
        const completedCount = items.filter((item) => item.completed).length;

        return {
          date,
          label: dayLabels[parseIsoDate(date).getUTCDay()] ?? formatDateLabel(date),
          shortDate: formatWeekButtonDateLabel(date),
          completedCount,
          totalCount: items.length,
          hasOccurred: date <= selectableWeekRange.endDate,
          isSelected: date === activeSelectedDate,
        };
      }),
    [
      activeSelectedDate,
      boardEntriesByDate,
      currentWeekRange.startDate,
      selectableWeekRange.endDate,
    ],
  );

  const onLogout = () => {
    logoutAdminSession();
  };

  const buildSchedule = (): ChoreSchedule => {
    if (choreForm.scheduleType === "daily") {
      return { type: "daily" };
    }

    if (choreForm.scheduleType === "weekly") {
      return { type: "weekly", dayOfWeek: choreForm.weeklyDay };
    }

    if (choreForm.scheduleType === "specific-days") {
      const days = choreForm.specificDays.length > 0 ? choreForm.specificDays : [1];
      return { type: "specific-days", days };
    }

    return { type: "one-off", date: choreForm.oneOffDate || siteToday };
  };

  const loadChoreIntoForm = (chore: ChoreRecord) => {
    const nextForm = emptyChoreForm(siteToday);
    nextForm.id = chore.id;
    nextForm.name = chore.name;
    nextForm.memberId = String(chore.memberId);
    nextForm.active = chore.active;
    nextForm.valueAmount = chore.valueAmount !== null ? String(chore.valueAmount) : "";
    nextForm.scheduleType = chore.schedule.type;
    nextForm.startsOn = chore.startsOn;

    if (chore.schedule.type === "weekly") {
      nextForm.weeklyDay = chore.schedule.dayOfWeek;
    } else if (chore.schedule.type === "specific-days") {
      nextForm.specificDays = chore.schedule.days;
    } else if (chore.schedule.type === "one-off") {
      nextForm.oneOffDate = chore.schedule.date;
    }

    setChoreForm(nextForm);
  };

  const savePayoutConfig = async (changes: Partial<ChoresPayoutConfig>) => {
    if (!token) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const updated = await updateChoresPayoutConfig(token, {
        ...payoutConfig,
        ...changes,
      });
      setPayoutConfig(updated);
      await choresQuery.revalidate();
    } catch (configError) {
      setError(
        configError instanceof Error ? configError.message : "Failed to update chores settings",
      );
    } finally {
      setBusy(false);
    }
  };

  const onSubmitChore = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) {
      return;
    }

    if (!choreForm.memberId) {
      setError("Select a child before creating a chore.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const startsOn =
        choreForm.scheduleType === "one-off"
          ? choreForm.oneOffDate || siteToday
          : choreForm.startsOn || siteToday;
      const payload = {
        name: choreForm.name,
        memberId: Number(choreForm.memberId),
        schedule: buildSchedule(),
        startsOn,
        valueAmount: choreForm.valueAmount.trim() ? Number(choreForm.valueAmount) : null,
        active: choreForm.active,
      };

      if (choreForm.id === null) {
        await createChoreItem(token, payload);
      } else {
        await updateChoreItem(token, choreForm.id, payload);
      }

      setChoreForm(emptyChoreForm(siteToday));
      await choresQuery.revalidate();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save chore");
    } finally {
      setBusy(false);
    }
  };

  const onToggleCompletion = async (choreId: number, completed: boolean) => {
    if (!token) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      applyDashboardState(
        await setChoreCompletion(token, {
          choreId,
          date: activeSelectedDate,
          completed,
        }),
      );
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Failed to update completion");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell
      title="Chores"
      subtitle="Manage chores, completions, and weekly payout totals for the shared children list."
      rightActions={<AdminNavActions current="chores" onLogout={onLogout} />}
    >
      {activeError ? (
        <p className="mb-4 rounded border border-rose-500/70 bg-rose-500/10 px-3 py-2 text-rose-200">
          {activeError}
        </p>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">Shared children</h2>
              <p className="mt-1 text-sm text-slate-300">
                Child names and allowances are now managed in Admin &gt; Children.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate("/children")}
              className="rounded-lg border border-cyan-400/60 px-3 py-2 text-sm font-semibold text-cyan-100 hover:border-cyan-300"
            >
              Open Children
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between rounded border border-slate-700 bg-slate-950/70 px-3 py-2"
              >
                <div>
                  <p className="font-semibold text-slate-100">{member.name}</p>
                  <p className="text-xs text-slate-300">
                    Weekly allowance: ${member.weeklyAllowance.toFixed(2)}
                  </p>
                  {member.avatarUrl ? (
                    <p className="text-xs text-slate-300">{member.avatarUrl}</p>
                  ) : null}
                </div>
                <span className="text-xs text-slate-400">Used in chores and school</span>
              </div>
            ))}
            {members.length === 0 ? (
              <p className="rounded border border-slate-700 bg-slate-950/50 px-3 py-3 text-sm text-slate-300">
                Add a child in Admin &gt; Children before creating chores.
              </p>
            ) : null}
          </div>
        </article>

        <article className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
          <h2 className="mb-3 text-lg font-semibold text-slate-100">
            {choreForm.id === null ? "Add chore" : "Edit chore"}
          </h2>
          <form onSubmit={onSubmitChore} className="space-y-3">
            <label className="block space-y-1">
              <span className="text-sm text-slate-300">Chore name</span>
              <input
                required
                className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
                value={choreForm.name}
                onChange={(event) =>
                  setChoreForm((current) => ({ ...current, name: event.target.value }))
                }
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-slate-300">Assigned to</span>
              <select
                required
                className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
                value={choreForm.memberId}
                onChange={(event) =>
                  setChoreForm((current) => ({ ...current, memberId: event.target.value }))
                }
              >
                <option value="">Select child</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-sm text-slate-300">Schedule type</span>
              <select
                className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
                value={choreForm.scheduleType}
                onChange={(event) =>
                  setChoreForm((current) => ({
                    ...current,
                    scheduleType: event.target.value as ChoreScheduleType,
                  }))
                }
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="specific-days">Specific days</option>
                <option value="one-off">One-off date</option>
              </select>
            </label>

            {choreForm.scheduleType === "weekly" ? (
              <label className="block space-y-1">
                <span className="text-sm text-slate-300">Day of week</span>
                <select
                  className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
                  value={choreForm.weeklyDay}
                  onChange={(event) =>
                    setChoreForm((current) => ({
                      ...current,
                      weeklyDay: Number(event.target.value),
                    }))
                  }
                >
                  {[
                    "Sunday",
                    "Monday",
                    "Tuesday",
                    "Wednesday",
                    "Thursday",
                    "Friday",
                    "Saturday",
                  ].map((label, index) => (
                    <option key={label} value={index}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {choreForm.scheduleType === "specific-days" ? (
              <div className="space-y-1">
                <span className="text-sm text-slate-300">Days</span>
                <div className="grid grid-cols-2 gap-2">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label, index) => (
                    <label key={label} className="flex items-center gap-2 text-sm text-slate-200">
                      <input
                        type="checkbox"
                        checked={choreForm.specificDays.includes(index)}
                        onChange={(event) =>
                          setChoreForm((current) => ({
                            ...current,
                            specificDays: event.target.checked
                              ? Array.from(new Set([...current.specificDays, index])).sort(
                                  (left, right) => left - right,
                                )
                              : current.specificDays.filter((day) => day !== index),
                          }))
                        }
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            {choreForm.scheduleType === "one-off" ? (
              <label className="block space-y-1">
                <span className="text-sm text-slate-300">Date</span>
                <input
                  type="date"
                  className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
                  value={choreForm.oneOffDate}
                  onChange={(event) =>
                    setChoreForm((current) => ({ ...current, oneOffDate: event.target.value }))
                  }
                />
              </label>
            ) : null}

            {choreForm.scheduleType !== "one-off" ? (
              <label className="block space-y-1">
                <span className="text-sm text-slate-300">Starts on</span>
                <input
                  type="date"
                  className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
                  value={choreForm.startsOn}
                  onChange={(event) =>
                    setChoreForm((current) => ({ ...current, startsOn: event.target.value }))
                  }
                />
                <p className="text-xs text-slate-400">
                  Recurring chores only appear from this household date onward.
                </p>
              </label>
            ) : null}

            <label className="block space-y-1">
              <span className="text-sm text-slate-300">Money value (optional)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
                value={choreForm.valueAmount}
                onChange={(event) =>
                  setChoreForm((current) => ({ ...current, valueAmount: event.target.value }))
                }
              />
            </label>

            <label className="flex items-center justify-between text-sm text-slate-200">
              <span>Active</span>
              <input
                type="checkbox"
                checked={choreForm.active}
                onChange={(event) =>
                  setChoreForm((current) => ({ ...current, active: event.target.checked }))
                }
              />
            </label>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy}
                className="rounded bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-60"
              >
                {choreForm.id === null ? "Create chore" : "Save chore"}
              </button>
              {choreForm.id !== null ? (
                <button
                  type="button"
                  onClick={() => setChoreForm(emptyChoreForm(siteToday))}
                  className="rounded border border-slate-500 px-3 py-2 text-sm font-semibold text-slate-100 hover:border-slate-300"
                >
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>
        </article>
      </section>

      <section className="mt-4 rounded-xl border border-slate-700 bg-slate-900/70 p-4">
        <h2 className="mb-3 text-lg font-semibold text-slate-100">Chore list</h2>
        <div className="space-y-2">
          {chores.map((chore) => (
            <div
              key={chore.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-700 bg-slate-950/70 px-3 py-2"
            >
              <div>
                <p className="font-semibold text-slate-100">{chore.name}</p>
                <p className="text-xs text-slate-300">
                  {members.find((member) => member.id === chore.memberId)?.name ?? "Unknown child"}{" "}
                  | {scheduleLabel(chore)}
                  {chore.valueAmount !== null ? ` | $${chore.valueAmount.toFixed(2)}` : ""}
                  {!chore.active ? " | Inactive" : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => loadChoreIntoForm(chore)}
                  className="rounded border border-slate-500 px-2 py-1 text-xs text-slate-200 hover:border-slate-300"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!token) {
                      return;
                    }
                    setBusy(true);
                    try {
                      await deleteChoreItem(token, chore.id);
                      if (choreForm.id === chore.id) {
                        setChoreForm(emptyChoreForm(siteToday));
                      }
                      await choresQuery.revalidate();
                    } catch (deleteError) {
                      setError(
                        deleteError instanceof Error
                          ? deleteError.message
                          : "Failed to delete chore",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="rounded border border-rose-500/70 px-2 py-1 text-xs text-rose-200 hover:bg-rose-500/20"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          {chores.length === 0 ? (
            <p className="text-sm text-slate-300">No chores created yet.</p>
          ) : null}
        </div>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <article className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
          <div className="mb-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-100">Completion tracker</h2>
              <p className="text-sm text-slate-300">
                {formatDateLabel(currentWeekRange.startDate)} to{" "}
                {formatDateLabel(currentWeekRange.endDate)}
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-7">
              {weekDayButtons.map((day) => (
                <button
                  key={day.date}
                  type="button"
                  disabled={!day.hasOccurred}
                  onClick={() => setSelectedDate(day.date)}
                  className={`rounded-lg border px-3 py-2 text-left transition ${
                    day.isSelected
                      ? "border-cyan-500 bg-cyan-500/15 text-cyan-100"
                      : day.hasOccurred
                        ? "border-slate-700 bg-slate-950/70 text-slate-100 hover:border-slate-500"
                        : "cursor-not-allowed border-slate-800 bg-slate-950/30 text-slate-500 opacity-60"
                  }`}
                >
                  <p className="text-sm font-semibold">{day.label}</p>
                  <p
                    className={`text-xs ${
                      day.isSelected
                        ? "text-cyan-100/80"
                        : day.hasOccurred
                          ? "text-slate-400"
                          : "text-slate-500"
                    }`}
                  >
                    {day.shortDate}
                  </p>
                  <p
                    className={`mt-1 text-[11px] ${
                      day.isSelected
                        ? "text-cyan-100/80"
                        : day.hasOccurred
                          ? "text-slate-400"
                          : "text-slate-500"
                    }`}
                  >
                    {day.hasOccurred
                      ? `${day.completedCount}/${day.totalCount} complete`
                      : "Upcoming"}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {loading ? <p className="text-sm text-slate-300">Loading day...</p> : null}
          {!loading ? (
            <div className="space-y-2">
              {choresOnSelectedDay.map((item) => (
                <label
                  key={`${item.date}-${item.choreId}`}
                  className="flex items-center justify-between rounded border border-slate-700 bg-slate-950/70 px-3 py-2"
                >
                  <div>
                    <p className="font-semibold text-slate-100">{item.choreName}</p>
                    <p className="text-xs text-slate-300">
                      {item.memberName}
                      {item.valueAmount !== null ? ` | $${item.valueAmount.toFixed(2)}` : ""}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={item.completed}
                    onChange={(event) => {
                      void onToggleCompletion(item.choreId, event.target.checked);
                    }}
                  />
                </label>
              ))}
              {choresOnSelectedDay.length === 0 ? (
                <p className="text-sm text-slate-300">
                  No chores scheduled for {formatDateLabel(activeSelectedDate)}.
                </p>
              ) : null}
            </div>
          ) : null}
        </article>

        <article className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
          <h2 className="mb-3 text-lg font-semibold text-slate-100">Weekly payout (per child)</h2>
          <div className="mb-3 rounded border border-slate-700 bg-slate-950/70 px-3 py-2">
            <label className="block space-y-1">
              <span className="text-sm text-slate-300">Allowance rule</span>
              <select
                className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100"
                value={payoutConfig.mode}
                onChange={(event) => {
                  void savePayoutConfig({
                    mode: event.target.value as ChoresPayoutConfig["mode"],
                  });
                }}
              >
                <option value="all-or-nothing">Full allowance at 100%</option>
                <option value="proportional">Proportional to completion</option>
              </select>
            </label>
            <label className="mt-2 flex items-center justify-between text-sm text-slate-200">
              <span>One-off chores pay bonus</span>
              <input
                type="checkbox"
                checked={payoutConfig.oneOffBonusEnabled}
                onChange={(event) => {
                  void savePayoutConfig({
                    oneOffBonusEnabled: event.target.checked,
                  });
                }}
              />
            </label>
            <label className="mt-2 block space-y-1">
              <span className="text-sm text-slate-300">Payday</span>
              <select
                className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100"
                value={payoutConfig.paydayDayOfWeek}
                onChange={(event) => {
                  void savePayoutConfig({
                    paydayDayOfWeek: Number(event.target.value),
                  });
                }}
              >
                {dayLabels.map((label, index) => (
                  <option key={label} value={index}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-2 space-y-2">
              <p className="text-sm text-slate-300">
                Timezone:{" "}
                <span className="font-semibold text-slate-100">{payoutConfig.siteTimezone}</span>
              </p>
              <button
                type="button"
                onClick={() => navigate("/devices")}
                className="rounded border border-slate-500 px-2 py-1 text-xs text-slate-200 hover:border-slate-300"
              >
                Settings
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-300">
              Week: {formatDateLabel(currentWeekRange.startDate)} to{" "}
              {formatDateLabel(currentWeekRange.endDate)}. Resets after payday.
            </p>
          </div>
          <p className="mb-2 text-sm text-slate-300">
            This week: {board?.stats.weeklyCompletedCount ?? 0} completed
          </p>

          <div className="space-y-2">
            {(board?.stats.weeklyByMember ?? []).map((entry) => (
              <div
                key={entry.memberId}
                className="rounded border border-slate-700 bg-slate-950/70 px-3 py-2"
              >
                <p className="font-semibold text-slate-100">{entry.memberName}</p>
                <p className="text-xs text-slate-300">
                  Recurring completion: {entry.recurringCompletedCount}/
                  {entry.recurringScheduledCount} ({(entry.completionRatio * 100).toFixed(0)}%)
                </p>
                <p className="text-xs text-slate-300">
                  Allowance payout: ${entry.basePayout.toFixed(2)} / $
                  {entry.baseAllowance.toFixed(2)}
                </p>
                <p className="text-xs text-slate-300">
                  Bonus payout: ${entry.bonusPayout.toFixed(2)} | Total: $
                  {entry.payoutTotal.toFixed(2)}
                </p>
              </div>
            ))}
            {(board?.stats.weeklyByMember.length ?? 0) === 0 ? (
              <p className="text-sm text-slate-300">No child payouts yet this week.</p>
            ) : null}
          </div>
        </article>
      </section>
    </PageShell>
  );
};
