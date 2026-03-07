import { useEffect, useState } from "react";
import { z } from "zod";
import { defineModule } from "@hearth/module-sdk";

const settingsSchema = z.object({
  use24Hour: z.boolean().default(true),
  showSeconds: z.boolean().default(true),
  showDate: z.boolean().default(false),
  timeFontSizeRem: z.number().min(1.5).max(8).default(2.25),
  dateFontSizeRem: z.number().min(0.75).max(4).default(1),
});

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
    <label className="block space-y-2">
      <span>Time font size (rem)</span>
      <input
        className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
        type="number"
        min={1.5}
        max={8}
        step={0.25}
        value={settings.timeFontSizeRem}
        onChange={(event) =>
          onChange({
            ...settings,
            timeFontSizeRem: Number(event.target.value) || settings.timeFontSizeRem,
          })
        }
      />
    </label>
    <label className="block space-y-2">
      <span>Date font size (rem)</span>
      <input
        className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
        type="number"
        min={0.75}
        max={4}
        step={0.125}
        value={settings.dateFontSizeRem}
        onChange={(event) =>
          onChange({
            ...settings,
            dateFontSizeRem: Number(event.target.value) || settings.dateFontSizeRem,
          })
        }
      />
    </label>
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
              style={{ fontSize: `${settings.dateFontSizeRem}rem` }}
            >
              {dateFormatter.format(now)}
            </p>
          ) : null}
          <p className="font-semibold" style={{ fontSize: `${settings.timeFontSizeRem}rem` }}>
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
