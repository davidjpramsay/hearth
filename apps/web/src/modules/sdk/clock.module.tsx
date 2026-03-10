import { useEffect, useState } from "react";
import { z } from "zod";
import {
  clampModulePresentationScale,
  withModulePresentation,
} from "@hearth/shared";
import { defineModule } from "@hearth/module-sdk";
import {
  ModulePresentationControls,
  scaleRoleRem,
} from "../ui/ModulePresentationControls";

const baseSettingsSchema = withModulePresentation(
  z.object({
    use24Hour: z.boolean().default(true),
    showSeconds: z.boolean().default(true),
    showDate: z.boolean().default(false),
  }),
);

const migrateLegacyClockFontSizes = (input: unknown): unknown => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return input;
  }

  const rawInput = input as Record<string, unknown>;
  const nextInput: Record<string, unknown> = { ...rawInput };
  const rawPresentation =
    rawInput.presentation && typeof rawInput.presentation === "object"
      ? (rawInput.presentation as Record<string, unknown>)
      : {};
  const nextPresentation: Record<string, unknown> = { ...rawPresentation };
  const timeFontSizeRem =
    typeof rawInput.timeFontSizeRem === "number" ? rawInput.timeFontSizeRem : null;
  const dateFontSizeRem =
    typeof rawInput.dateFontSizeRem === "number" ? rawInput.dateFontSizeRem : null;

  if (timeFontSizeRem !== null && typeof nextPresentation.primaryScale !== "number") {
    nextPresentation.primaryScale = clampModulePresentationScale(timeFontSizeRem / 2.25);
  }
  if (dateFontSizeRem !== null && typeof nextPresentation.supportingScale !== "number") {
    nextPresentation.supportingScale = clampModulePresentationScale(dateFontSizeRem / 1);
  }
  if (Object.keys(nextPresentation).length > 0) {
    nextInput.presentation = nextPresentation;
  }

  return nextInput;
};

const settingsSchema = z.preprocess(migrateLegacyClockFontSizes, baseSettingsSchema);

type Settings = z.infer<typeof settingsSchema>;

const SettingsPanel = ({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (next: Settings) => void;
}) => (
  <div className="space-y-4 rounded-lg border border-slate-700 bg-slate-900 p-4 text-sm text-slate-200">
    <h3 className="text-base font-semibold">Clock settings</h3>
    <label className="flex items-center justify-between">
      <span>Use 24-hour format</span>
      <input
        type="checkbox"
        checked={settings.use24Hour}
        onChange={(event) =>
          onChange({
            ...settings,
            use24Hour: event.target.checked,
          })
        }
      />
    </label>
    <label className="flex items-center justify-between">
      <span>Show seconds</span>
      <input
        type="checkbox"
        checked={settings.showSeconds}
        onChange={(event) =>
          onChange({
            ...settings,
            showSeconds: event.target.checked,
          })
        }
      />
    </label>
    <label className="flex items-center justify-between">
      <span>Show date</span>
      <input
        type="checkbox"
        checked={settings.showDate}
        onChange={(event) =>
          onChange({
            ...settings,
            showDate: event.target.checked,
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
    id: "clock",
    name: "Clock",
    version: "2.0.0",
    description: "Clock migrated to Hearth Module SDK",
    icon: "clock",
    defaultSize: { w: 3, h: 2 },
    timeMode: "device-local",
    categories: ["time"],
    permissions: [],
    dataSources: [{ id: "local-time", kind: "local" }],
  },
  settingsSchema,
  runtime: {
    Component: ({ settings }) => {
      const [now, setNow] = useState(() => new Date());

      useEffect(() => {
        const interval = window.setInterval(() => {
          setNow(new Date());
        }, 1000);

        return () => {
          window.clearInterval(interval);
        };
      }, []);

      const timeFormatter = new Intl.DateTimeFormat(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: settings.showSeconds ? "2-digit" : undefined,
        hour12: !settings.use24Hour,
      });

      const dateFormatter = new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });

      return (
        <div className="flex h-full w-full flex-col items-center justify-center rounded-xl bg-slate-800 text-cyan-300">
          {settings.showDate ? (
            <p
              className="mb-2 font-medium text-cyan-200"
              style={{ fontSize: scaleRoleRem(1, settings.presentation.supportingScale) }}
            >
              {dateFormatter.format(now)}
            </p>
          ) : null}
          <p
            className="font-semibold"
            style={{ fontSize: scaleRoleRem(2.25, settings.presentation.primaryScale) }}
          >
            {timeFormatter.format(now)}
          </p>
        </div>
      );
    },
  },
  admin: {
    SettingsPanel,
  },
});

export default moduleDefinition;
