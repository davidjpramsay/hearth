import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import {
  clampModulePresentationScale,
  getRuntimeTimeZone,
  isValidIanaTimeZone,
  withModulePresentation,
} from "@hearth/shared";
import { defineModule } from "@hearth/module-sdk";
import {
  addDisplayTimeContextListener,
  getDisplayNow,
  getDisplaySiteTimeZone,
} from "../../runtime/display-time";
import { getSupportedTimeZoneOptions } from "../../time-zone-options";
import { ModulePresentationControls } from "../ui/ModulePresentationControls";
import { useTileDensity } from "../ui/useTileDensity";

const clockDateLayoutSchema = z.enum(["stacked", "inline"]);
const clockTimeSourceSchema = z.enum(["household", "specific", "device"]);
const CLOCK_TIME_ZONE_DATALIST_ID = "clock-module-time-zones";

const baseSettingsSchema = withModulePresentation(
  z.object({
    use24Hour: z.boolean().default(true),
    showSeconds: z.boolean().default(true),
    showDate: z.boolean().default(false),
    dateLayout: clockDateLayoutSchema.default("stacked"),
    reverseOrder: z.boolean().default(false),
    timeSource: clockTimeSourceSchema.default("household"),
    customTimeZone: z.string().trim().max(120).default(""),
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

const describeTimeSource = (settings: Settings): string => {
  if (settings.timeSource === "device") {
    return "Device local";
  }

  if (settings.timeSource === "specific") {
    return isValidIanaTimeZone(settings.customTimeZone)
      ? settings.customTimeZone
      : "Specific timezone (fallback to household)";
  }

  return "Household time";
};

const resolveClockTimeZone = (settings: Settings, siteTimeZone: string): string => {
  if (settings.timeSource === "device") {
    return getRuntimeTimeZone();
  }

  if (settings.timeSource === "specific" && isValidIanaTimeZone(settings.customTimeZone)) {
    return settings.customTimeZone;
  }

  return siteTimeZone;
};

const buildClockParts = (date: Date, use24Hour: boolean, timeZone: string) => {
  const parts = new Intl.DateTimeFormat(undefined, {
    hour: use24Hour ? "2-digit" : "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: !use24Hour,
    timeZone,
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
    <label className="flex items-center justify-between gap-3">
      <span>Time source</span>
      <select
        className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
        value={settings.timeSource}
        onChange={(event) =>
          onChange({
            ...settings,
            timeSource: clockTimeSourceSchema.parse(event.target.value),
          })
        }
      >
        <option value="household">Household time</option>
        <option value="specific">Specific timezone</option>
        <option value="device">Device local time</option>
      </select>
    </label>
    {settings.timeSource === "specific" ? (
      <label className="block space-y-2">
        <span>Timezone</span>
        <input
          list={CLOCK_TIME_ZONE_DATALIST_ID}
          className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
          value={settings.customTimeZone}
          onChange={(event) =>
            onChange({
              ...settings,
              customTimeZone: event.target.value,
            })
          }
          placeholder="Australia/Perth"
        />
        <datalist id={CLOCK_TIME_ZONE_DATALIST_ID}>
          {getSupportedTimeZoneOptions().map((timeZone) => (
            <option key={timeZone} value={timeZone} />
          ))}
        </datalist>
        <p className="text-xs text-slate-400">
          Use an IANA timezone like `Australia/Perth` or `America/New_York`.
        </p>
      </label>
    ) : null}
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
    <label className="flex items-center justify-between gap-3">
      <span>Date layout</span>
      <select
        className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        value={settings.dateLayout}
        disabled={!settings.showDate}
        onChange={(event) =>
          onChange({
            ...settings,
            dateLayout: clockDateLayoutSchema.parse(event.target.value),
          })
        }
      >
        <option value="stacked">Stacked</option>
        <option value="inline">Side by side</option>
      </select>
    </label>
    <label className="flex items-center justify-between">
      <span>Reverse order</span>
      <input
        type="checkbox"
        checked={settings.reverseOrder}
        disabled={!settings.showDate}
        onChange={(event) =>
          onChange({
            ...settings,
            reverseOrder: event.target.checked,
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
    version: "2.2.0",
    description: "Clock migrated to Hearth Module SDK",
    icon: "clock",
    defaultSize: { w: 3, h: 2 },
    timeMode: "site-local",
    categories: ["time"],
    permissions: [],
    dataSources: [{ id: "local-time", kind: "local" }],
  },
  settingsSchema,
  runtime: {
    Component: ({ settings, isEditing }) => {
      const { ref, metrics } = useTileDensity<HTMLDivElement>();
      const [siteTimeZone, setSiteTimeZone] = useState(() => getDisplaySiteTimeZone());
      const [now, setNow] = useState(() => getDisplayNow());

      useEffect(() => {
        if (isEditing) {
          return;
        }

        const syncTime = () => {
          setSiteTimeZone(getDisplaySiteTimeZone());
          setNow(getDisplayNow());
        };
        const interval = window.setInterval(() => {
          setNow(getDisplayNow());
        }, 1000);
        const removeDisplayTimeListener = addDisplayTimeContextListener(() => {
          syncTime();
        });
        syncTime();

        return () => {
          window.clearInterval(interval);
          removeDisplayTimeListener();
        };
      }, [isEditing]);

      const resolvedTimeZone = resolveClockTimeZone(settings, siteTimeZone);
      const dateFormatter = useMemo(
        () =>
          new Intl.DateTimeFormat(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
            timeZone: resolvedTimeZone,
          }),
        [resolvedTimeZone],
      );
      const compactDateFormatter = useMemo(
        () =>
          new Intl.DateTimeFormat(undefined, {
            month: "short",
            day: "numeric",
            timeZone: resolvedTimeZone,
          }),
        [resolvedTimeZone],
      );
      const dayFormatter = useMemo(
        () =>
          new Intl.DateTimeFormat(undefined, {
            weekday: "long",
            timeZone: resolvedTimeZone,
          }),
        [resolvedTimeZone],
      );
      const compactDayFormatter = useMemo(
        () =>
          new Intl.DateTimeFormat(undefined, {
            weekday: "short",
            timeZone: resolvedTimeZone,
          }),
        [resolvedTimeZone],
      );
      const timeParts = useMemo(
        () => buildClockParts(now, settings.use24Hour, resolvedTimeZone),
        [now, resolvedTimeZone, settings.use24Hour],
      );
      const hasTileMeasurement = metrics.width > 0 && metrics.height > 0;
      const compact = hasTileMeasurement && (metrics.width < 320 || metrics.height < 150);
      const inlineMinimumWidth = settings.showSeconds || !settings.use24Hour ? 460 : 360;
      const shouldStackInlineDateLayout =
        hasTileMeasurement && (metrics.width < inlineMinimumWidth || metrics.height < 160);
      const inlineTime = settings.showSeconds
        ? `${timeParts.primary}:${timeParts.second}`
        : timeParts.primary;
      const inlineDayPeriod =
        !settings.use24Hour && timeParts.dayPeriod ? timeParts.dayPeriod : null;
      const timeRowClass = compact ? "items-baseline gap-2" : "items-baseline gap-2.5";
      const useInlineDateLayout =
        settings.showDate && settings.dateLayout === "inline" && !shouldStackInlineDateLayout;
      const dateText = compact ? compactDateFormatter.format(now) : dateFormatter.format(now);
      const weekdayText = compact ? compactDayFormatter.format(now) : dayFormatter.format(now);
      const orderedContentKeys: Array<"date" | "time"> =
        settings.showDate && settings.reverseOrder ? ["time", "date"] : ["date", "time"];
      const contentShellClass = `relative z-10 flex h-full w-full flex-col ${
        !settings.showDate || useInlineDateLayout ? "justify-center" : "justify-between"
      } gap-5 px-4 py-4`;

      if (isEditing) {
        return (
          <div className="module-panel-shell flex h-full flex-col justify-between px-4 py-4 text-[color:var(--color-text-primary)]">
            <div className="module-stack-compact">
              <p className="module-copy-label text-[color:rgb(var(--tone-slate-200-rgb)/0.68)]">
                Site time
              </p>
              <p className="module-copy-title text-[color:var(--color-text-primary)]">
                Clock preview
              </p>
            </div>
            <div className="module-panel-card w-fit px-3 py-2">
              <p className="module-copy-body text-[color:var(--color-text-primary)]">
                {settings.use24Hour ? "24-hour" : "12-hour"} format
              </p>
              <p className="module-copy-meta mt-1 text-[color:var(--color-text-secondary)]">
                Source: {describeTimeSource(settings)}
              </p>
              <p className="module-copy-meta mt-1 text-[color:var(--color-text-secondary)]">
                Seconds: {settings.showSeconds ? "Shown" : "Hidden"} | Date:{" "}
                {settings.showDate
                  ? `${settings.dateLayout === "inline" ? "Side by side" : "Stacked"} (${settings.reverseOrder ? "Time first" : "Date first"})`
                  : "Hidden"}
              </p>
            </div>
          </div>
        );
      }

      const dateBlock = settings.showDate ? (
        <div
          key="date"
          className={
            useInlineDateLayout
              ? "module-stack-compact min-w-0 shrink-0 self-end pb-1 text-left"
              : "module-stack-compact min-w-0 shrink-0"
          }
        >
          <p className="module-copy-label truncate text-[color:rgb(var(--tone-slate-200-rgb)/0.68)]">
            {weekdayText}
          </p>
          <p className="module-copy-body truncate text-[color:var(--color-text-primary)]">
            {dateText}
          </p>
        </div>
      ) : null;
      const timeBlock = (
        <div
          key="time"
          className={
            useInlineDateLayout
              ? `flex min-w-0 shrink-0 ${timeRowClass}`
              : `flex w-full ${timeRowClass}`
          }
        >
          <div className="flex min-w-0 items-baseline gap-2.5">
            <p className="module-copy-hero leading-none text-[color:var(--color-text-accent)]">
              {inlineTime}
            </p>
            {inlineDayPeriod ? (
              <span className="module-copy-label mb-[0.2em] shrink-0 text-[color:var(--color-text-secondary)]">
                {inlineDayPeriod}
              </span>
            ) : null}
          </div>
        </div>
      );
      const contentByKey = {
        date: dateBlock,
        time: timeBlock,
      } as const;

      return (
        <div
          ref={ref}
          className="module-panel-shell relative isolate flex h-full w-full text-[color:var(--color-text-primary)]"
        >
          <div className={contentShellClass}>
            {useInlineDateLayout ? (
              <div className="flex w-fit max-w-full flex-wrap items-end justify-start gap-x-8 gap-y-3">
                {orderedContentKeys.map((key) => contentByKey[key])}
              </div>
            ) : (
              orderedContentKeys.map((key) => contentByKey[key])
            )}
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
