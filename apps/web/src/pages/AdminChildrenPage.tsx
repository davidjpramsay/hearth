import { FormEvent, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createChoreMember,
  deleteChoreMember,
  getChoreMembers,
  updateChoreMember,
} from "../api/client";
import { logoutAdminSession } from "../auth/session";
import { getAuthToken } from "../auth/storage";
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
} from "../components/admin/AdminSection";
import type { ChoreMember } from "@hearth/shared";
import { useModuleQuery } from "../modules/data/useModuleQuery";

interface ChildFormState {
  id: number | null;
  name: string;
  avatarUrl: string;
  weeklyAllowance: string;
}

const emptyChildForm = (): ChildFormState => ({
  id: null,
  name: "",
  avatarUrl: "",
  weeklyAllowance: "0",
});

const FALLBACK_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export const AdminChildrenPage = () => {
  const token = getAuthToken();
  const navigate = useNavigate();
  const [childForm, setChildForm] = useState<ChildFormState>(emptyChildForm);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const childrenQuery = useModuleQuery<ChoreMember[]>({
    key: `admin-children:${token ?? "anonymous"}`,
    enabled: Boolean(token),
    queryFn: async () => getChoreMembers(token!),
    intervalMs: FALLBACK_REFRESH_INTERVAL_MS,
    staleMs: 0,
    eventSourceUrl: "/api/events/layouts",
    eventNames: ["chores-updated", "planner-updated"],
  });
  const children = childrenQuery.data ?? [];
  const loading = childrenQuery.loading && children.length === 0;
  const activeError = error ?? childrenQuery.error;

  useEffect(() => {
    if (!token) {
      navigate("/admin/login", { replace: true });
    }
  }, [navigate, token]);

  const onSubmitChild = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) {
      return;
    }

    try {
      setBusyKey("save-child");
      setError(null);
      const weeklyAllowance = Math.max(0, Number(childForm.weeklyAllowance) || 0);
      if (childForm.id === null) {
        await createChoreMember(token, {
          name: childForm.name,
          avatarUrl: childForm.avatarUrl || null,
          weeklyAllowance,
        });
      } else {
        await updateChoreMember(token, childForm.id, {
          name: childForm.name,
          avatarUrl: childForm.avatarUrl || null,
          weeklyAllowance,
        });
      }

      setChildForm(emptyChildForm());
      await childrenQuery.revalidate();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save child");
    } finally {
      setBusyKey(null);
    }
  };

  const onDeleteChild = async (childId: number) => {
    if (!token) {
      return;
    }

    try {
      setBusyKey(`delete-child-${childId}`);
      setError(null);
      await deleteChoreMember(token, childId);
      if (childForm.id === childId) {
        setChildForm(emptyChildForm());
      }
      await childrenQuery.revalidate();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete child");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <PageShell
      title="Family"
      subtitle="Add the children who use chores, allowances, and school plans."
      rightActions={<AdminNavActions current="children" onLogout={logoutAdminSession} />}
    >
      <div className="space-y-6">
        {activeError ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {activeError}
          </p>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[minmax(20rem,0.95fr)_minmax(0,1.05fr)]">
          <AdminSection as="article">
            <AdminSectionHeader
              title={childForm.id === null ? "Add child" : "Edit child"}
              description="Names added here are reused in Chores and School."
              compact
            />

            <form onSubmit={onSubmitChild} className="mt-4 space-y-3">
              <label className={ADMIN_FIELD_LABEL_CLASS}>
                <span>Name</span>
                <input
                  required
                  className={ADMIN_INPUT_CLASS}
                  value={childForm.name}
                  onChange={(event) =>
                    setChildForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>

              <label className={ADMIN_FIELD_LABEL_CLASS}>
                <span>Avatar URL (optional)</span>
                <input
                  className={ADMIN_INPUT_CLASS}
                  value={childForm.avatarUrl}
                  onChange={(event) =>
                    setChildForm((current) => ({ ...current, avatarUrl: event.target.value }))
                  }
                />
              </label>

              <label className={ADMIN_FIELD_LABEL_CLASS}>
                <span>Weekly allowance ($)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className={ADMIN_INPUT_CLASS}
                  value={childForm.weeklyAllowance}
                  onChange={(event) =>
                    setChildForm((current) => ({
                      ...current,
                      weeklyAllowance: event.target.value,
                    }))
                  }
                />
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={busyKey === "save-child"}
                  className={ADMIN_BUTTON_PRIMARY_CLASS}
                >
                  {childForm.id === null ? "Create child" : "Save child"}
                </button>
                {childForm.id !== null ? (
                  <button
                    type="button"
                    onClick={() => setChildForm(emptyChildForm())}
                    className={ADMIN_BUTTON_SECONDARY_CLASS}
                  >
                    Cancel edit
                  </button>
                ) : null}
              </div>
            </form>
          </AdminSection>

          <AdminSection as="article">
            <AdminSectionHeader
              title="Shared children"
              description="Chores and School both pull from this list."
              meta={<span>{children.length} total</span>}
              compact
            />

            {loading ? <p className="mt-4 text-sm text-slate-400">Loading children...</p> : null}

            <div className="mt-4 space-y-2">
              {children.map((child) => (
                <div
                  key={child.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3"
                >
                  <div>
                    <p className="font-semibold text-stone-900">{child.name}</p>
                    <p className="text-sm text-stone-600">
                      Weekly allowance: ${child.weeklyAllowance.toFixed(2)}
                    </p>
                    {child.avatarUrl ? (
                      <p className="text-xs text-stone-500">{child.avatarUrl}</p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setChildForm({
                          id: child.id,
                          name: child.name,
                          avatarUrl: child.avatarUrl ?? "",
                          weeklyAllowance: String(child.weeklyAllowance),
                        })
                      }
                      className={ADMIN_BUTTON_SECONDARY_CLASS}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDeleteChild(child.id)}
                      disabled={busyKey === `delete-child-${child.id}`}
                      className={ADMIN_BUTTON_DANGER_CLASS}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}

              {!loading && children.length === 0 ? (
                <div className={ADMIN_EMPTY_STATE_CLASS}>
                  <p className="font-semibold text-stone-800">Start with your family</p>
                  <p className="mt-1">
                    Add a child here, then assign chores or build a school plan.
                  </p>
                </div>
              ) : null}
            </div>
          </AdminSection>
        </section>
      </div>
    </PageShell>
  );
};
