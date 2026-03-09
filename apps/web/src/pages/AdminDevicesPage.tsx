import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  screenProfileLayoutsSchema,
  type DisplayDevice,
  type ReportScreenTargetSelection,
  type ScreenProfileLayouts,
} from "@hearth/shared";
import {
  getDisplayDevices,
  getLayouts,
  getScreenProfileLayouts,
  updateDisplayDevice,
} from "../api/client";
import { clearAuthToken, getAuthToken } from "../auth/storage";
import { AdminNavActions } from "../components/admin/AdminNavActions";
import { PageShell } from "../components/PageShell";
import { THEME_OPTIONS, type ThemeId } from "../theme/theme";

type DeviceRoutingMode = "inherit" | "set" | "layout";

interface DeviceDraft {
  name: string;
  themeId: ThemeId;
  routingMode: DeviceRoutingMode;
  setId: string;
  layoutName: string;
}

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
      routingMode: "inherit",
      setId: "",
      layoutName: "",
    };
  }

  if (normalizedTargetSelection.kind === "set") {
    return {
      name: input.device.name,
      themeId: input.device.themeId,
      routingMode: "set",
      setId: normalizedTargetSelection.setId ?? "",
      layoutName: "",
    };
  }

  return {
    name: input.device.name,
    themeId: input.device.themeId,
    routingMode: "layout",
    setId: "",
    layoutName: normalizedTargetSelection.layoutName ?? "",
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
    draft.routingMode === "inherit"
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
  if (draft.routingMode === "inherit") {
    return true;
  }

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
  const [busyDeviceId, setBusyDeviceId] = useState<string | null>(null);
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
      const nextAvailableLayoutNames = new Set(layoutsResponse.map((layout) => layout.name));
      setDrafts(
        Object.fromEntries(
          devicesResponse.devices.map((device) => [
            device.id,
            toDeviceDraft({
              device,
              availableSetIds: nextAvailableSetIds,
              availableLayoutNames: nextAvailableLayoutNames,
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
    clearAuthToken();
    navigate("/admin/login", { replace: true });
  }, [navigate]);

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
      setBusyDeviceId(deviceId);
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
        }),
      }));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to update device");
    } finally {
      setBusyDeviceId((current) => (current === deviceId ? null : current));
    }
  };

  return (
    <PageShell
      title="Devices"
      subtitle="Manage per-device display theme and routing."
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
              Devices appear here after they open the display page once.
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
              }),
            );
            const isValidDraft = hasValidRoutingTarget(draft);
            const isDirty = JSON.stringify(payload) !== JSON.stringify(baselinePayload);
            const isBusy = busyDeviceId === device.id;

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
                      Last seen: {formatLastSeen(device.lastSeenAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!isDirty || !isValidDraft || isBusy}
                    onClick={() => void onSaveDevice(device.id)}
                    className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isBusy ? "Saving..." : "Save changes"}
                  </button>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <label className="flex flex-col gap-2 text-sm text-slate-300">
                    <span>Name</span>
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
                    <span className="text-xs text-slate-400">Device names must be unique.</span>
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
                          };
                        })
                      }
                      className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
                    >
                      <option value="inherit">Inherit default</option>
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
                  ) : draft.routingMode === "layout" ? (
                    <label className="flex flex-col gap-2 text-sm text-slate-300">
                      <span>Pinned layout</span>
                      <select
                        value={draft.layoutName}
                        onChange={(event) =>
                          updateDraft(device.id, (current) => ({
                            ...current,
                            layoutName: event.target.value,
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
                  ) : (
                    <div className="rounded border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-400">
                      This device will use the default routing behavior.
                    </div>
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
