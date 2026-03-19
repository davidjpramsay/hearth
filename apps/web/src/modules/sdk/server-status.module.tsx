import { z } from "zod";
import { withModulePresentation } from "@hearth/shared";
import { defineModule } from "@hearth/module-sdk";
import { getServerStatus, serverStatusResponseSchema } from "../../api/server-status";
import { useModuleQuery } from "../data/useModuleQuery";
import { ModuleFrame } from "../ui/ModuleFrame";
import { ModulePresentationControls } from "../ui/ModulePresentationControls";

const settingsSchema = withModulePresentation(
  z.object({
    pollSeconds: z.number().int().min(5).max(300).default(30),
    showMemory: z.boolean().default(true),
  }),
);

type Settings = z.infer<typeof settingsSchema>;

const formatBytes = (value: number): string => {
  const units = ["B", "KB", "MB", "GB"];
  let unitIndex = 0;
  let current = value;

  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }

  return `${current.toFixed(1)} ${units[unitIndex]}`;
};

const SettingsPanel = ({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (next: Settings) => void;
}) => (
  <div className="space-y-4 rounded-lg border border-slate-700 bg-slate-900 p-4 text-sm text-slate-200">
    <h3 className="text-base font-semibold">Server status settings</h3>
    <label className="block space-y-2">
      <span>Polling interval (seconds)</span>
      <input
        className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
        type="number"
        min={5}
        max={300}
        step={1}
        value={settings.pollSeconds}
        onChange={(event) =>
          onChange({
            ...settings,
            pollSeconds: Number(event.target.value) || settings.pollSeconds,
          })
        }
      />
    </label>
    <label className="flex items-center justify-between">
      <span>Show memory stats</span>
      <input
        type="checkbox"
        checked={settings.showMemory}
        onChange={(event) =>
          onChange({
            ...settings,
            showMemory: event.target.checked,
          })
        }
      />
    </label>
    <ModulePresentationControls
      value={settings.presentation}
      onChange={(presentation) =>
        onChange({
          ...settings,
          presentation,
        })
      }
    />
  </div>
);

export const moduleDefinition = defineModule({
  manifest: {
    id: "server-status",
    name: "Server status",
    version: "1.0.0",
    description: "REST-backed module using the server adapter layer",
    icon: "activity",
    defaultSize: { w: 4, h: 3 },
    categories: ["system", "examples"],
    permissions: ["network"],
    dataSources: [{ id: "server-status-rest", kind: "rest", pollMs: 30_000 }],
  },
  settingsSchema,
  dataSchema: serverStatusResponseSchema,
  runtime: {
    Component: ({ settings, isEditing }) => {
      const status = useModuleQuery({
        key: `server-status:${settings.pollSeconds}`,
        queryFn: getServerStatus,
        intervalMs: settings.pollSeconds * 1000,
        staleMs: Math.max(1000, settings.pollSeconds * 1000 - 1000),
        enabled: !isEditing,
      });

      if (isEditing) {
        return (
          <div className="flex h-full flex-col justify-center rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-3 text-slate-200">
            <p className="module-copy-title text-slate-100">Server status preview</p>
            <p className="module-copy-meta mt-2 text-slate-300">
              Poll every {settings.pollSeconds}s
            </p>
            <p className="module-copy-meta mt-1 text-slate-400">
              Memory stats: {settings.showMemory ? "Shown" : "Hidden"}
            </p>
          </div>
        );
      }

      return (
        <ModuleFrame
          title="Server status"
          loading={status.loading}
          error={status.error}
          lastUpdatedMs={status.lastUpdatedMs}
          disconnected={status.isDisconnected}
          statusLabel={status.data?.ok ? "Healthy" : "Degraded"}
          empty={!status.data && !status.loading && !status.error}
          emptyMessage="No server status data available"
        >
          {status.data ? (
            <div className="space-y-3 rounded border border-slate-700 bg-slate-950/60 p-3 text-slate-100">
              <div className="module-copy-body text-slate-300">Service: {status.data.service}</div>
              <div className="module-copy-body text-slate-300">
                Uptime: {Math.floor(status.data.uptimeSeconds)}s
              </div>
              {settings.showMemory && status.data.memory ? (
                <div className="module-copy-meta text-slate-400">
                  <p>RSS: {formatBytes(status.data.memory.rss)}</p>
                  <p>Heap used: {formatBytes(status.data.memory.heapUsed)}</p>
                  <p>Heap total: {formatBytes(status.data.memory.heapTotal)}</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </ModuleFrame>
      );
    },
  },
  admin: {
    SettingsPanel,
  },
});

export default moduleDefinition;
