import { useEffect, useState } from "react";
import { z } from "zod";
import type { ModuleDefinition } from "@hearth/shared";

const clockConfigSchema = z.object({
  use24Hour: z.boolean().default(true),
  showSeconds: z.boolean().default(true),
  showDate: z.boolean().default(false),
});

type ClockConfig = z.infer<typeof clockConfigSchema>;
const DEFAULT_CONFIG = clockConfigSchema.parse({});

const normalizeConfig = (config: unknown): ClockConfig => {
  const parsedConfig = clockConfigSchema.safeParse(config);
  return parsedConfig.success ? parsedConfig.data : DEFAULT_CONFIG;
};

export const clockModule: ModuleDefinition<ClockConfig> = {
  id: "clock",
  displayName: "Clock",
  defaultSize: { w: 3, h: 2 },
  configSchema: clockConfigSchema,
  DashboardTile: ({ config }) => {
    const normalizedConfig = normalizeConfig(config);
    const [now, setNow] = useState(new Date());

    useEffect(() => {
      const timer = window.setInterval(() => {
        setNow(new Date());
      }, 1000);

      return () => window.clearInterval(timer);
    }, []);

    const timeFormatter = new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: normalizedConfig.showSeconds ? "2-digit" : undefined,
      hour12: !normalizedConfig.use24Hour,
    });
    const dateFormatter = new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    return (
      <div className="flex h-full w-full flex-col items-center justify-center rounded-xl bg-slate-800 text-cyan-300">
        {normalizedConfig.showDate ? (
          <p className="mb-2 font-medium text-cyan-200" style={{ fontSize: "1rem" }}>
            {dateFormatter.format(now)}
          </p>
        ) : null}
        <p className="font-semibold" style={{ fontSize: "2.25rem" }}>
          {timeFormatter.format(now)}
        </p>
      </div>
    );
  },
  SettingsPanel: ({ config, onChange }) => {
    const normalizedConfig = normalizeConfig(config);

    return (
      <div className="space-y-4 rounded-lg border border-slate-700 bg-slate-900 p-4 text-sm text-slate-200">
        <h3 className="text-base font-semibold">Clock settings</h3>
        <label className="flex items-center justify-between">
          <span>Use 24-hour format</span>
          <input
            type="checkbox"
            checked={normalizedConfig.use24Hour}
            onChange={(event) =>
              onChange({
                ...normalizedConfig,
                use24Hour: event.target.checked,
              })
            }
          />
        </label>
        <label className="flex items-center justify-between">
          <span>Show seconds</span>
          <input
            type="checkbox"
            checked={normalizedConfig.showSeconds}
            onChange={(event) =>
              onChange({
                ...normalizedConfig,
                showSeconds: event.target.checked,
              })
            }
          />
        </label>
        <label className="flex items-center justify-between">
          <span>Show date</span>
          <input
            type="checkbox"
            checked={normalizedConfig.showDate}
            onChange={(event) =>
              onChange({
                ...normalizedConfig,
                showDate: event.target.checked,
              })
            }
          />
        </label>
      </div>
    );
  },
};
