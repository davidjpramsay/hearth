import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  buildPlannerTimeSlots,
  findPlannerBlockConflict,
  getRuntimeTimeZone,
  plannerBlocksFitDayWindow,
  plannerDayWindowConfigSchema,
  toCalendarDateInTimeZone,
  type PlannerActivityBlockDraft,
  type PlannerDashboardResponse,
  type PlannerDayWindowConfig,
  type PlannerTemplateDetail,
  type PlannerUser,
} from "@hearth/shared";
import {
  createPlannerTemplate,
  deletePlannerTemplate,
  duplicatePlannerTemplate,
  replacePlannerTemplateBlocks,
  getPlannerDashboard,
  updatePlannerDayWindow,
  updatePlannerTemplate,
} from "../api/client";
import { getAuthToken } from "../auth/storage";
import { logoutAdminSession } from "../auth/session";
import { PageShell } from "../components/PageShell";
import { AdminNavActions } from "../components/admin/AdminNavActions";
import { AdminSection, AdminSectionHeader } from "../components/admin/AdminSection";
import {
  PlannerTimetableEditor,
  type PlannerEditorBlock,
} from "../components/admin/PlannerTimetableEditor";
import { ThemePalettePicker } from "../components/admin/ThemePalettePicker";
import { useModuleQuery } from "../modules/data/useModuleQuery";

const FALLBACK_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const repeatDayOrder = [1, 2, 3, 4, 5, 6, 0] as const;

const todayDate = (timeZone = getRuntimeTimeZone()): string =>
  toCalendarDateInTimeZone(new Date(), timeZone);

const toEditorBlocks = (template: PlannerTemplateDetail | null): PlannerEditorBlock[] =>
  (template?.blocks ?? []).map((block) => ({
    clientId: `block-${block.id}`,
    userId: block.userId,
    name: block.name,
    colour: block.colour,
    notes: block.notes,
    startTime: block.startTime,
    endTime: block.endTime,
  }));

export const AdminPlannerPage = () => {
  const token = getAuthToken();
  const navigate = useNavigate();
  const [siteToday, setSiteToday] = useState(() => todayDate());
  const [dayWindowForm, setDayWindowForm] = useState<PlannerDayWindowConfig>(
    plannerDayWindowConfigSchema.parse({}),
  );
  const [users, setUsers] = useState<PlannerUser[]>([]);
  const [templates, setTemplates] = useState<PlannerTemplateDetail[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [templateNameDraft, setTemplateNameDraft] = useState("");
  const [editorBlocks, setEditorBlocks] = useState<PlannerEditorBlock[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [blocksDirty, setBlocksDirty] = useState(false);
  const [isAutosavingBlocks, setIsAutosavingBlocks] = useState(false);
  const [createTemplateName, setCreateTemplateName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const blockAutosaveRevisionRef = useRef(0);
  const preferredTemplateIdRef = useRef<number | null | undefined>(undefined);

  const invalidateBlockAutosave = useCallback(() => {
    blockAutosaveRevisionRef.current += 1;
    setIsAutosavingBlocks(false);
  }, []);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates],
  );

  const selectedBlock = useMemo(
    () => editorBlocks.find((block) => block.clientId === selectedBlockId) ?? null,
    [editorBlocks, selectedBlockId],
  );

  const assignedRepeatDays = useMemo(() => {
    const owners = new Map<number, number>();
    for (const template of templates) {
      for (const day of template.repeatDays) {
        owners.set(day, template.id);
      }
    }
    return owners;
  }, [templates]);

  const validationError = useMemo(() => {
    if (!plannerBlocksFitDayWindow(editorBlocks, dayWindowForm)) {
      return "All school activities must fit within the configured day window.";
    }

    const conflict = findPlannerBlockConflict(editorBlocks);
    if (conflict) {
      const userName = users.find((entry) => entry.id === conflict.userId)?.name ?? "this user";
      return `School activities cannot overlap within ${userName}'s column.`;
    }

    return null;
  }, [dayWindowForm, editorBlocks, users]);

  const timeOptions = useMemo(
    () => [
      ...buildPlannerTimeSlots(dayWindowForm.startTime, dayWindowForm.endTime),
      dayWindowForm.endTime,
    ],
    [dayWindowForm.endTime, dayWindowForm.startTime],
  );

  const plannerQuery = useModuleQuery<PlannerDashboardResponse>({
    key: `admin-planner:${token ?? "anonymous"}`,
    enabled: Boolean(token),
    queryFn: async () => getPlannerDashboard(token!),
    intervalMs: FALLBACK_REFRESH_INTERVAL_MS,
    staleMs: 0,
    eventSourceUrl: "/api/events/layouts",
    eventNames: ["planner-updated", "site-time-updated"],
  });
  const loading = plannerQuery.loading && templates.length === 0;
  const activeError = error ?? plannerQuery.error;

  useEffect(() => {
    if (!token) {
      navigate("/admin/login", { replace: true });
    }
  }, [navigate, token]);

  useEffect(() => {
    const snapshot = plannerQuery.data;
    if (!snapshot) {
      return;
    }

    setSiteToday(snapshot.siteToday);
    setDayWindowForm(snapshot.dayWindow);
    setUsers(snapshot.users);
    setTemplates(snapshot.templates);

    const preferredTemplateIdInput = preferredTemplateIdRef.current;
    preferredTemplateIdRef.current = undefined;

    const preferredTemplateId =
      preferredTemplateIdInput !== undefined
        ? snapshot.templates.some((entry) => entry.id === preferredTemplateIdInput)
          ? preferredTemplateIdInput
          : (snapshot.templates[0]?.id ?? null)
        : selectedTemplateId && snapshot.templates.some((entry) => entry.id === selectedTemplateId)
          ? selectedTemplateId
          : (snapshot.templates[0]?.id ?? null);
    setSelectedTemplateId(preferredTemplateId);

    const preferredTemplate =
      snapshot.templates.find((entry) => entry.id === preferredTemplateId) ?? null;
    const shouldResetEditorState = !blocksDirty || preferredTemplateIdInput !== undefined;

    if (shouldResetEditorState) {
      invalidateBlockAutosave();
      setTemplateNameDraft(preferredTemplate?.name ?? "");
      setEditorBlocks(toEditorBlocks(preferredTemplate));
      setSelectedBlockId(null);
      setBlocksDirty(false);
    }
  }, [blocksDirty, invalidateBlockAutosave, plannerQuery.data, selectedTemplateId]);

  const selectTemplate = (templateId: number) => {
    if (templateId === selectedTemplateId) {
      return;
    }

    if (blocksDirty && !window.confirm("Discard unsaved school block changes?")) {
      return;
    }

    const nextTemplate = templates.find((template) => template.id === templateId) ?? null;
    invalidateBlockAutosave();
    setSelectedTemplateId(templateId);
    setTemplateNameDraft(nextTemplate?.name ?? "");
    setEditorBlocks(toEditorBlocks(nextTemplate));
    setSelectedBlockId(null);
    setBlocksDirty(false);
  };

  const onEditorChange = (
    nextBlocks: PlannerEditorBlock[],
    nextSelectedBlockId?: string | null,
  ) => {
    setEditorBlocks(nextBlocks);
    if (nextSelectedBlockId !== undefined) {
      setSelectedBlockId(nextSelectedBlockId);
    }
    setBlocksDirty(true);
  };

  const updateSelectedBlock = (patch: Partial<PlannerActivityBlockDraft>) => {
    if (!selectedBlock) {
      return;
    }

    onEditorChange(
      editorBlocks.map((block) =>
        block.clientId === selectedBlock.clientId ? { ...block, ...patch } : block,
      ),
      selectedBlock.clientId,
    );
  };

  const onSaveDayWindow = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) {
      return;
    }

    try {
      setBusyKey("day-window");
      setError(null);
      await updatePlannerDayWindow(token, dayWindowForm);
      await plannerQuery.revalidate();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save school day window");
    } finally {
      setBusyKey(null);
    }
  };

  const onCreateTemplate = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) {
      return;
    }

    try {
      setBusyKey("template-create");
      setError(null);
      const created = await createPlannerTemplate(token, {
        name: createTemplateName,
        repeatDays: [],
      });
      preferredTemplateIdRef.current = created.id;
      setCreateTemplateName("");
      await plannerQuery.revalidate();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to create plan");
    } finally {
      setBusyKey(null);
    }
  };

  const onRenameTemplate = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !selectedTemplate) {
      return;
    }

    try {
      setBusyKey("template-rename");
      setError(null);
      await updatePlannerTemplate(token, selectedTemplate.id, { name: templateNameDraft });
      preferredTemplateIdRef.current = selectedTemplate.id;
      await plannerQuery.revalidate();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to rename plan");
    } finally {
      setBusyKey(null);
    }
  };

  const onDuplicateTemplate = async (template: PlannerTemplateDetail) => {
    if (!token) {
      return;
    }

    try {
      setBusyKey(`template-duplicate-${template.id}`);
      setError(null);
      const duplicated = await duplicatePlannerTemplate(token, template.id, {
        name: `${template.name} copy`,
      });
      preferredTemplateIdRef.current = duplicated.id;
      await plannerQuery.revalidate();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to duplicate plan");
    } finally {
      setBusyKey(null);
    }
  };

  const onDeleteTemplate = async (template: PlannerTemplateDetail) => {
    if (!token) {
      return;
    }

    if (!window.confirm(`Delete "${template.name}"?`)) {
      return;
    }

    try {
      setBusyKey(`template-delete-${template.id}`);
      setError(null);
      const wasSelected = template.id === selectedTemplateId;
      const fallbackTemplateId = wasSelected
        ? (templates.find((entry) => entry.id !== template.id)?.id ?? null)
        : selectedTemplateId;
      await deletePlannerTemplate(token, template.id);
      preferredTemplateIdRef.current = fallbackTemplateId;
      await plannerQuery.revalidate();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to delete plan");
    } finally {
      setBusyKey(null);
    }
  };

  const onToggleRepeatDay = async (template: PlannerTemplateDetail, day: number) => {
    if (!token) {
      return;
    }

    const nextRepeatDays = template.repeatDays.includes(day)
      ? template.repeatDays.filter((entry) => entry !== day)
      : [...template.repeatDays, day].sort((left, right) => left - right);

    try {
      setBusyKey(`template-repeat-${template.id}`);
      setError(null);
      await updatePlannerTemplate(token, template.id, { repeatDays: nextRepeatDays });
      preferredTemplateIdRef.current = selectedTemplateId;
      await plannerQuery.revalidate();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to update repeat days");
    } finally {
      setBusyKey(null);
    }
  };

  const onRevertBlocks = () => {
    invalidateBlockAutosave();
    setEditorBlocks(toEditorBlocks(selectedTemplate));
    setSelectedBlockId(null);
    setBlocksDirty(false);
  };

  const onDeleteSelectedBlock = () => {
    if (!selectedBlock) {
      return;
    }

    onEditorChange(
      editorBlocks.filter((block) => block.clientId !== selectedBlock.clientId),
      null,
    );
  };

  useEffect(() => {
    if (!token || !selectedTemplate || !blocksDirty || validationError) {
      return;
    }

    const revision = blockAutosaveRevisionRef.current + 1;
    blockAutosaveRevisionRef.current = revision;

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          setIsAutosavingBlocks(true);
          setError(null);
          const nextBlocks = await replacePlannerTemplateBlocks(token, selectedTemplate.id, {
            blocks: editorBlocks.map(({ clientId: _clientId, ...block }) => block),
          });
          if (blockAutosaveRevisionRef.current !== revision) {
            return;
          }

          setTemplates((current) =>
            current.map((template) =>
              template.id === selectedTemplate.id
                ? {
                    ...template,
                    blocks: nextBlocks,
                  }
                : template,
            ),
          );
          setBlocksDirty(false);
        } catch (saveError) {
          if (blockAutosaveRevisionRef.current !== revision) {
            return;
          }
          setError(saveError instanceof Error ? saveError.message : "Failed to save school blocks");
        } finally {
          if (blockAutosaveRevisionRef.current === revision) {
            setIsAutosavingBlocks(false);
          }
        }
      })();
    }, 500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [blocksDirty, editorBlocks, selectedTemplate, token, validationError]);

  return (
    <PageShell
      title="School"
      subtitle="Create reusable school-day plans, choose which weekdays they repeat on, and edit their timetables."
      rightActions={<AdminNavActions current="school" onLogout={logoutAdminSession} />}
    >
      <div className="space-y-6">
        {activeError ? (
          <div className="rounded-xl border border-rose-500/60 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {activeError}
          </div>
        ) : null}

        <AdminSection>
          <AdminSectionHeader
            title="School day window"
            description="This timetable window applies to every saved school plan."
            meta={<span className="text-cyan-100">Today: {siteToday}</span>}
          />

          <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={onSaveDayWindow}>
            <label className="flex min-w-[10rem] flex-col gap-1 text-sm text-slate-200">
              <span>Start time</span>
              <select
                value={dayWindowForm.startTime}
                onChange={(event) =>
                  setDayWindowForm((current) => ({ ...current, startTime: event.target.value }))
                }
                className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
              >
                {timeOptions.slice(0, -1).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex min-w-[10rem] flex-col gap-1 text-sm text-slate-200">
              <span>End time</span>
              <select
                value={dayWindowForm.endTime}
                onChange={(event) =>
                  setDayWindowForm((current) => ({ ...current, endTime: event.target.value }))
                }
                className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
              >
                {timeOptions.slice(1).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="submit"
              disabled={busyKey === "day-window"}
              className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Save day window
            </button>
          </form>
        </AdminSection>

        <div className="grid gap-6">
          <AdminSection>
            <AdminSectionHeader
              title="Shared children"
              description="School columns are pulled from the shared children list in Admin > Children."
              actions={
                <button
                  type="button"
                  onClick={() => navigate("/children")}
                  className="rounded-lg border border-cyan-400/60 px-3 py-2 text-sm font-semibold text-cyan-100 hover:border-cyan-300"
                >
                  Open Children
                </button>
              }
            />

            <div className="mt-4 space-y-2">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2"
                >
                  <div>
                    <p className="font-semibold text-slate-100">{user.name}</p>
                    <p className="text-xs text-slate-400">School column</p>
                  </div>
                  <span className="text-xs text-slate-400">Managed in Children</span>
                </div>
              ))}
              {users.length === 0 ? (
                <p className="rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-3 text-sm text-slate-300">
                  Add a child in Admin &gt; Children before building a school timetable.
                </p>
              ) : null}
            </div>
          </AdminSection>
        </div>

        <AdminSection>
          <AdminSectionHeader
            title="School plans"
            description="Create plans, then choose which weekdays each one repeats on."
          />

          <form className="mt-4 flex flex-wrap gap-3" onSubmit={onCreateTemplate}>
            <input
              value={createTemplateName}
              onChange={(event) => setCreateTemplateName(event.target.value)}
              placeholder="New plan name"
              className="min-w-[16rem] flex-1 rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
            />
            <button
              type="submit"
              disabled={busyKey === "template-create"}
              className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Create plan
            </button>
          </form>

          <div className="mt-5 space-y-4">
            {templates.map((template) => (
              <article
                key={template.id}
                onClick={() => selectTemplate(template.id)}
                className={`rounded-xl border p-4 ${
                  template.id === selectedTemplateId
                    ? "border-cyan-400/70 bg-cyan-500/10"
                    : "border-slate-700 bg-slate-950/40 hover:border-slate-500"
                }`}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      selectTemplate(template.id);
                    }}
                    className={`min-w-[16rem] flex-1 rounded-lg border px-4 py-3 text-left text-base font-semibold ${
                      template.id === selectedTemplateId
                        ? "border-cyan-300 bg-slate-950/50 text-cyan-50"
                        : "border-slate-700 bg-slate-950/60 text-slate-100 hover:border-slate-500"
                    }`}
                  >
                    {template.name}
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      selectTemplate(template.id);
                    }}
                    className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-slate-400"
                  >
                    Edit
                  </button>

                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void onDuplicateTemplate(template);
                    }}
                    disabled={busyKey === `template-duplicate-${template.id}`}
                    className="rounded-lg border border-cyan-400/60 px-4 py-2 text-sm font-semibold text-cyan-100 hover:border-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Duplicate
                  </button>

                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void onDeleteTemplate(template);
                    }}
                    disabled={busyKey === `template-delete-${template.id}`}
                    className="rounded-lg border border-rose-500/60 px-4 py-2 text-sm font-semibold text-rose-100 hover:border-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Delete
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-300">Display On:</span>
                  {repeatDayOrder.map((day) => {
                    const ownedByTemplateId = assignedRepeatDays.get(day);
                    const isSelected = template.repeatDays.includes(day);
                    const isLocked =
                      ownedByTemplateId !== undefined && ownedByTemplateId !== template.id;

                    return (
                      <button
                        key={`${template.id}-${day}`}
                        type="button"
                        disabled={isLocked || busyKey === `template-repeat-${template.id}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          void onToggleRepeatDay(template, day);
                        }}
                        className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${
                          isSelected
                            ? "border-cyan-300 bg-cyan-400/15 text-cyan-50"
                            : isLocked
                              ? "cursor-not-allowed border-slate-800 bg-slate-900/50 text-slate-500"
                              : "border-slate-600 text-slate-200 hover:border-slate-400"
                        }`}
                      >
                        {weekdayLabels[day]}
                      </button>
                    );
                  })}
                  {template.repeatDays.length === 0 ? (
                    <span className="text-sm text-slate-400">No repeat days yet</span>
                  ) : null}
                </div>
              </article>
            ))}

            {templates.length === 0 ? (
              <p className="rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-3 text-sm text-slate-300">
                Create a plan to start building a weekly school schedule.
              </p>
            ) : null}
          </div>
        </AdminSection>

        <AdminSection>
          {selectedTemplate ? (
            <form className="mb-4 flex flex-wrap gap-3" onSubmit={onRenameTemplate}>
              <input
                value={templateNameDraft}
                onChange={(event) => setTemplateNameDraft(event.target.value)}
                className="min-w-[18rem] flex-1 rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
              />
              <button
                type="submit"
                disabled={busyKey === "template-rename"}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Rename plan
              </button>
            </form>
          ) : null}

          <AdminSectionHeader
            title="Timetable editor"
            description="Drag on a column to create a block. Drag a block to move it, or drag its edges to resize it."
            actions={
              <button
                type="button"
                onClick={onRevertBlocks}
                disabled={!blocksDirty || isAutosavingBlocks}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Revert
              </button>
            }
            meta={
              <span>
                {validationError
                  ? "Fix timetable issues before saving"
                  : isAutosavingBlocks
                    ? "Saving…"
                    : blocksDirty
                      ? "Waiting to save…"
                      : "Saved"}
              </span>
            }
          />

          {validationError ? (
            <div className="mt-4 rounded-lg border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
              {validationError}
            </div>
          ) : null}

          {!selectedTemplate ? (
            <p className="mt-4 rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-3 text-sm text-slate-300">
              Select or create a saved plan to edit its timetable.
            </p>
          ) : users.length === 0 ? (
            <p className="mt-4 rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-3 text-sm text-slate-300">
              Add a child in Admin &gt; Children before creating timetable blocks.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              <PlannerTimetableEditor
                dayWindow={dayWindowForm}
                users={users}
                blocks={editorBlocks}
                selectedBlockId={selectedBlockId}
                onChange={onEditorChange}
                onSelectBlock={setSelectedBlockId}
                disabled={false}
              />

              <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-4">
                <h3 className="text-base font-semibold text-slate-100">Selected activity</h3>
                {selectedBlock ? (
                  <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                    <div className="space-y-3">
                      <label className="block text-sm text-slate-200">
                        <span className="mb-1 block">Name</span>
                        <input
                          value={selectedBlock.name}
                          onChange={(event) => updateSelectedBlock({ name: event.target.value })}
                          className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
                        />
                      </label>

                      <label className="block text-sm text-slate-200">
                        <span className="mb-1 block">Notes</span>
                        <textarea
                          value={selectedBlock.notes ?? ""}
                          onChange={(event) =>
                            updateSelectedBlock({ notes: event.target.value || null })
                          }
                          rows={4}
                          className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
                        />
                      </label>
                    </div>

                    <div className="space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block text-sm text-slate-200">
                          <span className="mb-1 block">Colour</span>
                          <ThemePalettePicker
                            value={selectedBlock.colour}
                            onChange={(colour) => updateSelectedBlock({ colour })}
                            compact
                          />
                        </label>

                        <label className="block text-sm text-slate-200">
                          <span className="mb-1 block">User column</span>
                          <select
                            value={String(selectedBlock.userId)}
                            onChange={(event) =>
                              updateSelectedBlock({ userId: Number(event.target.value) })
                            }
                            className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
                          >
                            {users.map((user) => (
                              <option key={user.id} value={String(user.id)}>
                                {user.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block text-sm text-slate-200">
                          <span className="mb-1 block">Start</span>
                          <select
                            value={selectedBlock.startTime}
                            onChange={(event) =>
                              updateSelectedBlock({ startTime: event.target.value })
                            }
                            className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
                          >
                            {timeOptions.slice(0, -1).map((value) => (
                              <option key={value} value={value}>
                                {value}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="block text-sm text-slate-200">
                          <span className="mb-1 block">End</span>
                          <select
                            value={selectedBlock.endTime}
                            onChange={(event) =>
                              updateSelectedBlock({ endTime: event.target.value })
                            }
                            className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
                          >
                            {timeOptions.slice(1).map((value) => (
                              <option key={value} value={value}>
                                {value}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <button
                        type="button"
                        onClick={onDeleteSelectedBlock}
                        className="rounded-lg border border-rose-500/60 px-4 py-2 text-sm font-semibold text-rose-100 hover:border-rose-400"
                      >
                        Delete activity
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-slate-300">
                    Select a timetable block to edit its name, colour, notes, or times.
                  </p>
                )}
              </div>
            </div>
          )}
        </AdminSection>

        {loading ? <p className="text-sm text-slate-300">Loading school plans...</p> : null}
      </div>
    </PageShell>
  );
};
