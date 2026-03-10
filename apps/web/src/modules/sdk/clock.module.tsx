import { useEffect, useMemo, useState } from "react";
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
import { useTileDensity } from "../ui/useTileDensity";

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

const buildClockParts = (date: Date, use24Hour: boolean) => {
  const parts = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: !use24Hour,
  }).formatToParts(date);

  const hour = parts.find((part) => part.type === "hour")?.value ?? "--";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "--";
  const second = parts.find((part) => part.type === "second")?.value ?? "--";
  const dayPeriod = parts.find((part) => part.type === "dayPeriod")?.value ?? null;
  const separator =
    parts.find(
      (part, index) =>
        part.type === "literal" &&
        parts[index - 1]?.type === "hour" &&
        parts[index + 1]?.type === "minute",
    )?.value ?? ":";

  return {
    primary: `${hour}${separator}${minute}`,
    second,
    dayPeriod,
  };
};

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
      const { ref, metrics } = useTileDensity<HTMLDivElement>();
      const [now, setNow] = useState(() => new Date());

      useEffect(() => {
        const interval = window.setInterval(() => {
          setNow(new Date());
        }, 1000);

        return () => {
          window.clearInterval(interval);
        };
      }, []);

      const dateFormatter = new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const dayFormatter = new Intl.DateTimeFormat(undefined, {
        weekday: "long",
      });
      const timeParts = useMemo(
        () => buildClockParts(now, settings.use24Hour),
        [now, settings.use24Hour],
      );
      const compact = metrics.width < 320 || metrics.height < 150;

      return (
        <div
          ref={ref}
          className="module-panel-shell relative isolate flex h-full w-full text-[color:var(--color-text-primary)]"
        >
          <div
            className={`relative z-10 flex h-full w-full flex-col ${
              compact
                ? "justify-between gap-3 px-4 py-4"
                : "items-center justify-center gap-4 px-5 py-5"
            }`}
          >
            <div
              className={`flex w-full ${compact ? "items-start justify-between gap-3" : "flex-col items-center gap-3"}`}
            >
              {settings.showDate ? (
                <div className="module-panel-chip rounded-full px-3 py-1.5 text-center">
                  <p
                    className="font-medium text-[color:var(--color-text-secondary)]"
                    style={{
                      fontSize: scaleRoleRem(
                        compact ? 0.82 : 0.98,
                        settings.presentation.supportingScale,
                      ),
                    }}
                  >
                    {dateFormatter.format(now)}
                  </p>
                </div>
              ) : (
                <p
                  className="module-panel-label"
                  style={{
                    fontSize: scaleRoleRem(0.6, settings.presentation.supportingScale),
                  }}
                >
                  {dayFormatter.format(now)}
                </p>
              )}
            </div>

            <div
              className={`flex w-full items-end ${
                compact ? "justify-between gap-3" : "justify-center gap-4"
              }`}
            >
              <p
                className="font-semibold leading-none tracking-[-0.06em] text-[color:var(--color-text-accent)]"
                style={{
                  fontSize: scaleRoleRem(
                    compact ? 2.2 : 2.9,
                    settings.presentation.primaryScale,
                  ),
                }}
              >
                {timeParts.primary}
              </p>

              {settings.showSeconds ? (
                <div className="module-panel-card mb-[0.2em] rounded-2xl px-3 py-2 text-right">
                  <p
                    className="font-semibold leading-none text-[color:var(--color-text-primary)]"
                    style={{
                      fontSize: scaleRoleRem(
                        compact ? 0.95 : 1.15,
                        settings.presentation.headingScale,
                      ),
                    }}
                  >
                    {timeParts.second}
                  </p>
                  {!settings.use24Hour && timeParts.dayPeriod ? (
                    <p
                      className="mt-1 text-[color:var(--color-text-muted)]"
                      style={{
                        fontSize: scaleRoleRem(0.5, settings.presentation.supportingScale),
                        letterSpacing: "0.22em",
                        textTransform: "uppercase",
                      }}
                    >
                      {timeParts.dayPeriod}
                    </p>
                  ) : null}
                </div>
              ) : !settings.use24Hour && timeParts.dayPeriod ? (
                <div className="module-panel-card mb-[0.2em] rounded-full px-3 py-1.5">
                  <p
                    className="text-[color:var(--color-text-muted)]"
                    style={{
                      fontSize: scaleRoleRem(0.62, settings.presentation.supportingScale),
                      letterSpacing: "0.24em",
                      textTransform: "uppercase",
                    }}
                  >
                    {timeParts.dayPeriod}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      );
    },
  },
  admin: {
    SettingsPanel,
  },
});

export default moduleDefinition;
