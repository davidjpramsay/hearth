import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { z } from "zod";
import { withModulePresentation } from "@hearth/shared";
import { defineModule } from "@hearth/module-sdk";
import { ModulePresentationControls } from "../ui/ModulePresentationControls";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const SECOND_MS = 1000;
const DATE_INPUT_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const toDateInputValue = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const defaultTargetDate = (): string => {
  const nextDay = new Date();
  nextDay.setDate(nextDay.getDate() + 1);
  return toDateInputValue(nextDay);
};

const settingsSchema = withModulePresentation(
  z.object({
    eventName: z.string().trim().max(80).default("Upcoming Event"),
    mode: z.enum(["date", "time"]).default("date"),
    targetDate: z.string().regex(DATE_INPUT_REGEX).default(defaultTargetDate()),
    days: z.number().int().min(0).max(3650).default(0),
    hours: z.number().int().min(0).max(23).default(1),
    minutes: z.number().int().min(0).max(59).default(0),
    seconds: z.number().int().min(0).max(59).default(0),
  }),
);

type Settings = z.infer<typeof settingsSchema>;

type CountdownParts = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

const parseDateInputToMs = (value: string): number | null => {
  if (!DATE_INPUT_REGEX.test(value)) {
    return null;
  }

  const [yearPart, monthPart, dayPart] = value.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return null;
  }

  const parsed = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed.getTime();
};

const durationToMs = (settings: Settings): number =>
  settings.days * DAY_MS +
  settings.hours * HOUR_MS +
  settings.minutes * MINUTE_MS +
  settings.seconds * SECOND_MS;

const splitDuration = (remainingMs: number): CountdownParts => {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));

  const days = Math.floor(totalSeconds / (24 * 60 * 60));
  const afterDays = totalSeconds - days * 24 * 60 * 60;
  const hours = Math.floor(afterDays / (60 * 60));
  const afterHours = afterDays - hours * 60 * 60;
  const minutes = Math.floor(afterHours / 60);
  const seconds = afterHours - minutes * 60;

  return {
    days,
    hours,
    minutes,
    seconds,
  };
};

const parseBoundedInteger = (
  value: string,
  min: number,
  max: number,
  fallback: number,
): number => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, parsed));
};

const SettingsPanel = ({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (next: Settings) => void;
}) => (
  <div className="space-y-4 rounded-lg border border-slate-700 bg-slate-900 p-4 text-sm text-slate-200">
    <h3 className="text-base font-semibold">Count Down settings</h3>

    <label className="block space-y-2">
      <span>Event name</span>
      <input
        className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
        type="text"
        maxLength={80}
        value={settings.eventName}
        onChange={(event) =>
          onChange({
            ...settings,
            eventName: event.target.value,
          })
        }
      />
    </label>

    <label className="block space-y-2">
      <span>Countdown type</span>
      <select
        className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
        value={settings.mode}
        onChange={(event) =>
          onChange({
            ...settings,
            mode: event.target.value === "time" ? "time" : "date",
          })
        }
      >
        <option value="date">Date</option>
        <option value="time">Time (days/hours/minutes/seconds)</option>
      </select>
    </label>

    {settings.mode === "date" ? (
      <label className="block space-y-2">
        <span>Event date</span>
        <input
          className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
          type="date"
          value={settings.targetDate}
          onChange={(event) =>
            onChange({
              ...settings,
              targetDate: event.target.value || settings.targetDate,
            })
          }
        />
      </label>
    ) : (
      <div className="space-y-3">
        <p className="text-slate-300">Start duration</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1">
            <span className="text-xs text-slate-300">Days</span>
            <input
              className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
              type="number"
              min={0}
              max={3650}
              value={settings.days}
              onChange={(event) =>
                onChange({
                  ...settings,
                  days: parseBoundedInteger(event.target.value, 0, 3650, settings.days),
                })
              }
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-slate-300">Hours</span>
            <input
              className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
              type="number"
              min={0}
              max={23}
              value={settings.hours}
              onChange={(event) =>
                onChange({
                  ...settings,
                  hours: parseBoundedInteger(event.target.value, 0, 23, settings.hours),
                })
              }
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-slate-300">Minutes</span>
            <input
              className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
              type="number"
              min={0}
              max={59}
              value={settings.minutes}
              onChange={(event) =>
                onChange({
                  ...settings,
                  minutes: parseBoundedInteger(event.target.value, 0, 59, settings.minutes),
                })
              }
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-slate-300">Seconds</span>
            <input
              className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
              type="number"
              min={0}
              max={59}
              value={settings.seconds}
              onChange={(event) =>
                onChange({
                  ...settings,
                  seconds: parseBoundedInteger(event.target.value, 0, 59, settings.seconds),
                })
              }
            />
          </label>
        </div>
      </div>
    )}

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
    id: "count-down",
    name: "Count Down",
    version: "1.0.0",
    description: "Countdown timer with date or duration modes",
    icon: "timer",
    defaultSize: { w: 4, h: 2 },
    timeMode: "device-local",
    categories: ["time"],
    permissions: [],
    dataSources: [{ id: "local-time", kind: "local" }],
  },
  settingsSchema,
  runtime: {
    Component: ({ instanceId, settings, isEditing }) => {
      const [nowMs, setNowMs] = useState(() => Date.now());
      const [durationTargetMs, setDurationTargetMs] = useState(() =>
        Date.now() + durationToMs(settings),
      );

      useEffect(() => {
        if (isEditing) {
          return;
        }

        const timer = window.setInterval(() => {
          setNowMs(Date.now());
        }, SECOND_MS);

        return () => {
          window.clearInterval(timer);
        };
      }, [isEditing]);

      useEffect(() => {
        if (isEditing) {
          return;
        }

        if (settings.mode !== "time") {
          return;
        }

        setDurationTargetMs(Date.now() + durationToMs(settings));
      }, [
        instanceId,
        settings.mode,
        settings.days,
        settings.hours,
        settings.minutes,
        settings.seconds,
      ]);

      const targetDateMs = useMemo(
        () => parseDateInputToMs(settings.targetDate),
        [settings.targetDate],
      );

      const remainingMs = useMemo(() => {
        if (settings.mode === "date") {
          if (targetDateMs === null) {
            return 0;
          }

          return Math.max(0, targetDateMs - nowMs);
        }

        return Math.max(0, durationTargetMs - nowMs);
      }, [settings.mode, targetDateMs, nowMs, durationTargetMs]);

      const countdown = useMemo(() => splitDuration(remainingMs), [remainingMs]);
      const complete = remainingMs <= 0;
      const displayEventName = settings.eventName.trim() || "Upcoming Event";
      const timeSegments = [
        { label: "Days", value: String(countdown.days) },
        { label: "Hours", value: String(countdown.hours).padStart(2, "0") },
        { label: "Minutes", value: String(countdown.minutes).padStart(2, "0") },
        { label: "Seconds", value: String(countdown.seconds).padStart(2, "0") },
      ] as const;
      const shellStyle = {
        ["--module-accent-rgb" as string]: complete
          ? "var(--color-status-ok-rgb)"
          : "var(--color-text-accent-rgb)",
        boxShadow: complete ? "0 0 20px rgb(var(--color-status-ok-rgb) / 0.16)" : undefined,
      } as CSSProperties;

      if (isEditing) {
        return (
          <div className="flex h-full flex-col justify-center rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-3 text-slate-200">
            <p className="module-copy-title text-slate-100">
              Count Down preview
            </p>
            <p className="module-copy-meta mt-2 text-slate-300">
              {settings.eventName.trim() || "Upcoming Event"}
            </p>
            <p className="module-copy-meta mt-1 text-slate-400">
              Mode: {settings.mode === "time" ? "Duration" : "Date"}
            </p>
          </div>
        );
      }

      return (
        <div
          className="module-panel-shell relative flex h-full w-full flex-col overflow-hidden px-3 py-3 text-[color:var(--color-text-primary)]"
          style={shellStyle}
        >
          {complete ? (
            <div
              className="pointer-events-none absolute inset-0 animate-pulse rounded-[inherit]"
              style={{
                boxShadow:
                  "inset 0 0 0 1px rgb(var(--color-status-ok-rgb) / 0.42), 0 0 0 1px rgb(var(--color-status-ok-rgb) / 0.12)",
              }}
            />
          ) : null}

          <div>
            <p
              className="module-copy-label truncate text-[color:var(--color-text-secondary)]"
            >
              Event
            </p>
            <p
              className={`module-copy-title truncate ${complete ? "animate-pulse" : ""}`}
              style={{
                color: complete ? "var(--color-status-ok)" : "var(--color-text-primary)",
                textShadow: complete
                  ? "0 0 10px rgb(var(--color-status-ok-rgb) / 0.22)"
                  : undefined,
              }}
              title={displayEventName}
            >
              {displayEventName}
            </p>
          </div>

          <div className="flex min-h-0 flex-1 items-center">
            <div className="grid w-full grid-cols-4 gap-2 text-center">
              {timeSegments.map((segment) => (
                <div
                  key={segment.label}
                  className="module-panel-card flex min-h-[90px] min-w-0 flex-col items-center justify-center rounded px-2 py-2"
                  style={
                    complete
                      ? {
                          borderColor: "rgb(var(--color-status-ok-rgb) / 0.35)",
                          background: "rgb(var(--color-status-ok-rgb) / 0.12)",
                        }
                      : undefined
                  }
                >
                  <p
                    className="module-copy-title leading-none"
                    style={{
                      color: complete ? "var(--color-status-ok)" : "var(--color-text-accent)",
                    }}
                  >
                    {segment.value}
                  </p>
                  <p className="module-copy-label mt-2 text-slate-300">
                    {segment.label}
                  </p>
                </div>
              ))}
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
