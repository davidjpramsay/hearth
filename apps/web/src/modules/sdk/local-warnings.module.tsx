import {
  localWarningsModuleConfigSchema,
  localWarningsModuleCurrentResponseSchema,
  type LocalWarningItem,
  type LocalWarningsModuleConfig,
  type LocalWarningsModuleCurrentResponse,
} from "@hearth/shared";
import { defineModule } from "@hearth/module-sdk";
import { useModuleQuery } from "../data/useModuleQuery";
import { ModuleFrame } from "../ui/ModuleFrame";
import { ModulePresentationControls } from "../ui/ModulePresentationControls";

const emptyPayload = (): LocalWarningsModuleCurrentResponse =>
  localWarningsModuleCurrentResponseSchema.parse({
    generatedAt: new Date().toISOString(),
    locationLabel: "Local area",
    warnings: [],
    warning: null,
  });

const buildWarningQueryString = (settings: LocalWarningsModuleConfig): string => {
  const params = new URLSearchParams();
  params.set("locationQuery", settings.locationQuery);
  if (typeof settings.latitude === "number") {
    params.set("latitude", String(settings.latitude));
  }
  if (typeof settings.longitude === "number") {
    params.set("longitude", String(settings.longitude));
  }
  return params.toString();
};

const normalizeWarningText = (...parts: Array<string | null | undefined>): string =>
  parts
    .map((part) => (part ?? "").trim().toLowerCase())
    .filter((part) => part.length > 0)
    .join(" ");

const getWarningIcon = (warning: LocalWarningItem): string => {
  const haystack = normalizeWarningText(
    warning.categoryLabel,
    warning.eventLabel,
    warning.alertLevel,
    warning.headline,
  );

  if (haystack.includes("bushfire") || haystack.includes("fire")) {
    return "🔥";
  }
  if (haystack.includes("flood") || haystack.includes("river")) {
    return "🌊";
  }
  if (
    haystack.includes("storm") ||
    haystack.includes("thunderstorm") ||
    haystack.includes("cyclone")
  ) {
    return "⛈️";
  }
  if (haystack.includes("smoke")) {
    return "🌫️";
  }
  if (haystack.includes("heat")) {
    return "🌡️";
  }
  return "⚠️";
};

const getWarningTone = (warning: LocalWarningItem) => {
  const haystack = normalizeWarningText(
    warning.alertLevel,
    warning.severity,
    warning.categoryLabel,
    warning.eventLabel,
    warning.headline,
  );

  const accentRgb = haystack.includes("watch and act") || haystack.includes("emergency warning")
    ? "var(--color-status-error-rgb)"
    : "var(--color-status-loading-rgb)";

  return {
    accentRgb,
    cardStyle: {
      borderColor: `rgb(${accentRgb} / 0.28)`,
      background: `linear-gradient(180deg, rgb(${accentRgb} / 0.18), rgb(var(--tone-slate-950-rgb) / 0.28) 46%)`,
      boxShadow: `inset 0 1px 0 rgb(var(--tone-slate-100-rgb) / 0.04)`,
    },
    iconStyle: {
      borderColor: `rgb(${accentRgb} / 0.34)`,
      background: `rgb(${accentRgb} / 0.14)`,
      color: `rgb(${accentRgb} / 0.98)`,
    },
    levelStyle: {
      borderColor: `rgb(${accentRgb} / 0.34)`,
      background: `rgb(${accentRgb} / 0.16)`,
      color: `rgb(${accentRgb} / 0.98)`,
    },
  };
};

const SettingsPanel = ({
  settings,
  onChange,
}: {
  settings: LocalWarningsModuleConfig;
  onChange: (next: LocalWarningsModuleConfig) => void;
}) => (
  <div className="space-y-4 rounded-lg border border-slate-700 bg-slate-900 p-4 text-sm text-slate-200">
    <h3 className="text-base font-semibold">Local warnings settings</h3>
    <label className="block space-y-2">
      <span>Location</span>
      <input
        className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
        value={settings.locationQuery}
        onChange={(event) =>
          onChange({
            ...settings,
            locationQuery: event.target.value,
          })
        }
      />
    </label>
    <label className="block space-y-2">
      <span>Refresh interval (seconds)</span>
      <input
        className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
        type="number"
        min={60}
        max={3600}
        step={60}
        value={settings.refreshIntervalSeconds}
        onChange={(event) =>
          onChange({
            ...settings,
            refreshIntervalSeconds:
              Number(event.target.value) || settings.refreshIntervalSeconds,
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
    id: "local-warnings",
    name: "Local warnings",
    version: "1.0.0",
    description: "Shows active Emergency WA warnings for a chosen location.",
    icon: "alert-triangle",
    defaultSize: { w: 6, h: 5 },
    placement: "internal",
    categories: ["alerts", "safety"],
    permissions: ["network"],
    dataSources: [{ id: "local-warnings-rest", kind: "rest", pollMs: 300_000 }],
  },
  settingsSchema: localWarningsModuleConfigSchema,
  dataSchema: localWarningsModuleCurrentResponseSchema,
  runtime: {
    Component: ({ settings, isEditing }) => {
      const warningState = useModuleQuery({
        key: `local-warnings:${buildWarningQueryString(settings)}`,
        queryFn: async () => {
          const response = await fetch(
            `/api/modules/local-warnings/current?${buildWarningQueryString(settings)}`,
            {
              method: "GET",
            },
          );

          if (!response.ok) {
            throw new Error(`Local warnings request failed (${response.status})`);
          }

          return localWarningsModuleCurrentResponseSchema.parse(await response.json());
        },
        intervalMs: settings.refreshIntervalSeconds * 1000,
        staleMs: Math.max(1000, settings.refreshIntervalSeconds * 1000 - 1000),
        enabled: !isEditing,
      });

      const payload = warningState.data ?? emptyPayload();

      if (isEditing) {
        return (
          <div className="flex h-full flex-col justify-center rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-3 text-slate-200">
            <p className="module-text-title text-slate-100">Local warnings preview</p>
            <p className="module-text-small mt-2 text-slate-300">{settings.locationQuery}</p>
            <p className="module-text-small mt-1 text-slate-400">
              Source: Emergency WA CAP-AU
            </p>
          </div>
        );
      }

      return (
        <ModuleFrame
          title="Local warnings"
          subtitle={payload.locationLabel}
          hideHeader
          loading={warningState.loading}
          error={warningState.error}
          disconnected={warningState.isDisconnected}
          lastUpdatedMs={warningState.lastUpdatedMs}
          statusLabel={payload.warnings.length > 0 ? `${payload.warnings.length} active` : "Clear"}
          empty={!warningState.loading && !warningState.error && payload.warnings.length === 0}
          emptyMessage={payload.warning ?? `No active warnings for ${payload.locationLabel}.`}
        >
          <div className="module-panel-shell flex h-full min-h-0 flex-col gap-3 px-4 py-4 text-[color:var(--color-text-primary)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="module-text-small font-display uppercase tracking-[0.18em] text-[color:var(--color-text-secondary)]">
                  Emergency WA warnings
                </p>
                <p className="module-text-small mt-1 text-[color:var(--color-text-secondary)]">
                  {payload.locationLabel}
                </p>
              </div>
              <div className="module-panel-chip module-text-small rounded-full px-3 py-1 font-display uppercase tracking-[0.18em] text-[color:var(--color-text-primary)]">
                {payload.warnings.length} active
              </div>
            </div>

            <div className="grid min-h-0 flex-1 gap-3 overflow-auto">
              {payload.warnings.map((warning) => {
                const tone = getWarningTone(warning);
                const warningIcon = getWarningIcon(warning);
                return (
                  <article
                    key={`${warning.serviceKind}:${warning.id}`}
                    className="relative overflow-hidden rounded-[calc(var(--radius-module-inner)+0.12rem)] border px-4 py-4"
                    style={tone.cardStyle}
                  >
                    <div
                      className="absolute inset-y-0 left-0 w-1"
                      style={{ background: `rgb(${tone.accentRgb} / 0.92)` }}
                    />

                    <div className="relative flex items-start gap-3">
                      <div
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[0.7rem] border"
                        style={tone.iconStyle}
                      >
                        <span aria-hidden className="module-text-title leading-none">
                          {warningIcon}
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {warning.alertLevel ? (
                            <span
                              className="module-text-small rounded-full border px-2.5 py-1 font-display uppercase tracking-[0.18em] whitespace-nowrap"
                              style={tone.levelStyle}
                            >
                              {warning.alertLevel}
                            </span>
                          ) : null}
                          <span className="module-text-small font-display uppercase tracking-[0.18em] text-[color:rgb(var(--tone-slate-200-rgb)/0.72)]">
                            {warning.categoryLabel ?? warning.serviceLabel}
                          </span>
                          {warning.severity ? (
                            <span className="module-text-small font-display uppercase tracking-[0.18em] text-[color:var(--color-text-muted)]">
                              {warning.severity}
                            </span>
                          ) : null}
                        </div>

                        <h3 className="module-text-title mt-3 leading-tight text-[color:var(--color-text-primary)]">
                          {warning.headline}
                        </h3>

                        <div className="mt-3 space-y-1.5">
                          {warning.eventLabel ? (
                            <p className="module-text-body text-[color:var(--color-text-secondary)]">
                              {warning.eventLabel}
                            </p>
                          ) : null}

                          {warning.areaLabels.length > 0 ? (
                            <p className="module-text-small text-[color:var(--color-text-secondary)]">
                              {warning.areaLabels.slice(0, 3).join(", ")}
                            </p>
                          ) : null}
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {warning.urgency ? (
                            <span className="module-panel-chip module-text-small rounded-full px-2.5 py-1 font-display uppercase tracking-[0.18em]">
                              {warning.urgency}
                            </span>
                          ) : null}
                          <span className="module-panel-chip module-text-small rounded-full px-2.5 py-1 font-display uppercase tracking-[0.18em]">
                            Emergency WA
                          </span>
                          {warning.detailUrl ? (
                            <a
                              href={warning.detailUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="module-panel-chip module-text-small rounded-full px-2.5 py-1 font-display uppercase tracking-[0.18em] text-[color:var(--color-text-primary)] underline decoration-transparent transition hover:decoration-current"
                            >
                              Open details
                            </a>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </ModuleFrame>
      );
    },
  },
  admin: {
    SettingsPanel,
  },
});

export default moduleDefinition;
