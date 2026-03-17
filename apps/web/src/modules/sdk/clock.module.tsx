import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import {
  clampModulePresentationScale,
  withModulePresentation,
} from "@hearth/shared";
import { defineModule } from "@hearth/module-sdk";
import {
  ModulePresentationControls,
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
    hour: use24Hour ? "2-digit" : "numeric",
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
    Component: ({ settings, isEditing }) => {
      const { ref, metrics } = useTileDensity<HTMLDivElement>();
      const [now, setNow] = useState(() => new Date());

      useEffect(() => {
        if (isEditing) {
          return;
        }

        const interval = window.setInterval(() => {
          setNow(new Date());
        }, 1000);

        return () => {
          window.clearInterval(interval);
        };
      }, [isEditing]);

      const dateFormatter = new Intl.DateTimeFormat(undefined, {
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
      const showTimeMeta = settings.showSeconds || (!settings.use24Hour && timeParts.dayPeriod);
      const inlineTime = settings.showSeconds
        ? `${timeParts.primary}:${timeParts.second}`
        : timeParts.primary;
      const inlineDayPeriod =
        !settings.use24Hour && timeParts.dayPeriod
          ? timeParts.dayPeriod.toLowerCase()
          : null;
      const timeRowClass = compact ? "items-end gap-2.5" : "items-end gap-3";
      const timeInlineMetaClass = compact ? "module-text-body" : "module-text-title";

      if (isEditing) {
        return (
          <div className="module-panel-shell flex h-full flex-col justify-between px-4 py-4 text-[color:var(--color-text-primary)]">
            <div>
              <p className="module-text-small font-display uppercase tracking-[0.18em] text-[color:rgb(var(--tone-slate-200-rgb)/0.68)]">
                Local time
              </p>
              <p className="module-text-title mt-2 text-[color:var(--color-text-primary)]">
                Clock preview
              </p>
            </div>
            <div className="module-panel-card w-fit px-3 py-2">
              <p className="module-text-body text-[color:var(--color-text-primary)]">
                {settings.use24Hour ? "24-hour" : "12-hour"} format
              </p>
              <p className="module-text-small mt-1 text-[color:var(--color-text-secondary)]">
                Seconds: {settings.showSeconds ? "Shown" : "Hidden"} | Date:{" "}
                {settings.showDate ? "Shown" : "Hidden"}
              </p>
            </div>
          </div>
        );
      }

      return (
        <div
          ref={ref}
          className="module-panel-shell relative isolate flex h-full w-full text-[color:var(--color-text-primary)]"
        >
          <div className="relative z-10 flex h-full w-full flex-col justify-between gap-4 px-4 py-4">
            {settings.showDate ? (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="module-text-small font-display uppercase tracking-[0.18em] text-[color:rgb(var(--tone-slate-200-rgb)/0.68)]">
                    {dayFormatter.format(now)}
                  </p>
                  <p
                    className={`mt-1 font-medium text-[color:var(--color-text-primary)] ${
                      "module-text-body"
                    }`}
                  >
                    {dateFormatter.format(now)}
                  </p>
                </div>
              </div>
            ) : null}

            <div className={`flex w-full ${timeRowClass}`}>
              <p
                className={`font-semibold leading-none text-[color:var(--color-text-accent)] ${
                  "module-text-display"
                }`}
              >
                {inlineTime}
                {inlineDayPeriod ? (
                  <span
                    className={`${timeInlineMetaClass} ml-2 align-baseline font-medium text-[color:var(--color-text-secondary)]`}
                  >
                    {inlineDayPeriod}
                  </span>
                ) : null}
              </p>
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
