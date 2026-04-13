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
import { AdminSection, AdminSectionHeader } from "../components/admin/AdminSection";
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
      title="Children"
      subtitle="Manage the shared children list used by chores and school plans."
      rightActions={<AdminNavActions current="children" onLogout={logoutAdminSession} />}
    >
      <div className="space-y-6">
        {activeError ? (
          <p className="rounded-xl border border-rose-500/70 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
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
              <label className="block space-y-1">
                <span className="text-sm text-slate-300">Name</span>
                <input
                  required
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                  value={childForm.name}
                  onChange={(event) =>
                    setChildForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>

              <label className="block space-y-1">
                <span className="text-sm text-slate-300">Avatar URL (optional)</span>
                <input
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                  value={childForm.avatarUrl}
                  onChange={(event) =>
                    setChildForm((current) => ({ ...current, avatarUrl: event.target.value }))
                  }
                />
              </label>

              <label className="block space-y-1">
                <span className="text-sm text-slate-300">Weekly allowance ($)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
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
                  className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {childForm.id === null ? "Create child" : "Save child"}
                </button>
                {childForm.id !== null ? (
                  <button
                    type="button"
                    onClick={() => setChildForm(emptyChildForm())}
                    className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-slate-400"
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
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-3"
                >
                  <div>
                    <p className="font-semibold text-slate-100">{child.name}</p>
                    <p className="text-sm text-slate-300">
                      Weekly allowance: ${child.weeklyAllowance.toFixed(2)}
                    </p>
                    {child.avatarUrl ? (
                      <p className="text-xs text-slate-400">{child.avatarUrl}</p>
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
                      className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm font-semibold text-slate-200 hover:border-slate-400"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDeleteChild(child.id)}
                      disabled={busyKey === `delete-child-${child.id}`}
                      className="rounded-lg border border-rose-500/60 px-3 py-1.5 text-sm font-semibold text-rose-100 hover:border-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}

              {!loading && children.length === 0 ? (
                <p className="rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-3 text-sm text-slate-300">
                  Add a child to start assigning chores and building school plans.
                </p>
              ) : null}
            </div>
          </AdminSection>
        </section>
      </div>
    </PageShell>
  );
};
