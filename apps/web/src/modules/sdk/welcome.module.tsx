import { z } from "zod";
import { withModulePresentation } from "@hearth/shared";
import { defineModule } from "@hearth/module-sdk";
import { ModulePresentationControls } from "../ui/ModulePresentationControls";

const settingsSchema = withModulePresentation(
  z.object({
    message: z.string().max(240).default("Welcome to Hearth"),
  }),
);

type WelcomeConfig = z.infer<typeof settingsSchema>;

export const moduleDefinition = defineModule({
  manifest: {
    id: "welcome",
    name: "Welcome module",
    version: "2.0.0",
    description: "Welcome module migrated to Hearth Module SDK",
    icon: "message-square",
    defaultSize: { w: 4, h: 2 },
    categories: ["text"],
    permissions: [],
    dataSources: [{ id: "local", kind: "local" }],
  },
  settingsSchema,
  runtime: {
    Component: ({ settings }) => (
      <div className="module-panel-shell flex h-full w-full items-center justify-center px-4 text-center text-slate-100">
        <p className="module-copy-title text-balance">{settings.message}</p>
      </div>
    ),
  },
  admin: {
    SettingsPanel: ({
      settings,
      onChange,
    }: {
      settings: WelcomeConfig;
      onChange: (next: WelcomeConfig) => void;
    }) => (
      <div className="space-y-4 rounded-lg border border-slate-700 bg-slate-900 p-4 text-sm text-slate-200">
        <h3 className="text-base font-semibold">Welcome settings</h3>
        <label className="block space-y-2">
          <span>Message</span>
          <input
            className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
            type="text"
            value={settings.message}
            onChange={(event) => onChange({ ...settings, message: event.target.value })}
          />
        </label>
        <ModulePresentationControls
          value={settings.presentation}
          onChange={(presentation) => onChange({ ...settings, presentation })}
        />
      </div>
    ),
  },
});

export default moduleDefinition;
