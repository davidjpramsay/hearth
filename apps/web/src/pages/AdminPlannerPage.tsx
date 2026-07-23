import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  comparePlannerTimes,
  findPlannerBlockConflict,
  getRuntimeTimeZone,
  plannerDayWindowConfigSchema,
  plannerMinutesToTime,
  toCalendarDateInTimeZone,
  type PlannerActivityBlock,
  type PlannerActivityBlockDraft,
  type PlannerSummaryArchive,
  type PlannerDashboardResponse,
  type PlannerDayWindowConfig,
  type PlannerTemplateDetail,
  type PlannerUser,
} from "@hearth/shared";
import {
  createPlannerTemplate,
  downloadPlannerSummaryPdf,
  deletePlannerTemplate,
  duplicatePlannerTemplate,
  replacePlannerTemplateBlocks,
  getPlannerDashboard,
  getPlannerSummaryArchives,
  updatePlannerDayWindow,
  updatePlannerTemplate,
} from "../api/planner-client";
import { getAuthToken } from "../auth/storage";
import { logoutAdminSession } from "../auth/session";
import { PageShell } from "../components/PageShell";
import { AdminNavActions } from "../components/admin/AdminNavActions";
import {
  AdminSection,
  AdminSectionHeader,
  ADMIN_BUTTON_DANGER_CLASS,
  ADMIN_BUTTON_PRIMARY_CLASS,
  ADMIN_BUTTON_SECONDARY_CLASS,
  ADMIN_EMPTY_STATE_CLASS,
  ADMIN_FIELD_LABEL_CLASS,
  ADMIN_INPUT_CLASS,
  ADMIN_META_TEXT_CLASS,
  ADMIN_PANEL_CLASS,
} from "../components/admin/AdminSection";
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

const plannerBlockClientKey = (block: PlannerActivityBlockDraft): string =>
  [
    block.userId,
    block.startTime,
    block.endTime,
    block.name.trim(),
    block.colour,
    block.notes?.trim() ?? "",
  ].join("::");

const plannerBlocksSignature = (blocks: Array<PlannerActivityBlockDraft>): string =>
  [...blocks]
    .map((block) => plannerBlockClientKey(block))
    .sort()
    .join("|");

const buildTimeOptionsForIncrement = (minutesStep: number): string[] => {
  const options: string[] = [];
  for (let currentMinutes = 0; currentMinutes < 24 * 60; currentMinutes += minutesStep) {
    options.push(plannerMinutesToTime(currentMinutes));
  }
  return options;
};

const withCurrentValue = (options: string[], currentValue: string): string[] =>
  options.includes(currentValue) ? options : [...options, currentValue].sort();

const findPlannerDayWindowConflict = (
  blocks: PlannerEditorBlock[],
  dayWindow: PlannerDayWindowConfig,
): PlannerEditorBlock | null =>
  blocks.find(
    (block) =>
      comparePlannerTimes(dayWindow.startTime, block.startTime) > 0 ||
      comparePlannerTimes(block.endTime, dayWindow.endTime) > 0,
  ) ?? null;

const toEditorBlocks = (
  template: PlannerTemplateDetail | null,
  previousBlocks: PlannerEditorBlock[] = [],
): PlannerEditorBlock[] => {
  const reusableClientIds = new Map<string, string[]>();
  for (const block of previousBlocks) {
    const key = plannerBlockClientKey(block);
    const existing = reusableClientIds.get(key) ?? [];
    existing.push(block.clientId);
    reusableClientIds.set(key, existing);
  }

  return (template?.blocks ?? []).map((block, index) => {
    const key = plannerBlockClientKey(block);
    const reusableIds = reusableClientIds.get(key) ?? [];
    const reusableId = reusableIds.shift();
    if (reusableIds.length > 0) {
      reusableClientIds.set(key, reusableIds);
    } else {
      reusableClientIds.delete(key);
    }

    return {
      clientId: reusableId ?? `block-${block.id}-${index}`,
      userId: block.userId,
      name: block.name,
      colour: block.colour,
      notes: block.notes,
      startTime: block.startTime,
      endTime: block.endTime,
    };
  });
};

const getRetainedSelectedBlockId = (
  nextBlocks: PlannerEditorBlock[],
  previousSelectedBlockId: string | null,
): string | null =>
  previousSelectedBlockId && nextBlocks.some((block) => block.clientId === previousSelectedBlockId)
    ? previousSelectedBlockId
    : null;

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
  const [isInteractingWithBlocks, setIsInteractingWithBlocks] = useState(false);
  const [dayWindowDirty, setDayWindowDirty] = useState(false);
  const [createTemplateName, setCreateTemplateName] = useState("");
  const [createTemplateNameError, setCreateTemplateNameError] = useState<string | null>(null);
  const [summaryStatus, setSummaryStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const blockAutosaveRevisionRef = useRef(0);
  const createTemplateNameInputRef = useRef<HTMLInputElement>(null);
  const preferredTemplateIdRef = useRef<number | null | undefined>(undefined);
  const pendingTemplateBlocksSyncRef = useRef<{ templateId: number; signature: string } | null>(
    null,
  );

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
    const dayWindowConflict = findPlannerDayWindowConflict(editorBlocks, dayWindowForm);
    if (dayWindowConflict) {
      const userName =
        users.find((entry) => entry.id === dayWindowConflict.userId)?.name ?? "This child";
      return `${userName}'s activity "${dayWindowConflict.name}" (${dayWindowConflict.startTime}-${dayWindowConflict.endTime}) falls outside the school day. Move or resize it first.`;
    }

    const conflict = findPlannerBlockConflict(editorBlocks);
    if (conflict) {
      const userName = users.find((entry) => entry.id === conflict.userId)?.name ?? "this user";
      return `School activities cannot overlap within ${userName}'s column.`;
    }

    return null;
  }, [dayWindowForm, editorBlocks, users]);

  const dayWindowTimeOptions = useMemo(
    () => buildTimeOptionsForIncrement(dayWindowForm.slotMinutes),
    [dayWindowForm.slotMinutes],
  );
  const dayWindowStartOptions = useMemo(
    () => withCurrentValue(dayWindowTimeOptions.slice(0, -1), dayWindowForm.startTime),
    [dayWindowForm.startTime, dayWindowTimeOptions],
  );
  const dayWindowEndOptions = useMemo(
    () => withCurrentValue(dayWindowTimeOptions.slice(1), dayWindowForm.endTime),
    [dayWindowForm.endTime, dayWindowTimeOptions],
  );
  const activityTimeOptions = useMemo(
    () => buildTimeOptionsForIncrement(dayWindowForm.slotMinutes),
    [dayWindowForm.slotMinutes],
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
  const summaryArchiveQuery = useModuleQuery<{ archives: PlannerSummaryArchive[] }>({
    key: `admin-planner-summary-archives:${token ?? "anonymous"}`,
    enabled: Boolean(token),
    queryFn: async () => getPlannerSummaryArchives(token!),
    intervalMs: FALLBACK_REFRESH_INTERVAL_MS,
    staleMs: 0,
    eventSourceUrl: "/api/events/layouts",
    eventNames: ["planner-updated", "site-time-updated"],
  });
  const loading = plannerQuery.loading && templates.length === 0;
  const activeError = error ?? plannerQuery.error;
  const summaryArchives = summaryArchiveQuery.data?.archives ?? [];
  const latestSummaryArchive = summaryArchives[0] ?? null;
  const archivedSummaryArchives = useMemo(() => summaryArchives.slice(1), [summaryArchives]);
  const summaryLoading = summaryArchiveQuery.loading && summaryArchives.length === 0;

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
    if (!dayWindowDirty) {
      setDayWindowForm(snapshot.dayWindow);
    }
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
    const shouldResetEditorState =
      (!blocksDirty && !isInteractingWithBlocks) || preferredTemplateIdInput !== undefined;

    if (shouldResetEditorState) {
      const pendingTemplateBlocksSync = pendingTemplateBlocksSyncRef.current;
      const snapshotSignature = preferredTemplate
        ? plannerBlocksSignature(preferredTemplate.blocks)
        : "";
      if (
        preferredTemplateIdInput === undefined &&
        pendingTemplateBlocksSync &&
        pendingTemplateBlocksSync.templateId === preferredTemplateId &&
        snapshotSignature !== pendingTemplateBlocksSync.signature
      ) {
        return;
      }

      if (
        pendingTemplateBlocksSync &&
        pendingTemplateBlocksSync.templateId === preferredTemplateId &&
        snapshotSignature === pendingTemplateBlocksSync.signature
      ) {
        pendingTemplateBlocksSyncRef.current = null;
      }

      const nextEditorBlocks = toEditorBlocks(preferredTemplate, editorBlocks);
      const preserveSelection =
        preferredTemplateIdInput === undefined && preferredTemplateId === selectedTemplateId;
      invalidateBlockAutosave();
      setTemplateNameDraft(preferredTemplate?.name ?? "");
      setEditorBlocks(nextEditorBlocks);
      setSelectedBlockId(
        preserveSelection ? getRetainedSelectedBlockId(nextEditorBlocks, selectedBlockId) : null,
      );
      setBlocksDirty(false);
    }
  }, [
    blocksDirty,
    editorBlocks,
    dayWindowDirty,
    invalidateBlockAutosave,
    isInteractingWithBlocks,
    plannerQuery.data,
    selectedBlockId,
    selectedTemplateId,
  ]);

  const selectTemplate = (templateId: number) => {
    if (templateId === selectedTemplateId) {
      return;
    }

    if (blocksDirty && !window.confirm("Discard unsaved school activity changes?")) {
      return;
    }

    const nextTemplate = templates.find((template) => template.id === templateId) ?? null;
    pendingTemplateBlocksSyncRef.current = null;
    invalidateBlockAutosave();
    setSelectedTemplateId(templateId);
    setTemplateNameDraft(nextTemplate?.name ?? "");
    setEditorBlocks(toEditorBlocks(nextTemplate, editorBlocks));
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
      setDayWindowDirty(false);
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

    const name = createTemplateName.trim();
    if (!name) {
      setCreateTemplateNameError("Enter a plan name.");
      createTemplateNameInputRef.current?.focus();
      return;
    }

    try {
      setBusyKey("template-create");
      setError(null);
      setCreateTemplateNameError(null);
      const created = await createPlannerTemplate(token, {
        name,
        repeatDays: [],
      });
      pendingTemplateBlocksSyncRef.current = null;
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
      pendingTemplateBlocksSyncRef.current = null;
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
      pendingTemplateBlocksSyncRef.current = null;
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
      pendingTemplateBlocksSyncRef.current = null;
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
      pendingTemplateBlocksSyncRef.current = null;
      preferredTemplateIdRef.current = selectedTemplateId;
      await plannerQuery.revalidate();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to update repeat days");
    } finally {
      setBusyKey(null);
    }
  };

  const onRevertBlocks = () => {
    pendingTemplateBlocksSyncRef.current = null;
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

  const onDownloadSummary = async () => {
    if (!latestSummaryArchive || !token) {
      return;
    }

    try {
      const blob = await downloadPlannerSummaryPdf(token, latestSummaryArchive.weekStartDate);
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `hearth-school-summary-${latestSummaryArchive.weekStartDate}-to-${latestSummaryArchive.weekEndDate}.pdf`;
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
      setSummaryStatus("Downloaded");
      window.setTimeout(() => setSummaryStatus(null), 2000);
    } catch {
      setSummaryStatus("Download failed");
      window.setTimeout(() => setSummaryStatus(null), 2500);
    }
  };

  const onDownloadArchivedSummary = async (weekStartDate: string) => {
    if (!token) {
      return;
    }

    try {
      const archive =
        archivedSummaryArchives.find((entry) => entry.weekStartDate === weekStartDate) ??
        latestSummaryArchive;
      const blob = await downloadPlannerSummaryPdf(token, weekStartDate);
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `hearth-school-summary-${weekStartDate}-to-${
        archive?.weekEndDate ?? weekStartDate
      }.pdf`;
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
      setSummaryStatus("Downloaded");
      window.setTimeout(() => setSummaryStatus(null), 2000);
    } catch {
      setSummaryStatus("Download failed");
      window.setTimeout(() => setSummaryStatus(null), 2500);
    }
  };

  useEffect(() => {
    if (!token || !selectedTemplate || !blocksDirty || validationError || isInteractingWithBlocks) {
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

          pendingTemplateBlocksSyncRef.current = {
            templateId: selectedTemplate.id,
            signature: plannerBlocksSignature(nextBlocks),
          };

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
          const nextEditorBlocks = toEditorBlocks(
            { ...selectedTemplate, blocks: nextBlocks },
            editorBlocks,
          );
          setEditorBlocks(nextEditorBlocks);
          setSelectedBlockId(getRetainedSelectedBlockId(nextEditorBlocks, selectedBlockId));
          setBlocksDirty(false);
        } catch (saveError) {
          if (blockAutosaveRevisionRef.current !== revision) {
            return;
          }
          setError(
            saveError instanceof Error ? saveError.message : "Failed to save school activities",
          );
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
  }, [
    blocksDirty,
    editorBlocks,
    isInteractingWithBlocks,
    selectedBlockId,
    selectedTemplate,
    token,
    validationError,
  ]);

  return (
    <PageShell
      title="School"
      subtitle="Create reusable school-day plans, choose which weekdays they repeat on, and edit their timetables."
      rightActions={<AdminNavActions current="school" onLogout={logoutAdminSession} />}
    >
      <div className="space-y-6">
        {activeError ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {activeError}
          </div>
        ) : null}

        <AdminSection>
          <AdminSectionHeader
            title="School day window"
            description="This timetable window applies to every saved school plan."
            meta={<span className="text-teal-800">Today: {siteToday}</span>}
          />

          <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={onSaveDayWindow}>
            <label className={`min-w-[10rem] ${ADMIN_FIELD_LABEL_CLASS}`}>
              <span>Start time</span>
              <select
                value={dayWindowForm.startTime}
                onChange={(event) => {
                  setDayWindowForm((current) => ({ ...current, startTime: event.target.value }));
                  setDayWindowDirty(true);
                }}
                className={ADMIN_INPUT_CLASS}
              >
                {dayWindowStartOptions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>

            <label className={`min-w-[10rem] ${ADMIN_FIELD_LABEL_CLASS}`}>
              <span>End time</span>
              <select
                value={dayWindowForm.endTime}
                onChange={(event) => {
                  setDayWindowForm((current) => ({ ...current, endTime: event.target.value }));
                  setDayWindowDirty(true);
                }}
                className={ADMIN_INPUT_CLASS}
              >
                {dayWindowEndOptions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>

            <label className={`min-w-[10rem] ${ADMIN_FIELD_LABEL_CLASS}`}>
              <span>Grid size</span>
              <select
                value={String(dayWindowForm.slotMinutes)}
                onChange={(event) => {
                  setDayWindowForm((current) => ({
                    ...current,
                    slotMinutes: Number(event.target.value) as 15 | 30 | 60,
                  }));
                  setDayWindowDirty(true);
                }}
                className={ADMIN_INPUT_CLASS}
              >
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="60">1 hour</option>
              </select>
            </label>

            <button
              type="submit"
              disabled={busyKey === "day-window"}
              className={ADMIN_BUTTON_PRIMARY_CLASS}
            >
              Save day window
            </button>
          </form>
        </AdminSection>

        <div className="grid gap-6">
          <AdminSection>
            <AdminSectionHeader
              title="Shared children"
              description="School columns are pulled from the shared family list."
              actions={
                <button
                  type="button"
                  onClick={() => navigate("/children")}
                  className={ADMIN_BUTTON_SECONDARY_CLASS}
                >
                  Open Family
                </button>
              }
            />

            <div className="mt-4 space-y-2">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5"
                >
                  <div>
                    <p className="font-semibold text-stone-800">{user.name}</p>
                    <p className={ADMIN_META_TEXT_CLASS}>School column</p>
                  </div>
                  <span className={ADMIN_META_TEXT_CLASS}>Managed in Family</span>
                </div>
              ))}
              {users.length === 0 ? (
                <p className={ADMIN_EMPTY_STATE_CLASS}>
                  Add a child in Family before building a school timetable.
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

          <form
            className="mt-4 flex flex-wrap items-end gap-3"
            onSubmit={onCreateTemplate}
            noValidate
          >
            <label className={`min-w-[16rem] flex-1 ${ADMIN_FIELD_LABEL_CLASS}`}>
              <span className="mb-1 block">Plan name</span>
              <input
                ref={createTemplateNameInputRef}
                value={createTemplateName}
                onChange={(event) => {
                  setCreateTemplateName(event.target.value);
                  if (createTemplateNameError) setCreateTemplateNameError(null);
                }}
                placeholder="e.g. Monday school day"
                required
                maxLength={120}
                aria-invalid={createTemplateNameError ? "true" : undefined}
                aria-describedby={createTemplateNameError ? "new-plan-name-error" : undefined}
                className={ADMIN_INPUT_CLASS}
              />
              {createTemplateNameError ? (
                <span id="new-plan-name-error" className="mt-1 block text-sm text-rose-600">
                  {createTemplateNameError}
                </span>
              ) : null}
            </label>
            <button
              type="submit"
              disabled={busyKey === "template-create"}
              className={ADMIN_BUTTON_PRIMARY_CLASS}
            >
              Create plan
            </button>
          </form>

          <div className="mt-5 space-y-4">
            {templates.map((template) => (
              <article
                key={template.id}
                onClick={() => selectTemplate(template.id)}
                className={`rounded-xl border p-4 transition ${
                  template.id === selectedTemplateId
                    ? "border-teal-300 bg-teal-50/70"
                    : "border-stone-200 bg-stone-50 hover:border-stone-300"
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
                        ? "border-teal-300 bg-white text-teal-900"
                        : "border-stone-200 bg-white text-stone-800 hover:border-stone-300"
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
                    className={ADMIN_BUTTON_SECONDARY_CLASS}
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
                    className={ADMIN_BUTTON_SECONDARY_CLASS}
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
                    className={ADMIN_BUTTON_DANGER_CLASS}
                  >
                    Delete
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-stone-700">Display on</span>
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
                            ? "border-teal-700 bg-teal-700 text-white"
                            : isLocked
                              ? "cursor-not-allowed border-stone-200 bg-stone-100 text-stone-400"
                              : "border-stone-300 bg-white text-stone-700 hover:border-teal-500"
                        }`}
                      >
                        {weekdayLabels[day]}
                      </button>
                    );
                  })}
                  {template.repeatDays.length === 0 ? (
                    <span className="text-sm text-stone-500">No repeat days yet</span>
                  ) : null}
                </div>
              </article>
            ))}

            {templates.length === 0 ? (
              <p className={ADMIN_EMPTY_STATE_CLASS}>
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
                className={`min-w-[18rem] flex-1 ${ADMIN_INPUT_CLASS}`}
              />
              <button
                type="submit"
                disabled={busyKey === "template-rename"}
                className={ADMIN_BUTTON_SECONDARY_CLASS}
              >
                Rename plan
              </button>
            </form>
          ) : null}

          <AdminSectionHeader
            title="Timetable editor"
            description="Drag on a column to create an activity. Drag an activity to move it, or drag its edges to resize it."
            actions={
              <button
                type="button"
                onClick={onRevertBlocks}
                disabled={!blocksDirty || isAutosavingBlocks}
                className={ADMIN_BUTTON_SECONDARY_CLASS}
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
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {validationError}
            </div>
          ) : null}

          {!selectedTemplate ? (
            <p className={`mt-4 ${ADMIN_EMPTY_STATE_CLASS}`}>
              Select or create a saved plan to edit its timetable.
            </p>
          ) : users.length === 0 ? (
            <p className={`mt-4 ${ADMIN_EMPTY_STATE_CLASS}`}>
              Add a child in Family before creating timetable activities.
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
                onInteractionStateChange={setIsInteractingWithBlocks}
                disabled={busyKey !== null || isAutosavingBlocks}
              />

              <div className={ADMIN_PANEL_CLASS}>
                <h3 className="text-base font-semibold text-stone-900">Selected activity</h3>
                {selectedBlock ? (
                  <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                    <div className="space-y-3">
                      <label className={ADMIN_FIELD_LABEL_CLASS}>
                        <span className="mb-1 block">Name</span>
                        <input
                          value={selectedBlock.name}
                          onChange={(event) => updateSelectedBlock({ name: event.target.value })}
                          className={ADMIN_INPUT_CLASS}
                        />
                      </label>

                      <label className={ADMIN_FIELD_LABEL_CLASS}>
                        <span className="mb-1 block">Notes</span>
                        <textarea
                          value={selectedBlock.notes ?? ""}
                          onChange={(event) =>
                            updateSelectedBlock({ notes: event.target.value || null })
                          }
                          rows={4}
                          className={ADMIN_INPUT_CLASS}
                        />
                      </label>
                    </div>

                    <div className="space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className={ADMIN_FIELD_LABEL_CLASS}>
                          <span className="mb-1 block">Colour</span>
                          <ThemePalettePicker
                            value={selectedBlock.colour}
                            onChange={(colour) => updateSelectedBlock({ colour })}
                            compact
                          />
                        </label>

                        <label className={ADMIN_FIELD_LABEL_CLASS}>
                          <span className="mb-1 block">User column</span>
                          <select
                            value={String(selectedBlock.userId)}
                            onChange={(event) =>
                              updateSelectedBlock({ userId: Number(event.target.value) })
                            }
                            className={ADMIN_INPUT_CLASS}
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
                        <label className={ADMIN_FIELD_LABEL_CLASS}>
                          <span className="mb-1 block">Start</span>
                          <select
                            value={selectedBlock.startTime}
                            onChange={(event) =>
                              updateSelectedBlock({ startTime: event.target.value })
                            }
                            className={ADMIN_INPUT_CLASS}
                          >
                            {withCurrentValue(
                              activityTimeOptions.slice(0, -1),
                              selectedBlock.startTime,
                            ).map((value) => (
                              <option key={value} value={value}>
                                {value}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className={ADMIN_FIELD_LABEL_CLASS}>
                          <span className="mb-1 block">End</span>
                          <select
                            value={selectedBlock.endTime}
                            onChange={(event) =>
                              updateSelectedBlock({ endTime: event.target.value })
                            }
                            className={ADMIN_INPUT_CLASS}
                          >
                            {withCurrentValue(
                              activityTimeOptions.slice(1),
                              selectedBlock.endTime,
                            ).map((value) => (
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
                        className={ADMIN_BUTTON_DANGER_CLASS}
                      >
                        Delete activity
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-stone-600">
                    Select a timetable activity to edit its name, colour, notes, or times.
                  </p>
                )}
              </div>
            </div>
          )}
        </AdminSection>

        <AdminSection>
          <AdminSectionHeader
            title="Weekly summary"
            description="Download the latest weekly summary PDF, or open an older PDF below."
            meta={
              latestSummaryArchive ? (
                <span className="text-teal-800">
                  {latestSummaryArchive.weekStartDate} to {latestSummaryArchive.weekEndDate}
                </span>
              ) : (
                <span className="text-stone-500">Waiting for the latest PDF summary</span>
              )
            }
            actions={
              <button
                type="button"
                onClick={() => void onDownloadSummary()}
                disabled={!latestSummaryArchive}
                className={ADMIN_BUTTON_SECONDARY_CLASS}
              >
                Download latest PDF
              </button>
            }
          />

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <p className="max-w-2xl text-sm text-stone-600">
              PDFs group the week by child, then by completed and incomplete activities.
            </p>
            {summaryStatus ? (
              <span className="rounded-full border border-stone-200 bg-stone-100 px-2 py-1 text-xs font-semibold text-stone-700">
                {summaryStatus}
              </span>
            ) : null}
          </div>

          {summaryArchiveQuery.error ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {summaryArchiveQuery.error}
            </div>
          ) : null}

          {summaryLoading ? (
            <p className="mt-4 text-sm text-stone-600">Preparing the latest weekly PDF...</p>
          ) : latestSummaryArchive ? (
            <div className={`mt-4 ${ADMIN_PANEL_CLASS}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-stone-900">Latest PDF summary</h3>
                  <p className="text-sm text-stone-500">
                    {latestSummaryArchive.weekStartDate} to {latestSummaryArchive.weekEndDate}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void onDownloadSummary()}
                  disabled={!latestSummaryArchive}
                  className={ADMIN_BUTTON_SECONDARY_CLASS}
                >
                  Download PDF
                </button>
              </div>
            </div>
          ) : (
            <p className={`mt-4 ${ADMIN_EMPTY_STATE_CLASS}`}>No weekly PDF summary yet.</p>
          )}

          <div className={`mt-6 ${ADMIN_PANEL_CLASS}`}>
            <h3 className="text-base font-semibold text-stone-900">Archived PDFs</h3>
            <div className="mt-3 space-y-2">
              {archivedSummaryArchives.length > 0 ? (
                archivedSummaryArchives.map((archive) => (
                  <div
                    key={archive.weekStartDate}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-3 py-3"
                  >
                    <div>
                      <p className="font-semibold text-stone-800">
                        {archive.weekStartDate} to {archive.weekEndDate}
                      </p>
                      <p className={ADMIN_META_TEXT_CLASS}>School summary PDF</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void onDownloadArchivedSummary(archive.weekStartDate)}
                      className={ADMIN_BUTTON_SECONDARY_CLASS}
                    >
                      Download PDF
                    </button>
                  </div>
                ))
              ) : (
                <p className={ADMIN_EMPTY_STATE_CLASS}>No archived PDFs yet.</p>
              )}
            </div>
          </div>
        </AdminSection>

        {loading ? <p className="text-sm text-stone-600">Loading school plans...</p> : null}
      </div>
    </PageShell>
  );
};
