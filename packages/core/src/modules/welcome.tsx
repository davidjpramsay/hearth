import { z } from "zod";
import type { ModuleDefinition } from "@hearth/shared";

const welcomeConfigSchema = z.object({
  message: z.string().min(1).default("Welcome to Hearth"),
});

type WelcomeConfig = z.infer<typeof welcomeConfigSchema>;

export const welcomeModule: ModuleDefinition<WelcomeConfig> = {
  id: "welcome",
  displayName: "Welcome module",
  defaultSize: { w: 4, h: 2 },
  configSchema: welcomeConfigSchema,
  DashboardTile: ({ config }) => (
    <div className="flex h-full w-full items-center justify-center rounded-xl bg-slate-800 px-4 text-center text-xl font-medium text-slate-100">
      {config.message}
    </div>
  ),
  SettingsPanel: ({ config, onChange }) => (
    <div className="space-y-3 rounded-lg border border-slate-700 bg-slate-900 p-4 text-sm text-slate-200">
      <h3 className="text-base font-semibold">Welcome settings</h3>
      <label className="block space-y-2">
        <span>Message</span>
        <input
          className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
          type="text"
          value={config.message}
          onChange={(event) => onChange({ ...config, message: event.target.value })}
        />
      </label>
    </div>
  ),
};
