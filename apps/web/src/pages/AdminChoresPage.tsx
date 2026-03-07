import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  createChoreItem,
  createChoreMember,
  deleteChoreItem,
  deleteChoreMember,
  getChoreBoard,
  getChoreItems,
  getChoreMembers,
  getChoresPayoutConfig,
  setChoreCompletion,
  updateChoresPayoutConfig,
  updateChoreItem,
  updateChoreMember,
} from "../api/client";
import { clearAuthToken, getAuthToken } from "../auth/storage";
import { useNavigate } from "react-router-dom";
import { PageShell } from "../components/PageShell";
import type {
  ChoreRecord,
  ChoreSchedule,
  ChoresBoardResponse,
  ChoresPayoutConfig,
} from "@hearth/shared";

type ChoreScheduleType = ChoreSchedule["type"];

interface MemberFormState {
  id: number | null;
  name: string;
  avatarUrl: string;
  weeklyAllowance: string;
}

interface ChoreFormState {
  id: number | null;
  name: string;
  memberId: string;
  scheduleType: ChoreScheduleType;
  weeklyDay: number;
  specificDays: number[];
  oneOffDate: string;
  valueAmount: string;
  active: boolean;
}

const todayDate = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const dayLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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

const clampIsoDateToRange = (date: string, range: { startDate: string; endDate: string }): string => {
  if (date < range.startDate) {
    return range.startDate;
  }
  if (date > range.endDate) {
    return range.endDate;
  }
  return date;
};

const emptyMemberForm = (): MemberFormState => ({
  id: null,
  name: "",
  avatarUrl: "",
  weeklyAllowance: "0",
});

const emptyChoreForm = (): ChoreFormState => ({
  id: null,
  name: "",
  memberId: "",
  scheduleType: "daily",
  weeklyDay: 1,
  specificDays: [1],
  oneOffDate: todayDate(),
  valueAmount: "",
  active: true,
});

const scheduleLabel = (schedule: ChoreSchedule): string => {
  switch (schedule.type) {
    case "daily":
      return "Daily";
    case "weekly":
      return `Weekly (${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][schedule.dayOfWeek]})`;
    case "specific-days":
      return `Specific (${schedule.days
        .map((day) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day])
        .join(", ")})`;
    case "one-off":
      return `One-off (${schedule.date})`;
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

export const AdminChoresPage = () => {
  const token = getAuthToken();
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(todayDate());
  const [board, setBoard] = useState<ChoresBoardResponse | null>(null);
  const [members, setMembers] = useState<ChoresBoardResponse["members"]>([]);
  const [chores, setChores] = useState<ChoreRecord[]>([]);
  const [memberForm, setMemberForm] = useState<MemberFormState>(emptyMemberForm);
  const [choreForm, setChoreForm] = useState<ChoreFormState>(emptyChoreForm);
  const [payoutConfig, setPayoutConfig] = useState<ChoresPayoutConfig>({
    mode: "all-or-nothing",
    oneOffBonusEnabled: true,
    paydayDayOfWeek: 6,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadData = useCallback(async () => {
    if (!token) {
      navigate("/admin/login", { replace: true });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [nextMembers, nextChores, nextPayoutConfig] = await Promise.all([
        getChoreMembers(token),
        getChoreItems(token),
        getChoresPayoutConfig(token),
      ]);
      const weekRange = getWeekRangeForPayday(todayDate(), nextPayoutConfig.paydayDayOfWeek);
      const nextBoard = await getChoreBoard(token, { startDate: weekRange.startDate, days: 7 });

      setMembers(nextMembers);
      setChores(nextChores);
      setPayoutConfig(nextPayoutConfig);
      setBoard(nextBoard);
      setSelectedDate((current) => clampIsoDateToRange(current, weekRange));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load chores");
    } finally {
      setLoading(false);
    }
  }, [navigate, token]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const eventSource = new EventSource("/api/events/layouts");
    const handleUpdate = () => {
      void loadData();
    };

    eventSource.addEventListener("chores-updated", handleUpdate);

    return () => {
      eventSource.removeEventListener("chores-updated", handleUpdate);
      eventSource.close();
    };
  }, [loadData, token]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadData();
    }, 60_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [loadData]);

  const currentWeekRange = useMemo(
    () => getWeekRangeForPayday(todayDate(), payoutConfig.paydayDayOfWeek),
    [payoutConfig.paydayDayOfWeek, board?.generatedAt],
  );
  const activeSelectedDate = clampIsoDateToRange(selectedDate, currentWeekRange);

  useEffect(() => {
    if (selectedDate !== activeSelectedDate) {
      setSelectedDate(activeSelectedDate);
    }
  }, [activeSelectedDate, selectedDate]);

  const choresOnSelectedDay = useMemo(
    () => board?.board.find((entry) => entry.date === activeSelectedDate)?.items ?? [],
    [activeSelectedDate, board],
  );

  const onLogout = () => {
    clearAuthToken();
    navigate("/admin/login", { replace: true });
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

    return { type: "one-off", date: choreForm.oneOffDate || todayDate() };
  };

  const loadChoreIntoForm = (chore: ChoreRecord) => {
    const nextForm = emptyChoreForm();
    nextForm.id = chore.id;
    nextForm.name = chore.name;
    nextForm.memberId = String(chore.memberId);
    nextForm.active = chore.active;
    nextForm.valueAmount = chore.valueAmount !== null ? String(chore.valueAmount) : "";
    nextForm.scheduleType = chore.schedule.type;

    if (chore.schedule.type === "weekly") {
      nextForm.weeklyDay = chore.schedule.dayOfWeek;
    } else if (chore.schedule.type === "specific-days") {
      nextForm.specificDays = chore.schedule.days;
    } else if (chore.schedule.type === "one-off") {
      nextForm.oneOffDate = chore.schedule.date;
    }

    setChoreForm(nextForm);
  };

  const onSubmitMember = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const weeklyAllowance = Math.max(0, Number(memberForm.weeklyAllowance) || 0);
      if (memberForm.id === null) {
        await createChoreMember(token, {
          name: memberForm.name,
          avatarUrl: memberForm.avatarUrl || null,
          weeklyAllowance,
        });
      } else {
        await updateChoreMember(token, memberForm.id, {
          name: memberForm.name,
          avatarUrl: memberForm.avatarUrl || null,
          weeklyAllowance,
        });
      }

      setMemberForm(emptyMemberForm());
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save child");
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
      const payload = {
        name: choreForm.name,
        memberId: Number(choreForm.memberId),
        schedule: buildSchedule(),
        valueAmount: choreForm.valueAmount.trim() ? Number(choreForm.valueAmount) : null,
        active: choreForm.active,
      };

      if (choreForm.id === null) {
        await createChoreItem(token, payload);
      } else {
        await updateChoreItem(token, choreForm.id, payload);
      }

      setChoreForm(emptyChoreForm());
      await loadData();
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
      await setChoreCompletion(token, {
        choreId,
        date: activeSelectedDate,
        completed,
      });
      await loadData();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Failed to update completion");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell
      title="Chores"
      subtitle="Manage children, schedules, completions, and weekly payout totals."
      rightActions={
        <>
          <button
            type="button"
            onClick={() => navigate("/admin/layouts")}
            className="rounded-lg border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-200 hover:border-slate-400"
          >
            Layouts
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-lg border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-200 hover:border-slate-400"
          >
            Logout
          </button>
        </>
      }
    >
      {error ? (
        <p className="mb-4 rounded border border-rose-500/70 bg-rose-500/10 px-3 py-2 text-rose-200">
          {error}
        </p>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
          <h2 className="mb-3 text-lg font-semibold text-slate-100">
            {memberForm.id === null ? "Add child" : "Edit child"}
          </h2>
          <form onSubmit={onSubmitMember} className="space-y-3">
            <label className="block space-y-1">
              <span className="text-sm text-slate-300">Name</span>
              <input
                required
                className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
                value={memberForm.name}
                onChange={(event) =>
                  setMemberForm((current) => ({ ...current, name: event.target.value }))
                }
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-slate-300">Avatar URL (optional)</span>
              <input
                className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
                value={memberForm.avatarUrl}
                onChange={(event) =>
                  setMemberForm((current) => ({ ...current, avatarUrl: event.target.value }))
                }
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-slate-300">Weekly allowance ($)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
                value={memberForm.weeklyAllowance}
                onChange={(event) =>
                  setMemberForm((current) => ({
                    ...current,
                    weeklyAllowance: event.target.value,
                  }))
                }
              />
            </label>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy}
                className="rounded bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-60"
              >
                {memberForm.id === null ? "Create child" : "Save child"}
              </button>
              {memberForm.id !== null ? (
                <button
                  type="button"
                  onClick={() => setMemberForm(emptyMemberForm())}
                  className="rounded border border-slate-500 px-3 py-2 text-sm font-semibold text-slate-100 hover:border-slate-300"
                >
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>

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
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setMemberForm({
                        id: member.id,
                        name: member.name,
                        avatarUrl: member.avatarUrl ?? "",
                        weeklyAllowance: String(member.weeklyAllowance),
                      })
                    }
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
                        await deleteChoreMember(token, member.id);
                        if (memberForm.id === member.id) {
                          setMemberForm(emptyMemberForm());
                        }
                        await loadData();
                      } catch (deleteError) {
                        setError(
                          deleteError instanceof Error
                            ? deleteError.message
                            : "Failed to delete member",
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
                  {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map(
                    (label, index) => (
                      <option key={label} value={index}>
                        {label}
                      </option>
                    ),
                  )}
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
                  onClick={() => setChoreForm(emptyChoreForm())}
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
                  |{" "}
                  {scheduleLabel(chore.schedule)}
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
                        setChoreForm(emptyChoreForm());
                      }
                      await loadData();
                    } catch (deleteError) {
                      setError(
                        deleteError instanceof Error ? deleteError.message : "Failed to delete chore",
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
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-100">Completion tracker</h2>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <span>Date</span>
              <input
                type="date"
                className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100"
                value={activeSelectedDate}
                min={currentWeekRange.startDate}
                max={currentWeekRange.endDate}
                onChange={(event) =>
                  setSelectedDate(clampIsoDateToRange(event.target.value, currentWeekRange))
                }
              />
            </label>
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
              <span className="text-sm text-slate-300">Allowance payout rule</span>
              <select
                className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100"
                value={payoutConfig.mode}
                onChange={async (event) => {
                  if (!token) {
                    return;
                  }
                  setBusy(true);
                  setError(null);
                  try {
                    const updated = await updateChoresPayoutConfig(token, {
                      ...payoutConfig,
                      mode: event.target.value as ChoresPayoutConfig["mode"],
                    });
                    setPayoutConfig(updated);
                    await loadData();
                  } catch (configError) {
                    setError(
                      configError instanceof Error
                        ? configError.message
                        : "Failed to update payout rule",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <option value="all-or-nothing">
                  All-or-nothing: pay full allowance only at 100% recurring completion
                </option>
                <option value="proportional">
                  Proportional: pay allowance by recurring completion percentage
                </option>
              </select>
            </label>
            <label className="mt-2 flex items-center justify-between text-sm text-slate-200">
              <span>Treat one-off chore values as bonus</span>
              <input
                type="checkbox"
                checked={payoutConfig.oneOffBonusEnabled}
                onChange={async (event) => {
                  if (!token) {
                    return;
                  }
                  setBusy(true);
                  setError(null);
                  try {
                    const updated = await updateChoresPayoutConfig(token, {
                      ...payoutConfig,
                      oneOffBonusEnabled: event.target.checked,
                    });
                    setPayoutConfig(updated);
                    await loadData();
                  } catch (configError) {
                    setError(
                      configError instanceof Error
                        ? configError.message
                        : "Failed to update bonus settings",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </label>
            <label className="mt-2 block space-y-1">
              <span className="text-sm text-slate-300">Payday (last day of week)</span>
              <select
                className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100"
                value={payoutConfig.paydayDayOfWeek}
                onChange={async (event) => {
                  if (!token) {
                    return;
                  }
                  setBusy(true);
                  setError(null);
                  try {
                    const updated = await updateChoresPayoutConfig(token, {
                      ...payoutConfig,
                      paydayDayOfWeek: Number(event.target.value),
                    });
                    setPayoutConfig(updated);
                    await loadData();
                  } catch (configError) {
                    setError(
                      configError instanceof Error ? configError.message : "Failed to update payday",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {dayLabels.map((label, index) => (
                  <option key={label} value={index}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-2 text-xs text-slate-300">
              Current week: {formatDateLabel(currentWeekRange.startDate)} to{" "}
              {formatDateLabel(currentWeekRange.endDate)}. The completion tracker resets at
              midnight after payday.
            </p>
            <p className="mt-2 text-xs text-slate-300">
              Each child has an editable weekly allowance. Recurring chores determine allowance
              payout. One-off chores are bonus-only when enabled.
            </p>
          </div>
          <p className="mb-2 text-sm text-slate-300">
            Completed this week: {board?.stats.weeklyCompletedCount ?? 0}
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
