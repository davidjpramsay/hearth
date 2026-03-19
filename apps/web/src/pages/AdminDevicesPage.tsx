import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  screenProfileLayoutsSchema,
  type DisplayDevice,
  type ReportScreenTargetSelection,
  type ScreenProfileLayouts,
} from "@hearth/shared";
import {
  deleteDisplayDevice,
  getDisplayDevices,
  getLayouts,
  getScreenProfileLayouts,
  updateDisplayDevice,
} from "../api/client";
import { logoutAdminSession } from "../auth/session";
import { getAuthToken } from "../auth/storage";
import { AdminNavActions } from "../components/admin/AdminNavActions";
import { PageShell } from "../components/PageShell";
import { THEME_OPTIONS, type ThemeId } from "../theme/theme";

type DeviceRoutingMode = "set" | "layout";

interface DeviceDraft {
  name: string;
  themeId: ThemeId;
  routingMode: DeviceRoutingMode;
  setId: string;
  layoutName: string;
  preserveImplicitSelection: boolean;
  implicitSetId: string | null;
}

type BusyDeviceAction = "save" | "delete";

const defaultProfileLayouts: ScreenProfileLayouts = screenProfileLayoutsSchema.parse({});

const normalizeDeviceTargetSelection = (input: {
  targetSelection: ReportScreenTargetSelection | null;
  availableSetIds: Set<string>;
  availableLayoutNames: Set<string>;
}): ReportScreenTargetSelection | null => {
  const { targetSelection } = input;

  if (!targetSelection) {
    return null;
  }

  if (targetSelection.kind === "set") {
    return targetSelection.setId !== null && input.availableSetIds.has(targetSelection.setId)
      ? targetSelection
      : null;
  }

  return targetSelection.layoutName !== null &&
    input.availableLayoutNames.has(targetSelection.layoutName)
    ? targetSelection
    : null;
};

const toDeviceDraft = (input: {
  device: DisplayDevice;
  availableSetIds: Set<string>;
  availableLayoutNames: Set<string>;
  firstAvailableSetId: string;
}): DeviceDraft => {
  const normalizedTargetSelection = normalizeDeviceTargetSelection({
    targetSelection: input.device.targetSelection,
    availableSetIds: input.availableSetIds,
    availableLayoutNames: input.availableLayoutNames,
  });

  if (!normalizedTargetSelection) {
    return {
      name: input.device.name,
      themeId: input.device.themeId,
      routingMode: "set",
      setId: input.firstAvailableSetId,
      layoutName: "",
      preserveImplicitSelection:
        input.device.targetSelection === null && input.firstAvailableSetId.length > 0,
      implicitSetId:
        input.device.targetSelection === null && input.firstAvailableSetId.length > 0
          ? input.firstAvailableSetId
          : null,
    };
  }

  if (normalizedTargetSelection.kind === "set") {
    return {
      name: input.device.name,
      themeId: input.device.themeId,
      routingMode: "set",
      setId: normalizedTargetSelection.setId ?? "",
      layoutName: "",
      preserveImplicitSelection: false,
      implicitSetId: null,
    };
  }

  return {
    name: input.device.name,
    themeId: input.device.themeId,
    routingMode: "layout",
    setId: "",
    layoutName: normalizedTargetSelection.layoutName ?? "",
    preserveImplicitSelection: false,
    implicitSetId: null,
  };
};

const toUpdatePayload = (draft: DeviceDraft): {
  name: string;
  themeId: ThemeId;
  targetSelection: ReportScreenTargetSelection | null;
} => ({
  name: draft.name.trim().slice(0, 80),
  themeId: draft.themeId,
  targetSelection:
    draft.preserveImplicitSelection &&
    draft.routingMode === "set" &&
    draft.implicitSetId !== null &&
    draft.setId === draft.implicitSetId
      ? null
      : draft.routingMode === "set"
        ? {
            kind: "set",
            setId: draft.setId.trim().length > 0 ? draft.setId : null,
          }
        : {
            kind: "layout",
            layoutName: draft.layoutName.trim().length > 0 ? draft.layoutName : null,
          },
});

const formatLastSeen = (value: string): string => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }

  const deltaMinutes = Math.round((Date.now() - timestamp) / 60000);
  if (deltaMinutes <= 1) {
    return "Just now";
  }
  if (deltaMinutes < 60) {
    return `${deltaMinutes} min ago`;
  }

  const deltaHours = Math.round(deltaMinutes / 60);
  if (deltaHours < 24) {
    return `${deltaHours} hr ago`;
  }

  const deltaDays = Math.round(deltaHours / 24);
  if (deltaDays < 7) {
    return `${deltaDays} day${deltaDays === 1 ? "" : "s"} ago`;
  }

  return new Date(timestamp).toLocaleString();
};

const hasValidRoutingTarget = (draft: DeviceDraft): boolean => {
  if (draft.routingMode === "set") {
    return draft.setId.trim().length > 0;
  }

  return draft.layoutName.trim().length > 0;
};

export const AdminDevicesPage = () => {
  const navigate = useNavigate();
  const [devices, setDevices] = useState<DisplayDevice[]>([]);
  const [screenProfileLayouts, setScreenProfileLayouts] =
    useState<ScreenProfileLayouts>(defaultProfileLayouts);
  const [layoutNames, setLayoutNames] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DeviceDraft>>({});
  const [busyDeviceState, setBusyDeviceState] = useState<{
    deviceId: string;
    action: BusyDeviceAction;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const availableSetOptions = useMemo(
    () =>
      Object.entries(screenProfileLayouts.families).map(([id, config]) => ({
        id,
        name: config.name,
      })),
    [screenProfileLayouts.families],
  );
  const availableSetIds = useMemo(
    () => new Set(availableSetOptions.map((option) => option.id)),
    [availableSetOptions],
  );
  const availableLayoutNames = useMemo(() => new Set(layoutNames), [layoutNames]);
  const firstAvailableSetId = availableSetOptions[0]?.id ?? "";
  const firstAvailableLayoutName = layoutNames[0] ?? "";

  const loadData = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      navigate("/admin/login", { replace: true });
      return;
    }

    try {
      setError(null);
      const [devicesResponse, layoutsResponse, profileResponse] = await Promise.all([
        getDisplayDevices(token),
        getLayouts(false, token),
        getScreenProfileLayouts(token),
      ]);

      setDevices(devicesResponse.devices);
      setLayoutNames(layoutsResponse.map((layout) => layout.name));
      setScreenProfileLayouts(profileResponse);

      const nextAvailableSetIds = new Set(Object.keys(profileResponse.families));
      const nextFirstAvailableSetId = Object.keys(profileResponse.families)[0] ?? "";
      const nextAvailableLayoutNames = new Set(layoutsResponse.map((layout) => layout.name));
      setDrafts(
        Object.fromEntries(
          devicesResponse.devices.map((device) => [
            device.id,
            toDeviceDraft({
              device,
              availableSetIds: nextAvailableSetIds,
              availableLayoutNames: nextAvailableLayoutNames,
              firstAvailableSetId: nextFirstAvailableSetId,
            }),
          ]),
        ),
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load devices");
    }
  }, [navigate]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const onLogout = useCallback(() => {
    logoutAdminSession();
  }, []);

  const updateDraft = (deviceId: string, updater: (current: DeviceDraft) => DeviceDraft) => {
    setDrafts((current) => {
      const existing = current[deviceId];
      if (!existing) {
        return current;
      }

      return {
        ...current,
        [deviceId]: updater(existing),
      };
    });
  };

  const onSaveDevice = async (deviceId: string) => {
    const token = getAuthToken();
    if (!token) {
      navigate("/admin/login", { replace: true });
      return;
    }

    const draft = drafts[deviceId];
    if (!draft) {
      return;
    }

    try {
      setBusyDeviceState({ deviceId, action: "save" });
      setError(null);
      const updated = await updateDisplayDevice(token, deviceId, toUpdatePayload(draft));
      setDevices((current) =>
        current.map((device) => (device.id === updated.id ? updated : device)),
      );
      setDrafts((current) => ({
        ...current,
        [updated.id]: toDeviceDraft({
          device: updated,
          availableSetIds,
          availableLayoutNames,
          firstAvailableSetId,
        }),
      }));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to update device");
    } finally {
      setBusyDeviceState((current) => (current?.deviceId === deviceId ? null : current));
    }
  };

  const onDeleteDevice = async (device: DisplayDevice) => {
    const token = getAuthToken();
    if (!token) {
      navigate("/admin/login", { replace: true });
      return;
    }

    const confirmed = window.confirm(
      `Remove device "${device.name}"? If the screen checks in again it will be recreated with a fresh routing assignment.`,
    );
    if (!confirmed) {
      return;
    }

    try {
      setBusyDeviceState({ deviceId: device.id, action: "delete" });
      setError(null);
      await deleteDisplayDevice(token, device.id);
      setDevices((current) => current.filter((entry) => entry.id !== device.id));
      setDrafts((current) => {
        const nextDrafts = { ...current };
        delete nextDrafts[device.id];
        return nextDrafts;
      });
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete device");
    } finally {
      setBusyDeviceState((current) => (current?.deviceId === device.id ? null : current));
    }
  };

  return (
    <PageShell
      title="Devices"
      subtitle="Manage per-device names, display theme, and routing."
      rightActions={<AdminNavActions current="devices" onLogout={onLogout} />}
    >
      {error ? (
        <p className="mb-4 rounded border border-rose-500/70 bg-rose-500/10 px-3 py-2 text-rose-200">
          {error}
        </p>
      ) : null}

      <section className="mb-6 rounded-xl border border-slate-700 bg-slate-900/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Connected displays</h2>
            <p className="mt-1 text-sm text-slate-400">
              Devices appear here after they open the display page once. Give each one a
              custom name so it is easy to tell your screens apart.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadData()}
            className="rounded-lg border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-200 hover:border-slate-400"
          >
            Refresh
          </button>
        </div>
      </section>

      {devices.length === 0 ? (
        <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-6 text-slate-300">
          No devices have checked in yet.
        </section>
      ) : (
        <section className="grid gap-4">
          {devices.map((device) => {
            const draft = drafts[device.id] ?? toDeviceDraft({
              device,
              availableSetIds,
              availableLayoutNames,
              firstAvailableSetId,
            });
            const payload = toUpdatePayload({
              ...draft,
              name: draft.name.trim().length > 0 ? draft.name : device.name,
            });
            const baselinePayload = toUpdatePayload(
              toDeviceDraft({
                device,
                availableSetIds,
                availableLayoutNames,
                firstAvailableSetId,
              }),
            );
            const isValidDraft = hasValidRoutingTarget(draft);
            const isDirty = JSON.stringify(payload) !== JSON.stringify(baselinePayload);
            const isBusy = busyDeviceState?.deviceId === device.id;
            const isSaving = isBusy && busyDeviceState?.action === "save";
            const isDeleting = isBusy && busyDeviceState?.action === "delete";

            return (
              <article
                key={device.id}
                className="rounded-xl border border-slate-700 bg-slate-900/70 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-100">{device.name}</h2>
                    <p className="mt-1 text-xs text-slate-400">ID: {device.id}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      Last seen IP: {device.lastSeenIp ?? "Unavailable"}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Last seen: {formatLastSeen(device.lastSeenAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void onDeleteDevice(device)}
                      className="rounded-lg border border-rose-500/70 px-4 py-2 text-sm font-semibold text-rose-200 hover:border-rose-400 hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isDeleting ? "Removing..." : "Remove device"}
                    </button>
                    <button
                      type="button"
                      disabled={!isDirty || !isValidDraft || isBusy}
                      onClick={() => void onSaveDevice(device.id)}
                      className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSaving ? "Saving..." : "Save changes"}
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <label className="flex flex-col gap-2 text-sm text-slate-300">
                    <span>Display name</span>
                    <input
                      value={draft.name}
                      onChange={(event) =>
                        updateDraft(device.id, (current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
                    />
                    <span className="text-xs text-slate-400">
                      Custom device names must be unique.
                    </span>
                  </label>

                  <label className="flex flex-col gap-2 text-sm text-slate-300">
                    <span>Theme</span>
                    <select
                      value={draft.themeId}
                      onChange={(event) =>
                        updateDraft(device.id, (current) => ({
                          ...current,
                          themeId: event.target.value as ThemeId,
                        }))
                      }
                      className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
                    >
                      {THEME_OPTIONS.map((theme) => (
                        <option key={theme.id} value={theme.id}>
                          {theme.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-2 text-sm text-slate-300">
                    <span>Routing mode</span>
                    <select
                      value={draft.routingMode}
                      onChange={(event) =>
                        updateDraft(device.id, (current) => {
                          const nextRoutingMode = event.target.value as DeviceRoutingMode;
                          const nextSetId =
                            current.setId.trim().length > 0 && availableSetIds.has(current.setId)
                              ? current.setId
                              : firstAvailableSetId;
                          const nextLayoutName =
                            current.layoutName.trim().length > 0 &&
                            availableLayoutNames.has(current.layoutName)
                              ? current.layoutName
                              : firstAvailableLayoutName;

                          return {
                            ...current,
                            routingMode: nextRoutingMode,
                            setId: nextRoutingMode === "set" ? nextSetId : current.setId,
                            layoutName:
                              nextRoutingMode === "layout"
                                ? nextLayoutName
                                : current.layoutName,
                            preserveImplicitSelection: false,
                          };
                        })
                      }
                      className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
                    >
                      <option value="set">Follow set</option>
                      <option value="layout">Pin layout</option>
                    </select>
                  </label>

                  {draft.routingMode === "set" ? (
                    <label className="flex flex-col gap-2 text-sm text-slate-300">
                      <span>Layout set</span>
                      <select
                        value={draft.setId}
                        onChange={(event) =>
                          updateDraft(device.id, (current) => ({
                            ...current,
                            setId: event.target.value,
                            preserveImplicitSelection: false,
                          }))
                        }
                        className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
                      >
                        <option value="" disabled={availableSetOptions.length > 0}>
                          {availableSetOptions.length === 0 ? "No sets available" : "Choose a set..."}
                        </option>
                        {availableSetOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <label className="flex flex-col gap-2 text-sm text-slate-300">
                      <span>Pinned layout</span>
                      <select
                        value={draft.layoutName}
                        onChange={(event) =>
                          updateDraft(device.id, (current) => ({
                            ...current,
                            layoutName: event.target.value,
                            preserveImplicitSelection: false,
                          }))
                        }
                        className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
                      >
                        <option value="" disabled={layoutNames.length > 0}>
                          {layoutNames.length === 0 ? "No layouts available" : "Choose a layout..."}
                        </option>
                        {layoutNames.map((layoutName) => (
                          <option key={layoutName} value={layoutName}>
                            {layoutName}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </PageShell>
  );
};
