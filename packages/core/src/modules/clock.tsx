import { useEffect, useState } from "react";
import { z } from "zod";
import type { ModuleDefinition } from "@hearth/shared";
import {
  MODULE_PRESENTATION_SCALE_MAX,
  MODULE_PRESENTATION_SCALE_MIN,
  MODULE_PRESENTATION_SCALE_STEP,
  clampModulePresentationScale,
  withModulePresentation,
  type ModulePresentationSettings,
} from "@hearth/shared";

const scaleFieldMeta = [
  {
    key: "headingScale",
    label: "Heading size",
  },
  {
    key: "primaryScale",
    label: "Primary size",
  },
  {
    key: "supportingScale",
    label: "Supporting size",
  },
] as const satisfies ReadonlyArray<{
  key: keyof ModulePresentationSettings;
  label: string;
}>;

const formatScaleLabel = (value: number): string => `${Math.round(value * 100)}%`;

const scaleRoleRem = (baseRem: number, scale: number): string =>
  `${(baseRem * clampModulePresentationScale(scale, 1)).toFixed(3).replace(/\.?0+$/, "")}rem`;

const baseClockConfigSchema = withModulePresentation(
  z.object({
    use24Hour: z.boolean().default(true),
    showSeconds: z.boolean().default(true),
    showDate: z.boolean().default(false),
  }),
);

const migrateLegacyClockFontSizes = (config: unknown): unknown => {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return config;
  }

  const rawConfig = config as Record<string, unknown>;
  const nextConfig: Record<string, unknown> = { ...rawConfig };
  const rawPresentation =
    rawConfig.presentation && typeof rawConfig.presentation === "object"
      ? (rawConfig.presentation as Record<string, unknown>)
      : {};
  const nextPresentation: Record<string, unknown> = { ...rawPresentation };
  const timeFontSizeRem =
    typeof rawConfig.timeFontSizeRem === "number" ? rawConfig.timeFontSizeRem : null;
  const dateFontSizeRem =
    typeof rawConfig.dateFontSizeRem === "number" ? rawConfig.dateFontSizeRem : null;

  if (timeFontSizeRem !== null && typeof nextPresentation.primaryScale !== "number") {
    nextPresentation.primaryScale = clampModulePresentationScale(timeFontSizeRem / 2.25);
  }
  if (dateFontSizeRem !== null && typeof nextPresentation.supportingScale !== "number") {
    nextPresentation.supportingScale = clampModulePresentationScale(dateFontSizeRem / 1);
  }
  if (Object.keys(nextPresentation).length > 0) {
    nextConfig.presentation = nextPresentation;
  }

  return nextConfig;
};

const clockConfigSchema = z.preprocess(migrateLegacyClockFontSizes, baseClockConfigSchema);

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
          <p
            className="mb-2 font-medium text-cyan-200"
            style={{ fontSize: scaleRoleRem(1, normalizedConfig.presentation.supportingScale) }}
          >
            {dateFormatter.format(now)}
          </p>
        ) : null}
        <p
          className="font-semibold"
          style={{ fontSize: scaleRoleRem(2.25, normalizedConfig.presentation.primaryScale) }}
        >
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
        <div className="space-y-3 rounded border border-slate-700/80 bg-slate-950/40 p-3">
          <div>
            <p className="font-medium text-slate-100">Role sizing</p>
            <p className="text-xs text-slate-400">
              100% keeps the current default sizing for text, icons, emoji, and small visuals.
            </p>
          </div>
          {scaleFieldMeta.map((field) => (
            <label key={field.key} className="block space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <span>{field.label}</span>
                <span className="text-xs text-slate-400">
                  {formatScaleLabel(normalizedConfig.presentation[field.key])}
                </span>
              </div>
              <input
                className="w-full accent-cyan-400"
                type="range"
                min={MODULE_PRESENTATION_SCALE_MIN}
                max={MODULE_PRESENTATION_SCALE_MAX}
                step={MODULE_PRESENTATION_SCALE_STEP}
                value={normalizedConfig.presentation[field.key]}
                onChange={(event) =>
                  onChange({
                    ...normalizedConfig,
                    presentation: {
                      ...normalizedConfig.presentation,
                      [field.key]: clampModulePresentationScale(
                        Number.parseFloat(event.target.value),
                        normalizedConfig.presentation[field.key],
                      ),
                    },
                  })
                }
              />
            </label>
          ))}
          <p className="text-xs text-slate-500">
            Roles stay the same across modules, but each module only maps the elements it uses.
          </p>
        </div>
      </div>
    );
  },
};
