import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  weatherLocationSearchResponseSchema,
  weatherModuleConfigSchema,
  weatherModuleCurrentResponseSchema,
  type WeatherLocationResult,
  type WeatherModuleConfig,
  type WeatherModuleCurrentResponse,
} from "@hearth/shared";
import { defineModule } from "@hearth/module-sdk";
import {
  ModulePresentationControls,
  scaleRoleRem,
} from "../ui/ModulePresentationControls";
import { type TileDensity, useTileDensity } from "../ui/useTileDensity";

const emptyPayload = (): WeatherModuleCurrentResponse =>
  weatherModuleCurrentResponseSchema.parse({
    generatedAt: new Date().toISOString(),
    locationLabel: "Weather",
    temperature: null,
    conditionCode: null,
    conditionLabel: "Unavailable",
    isDay: null,
    windSpeed: null,
    humidityPercent: null,
    forecastDays: [],
    warning: null,
  });

const loadWeather = async (
  instanceId: string,
  signal: AbortSignal,
): Promise<WeatherModuleCurrentResponse> => {
  const response = await fetch(
    `/api/modules/weather/${encodeURIComponent(instanceId)}/current`,
    {
      method: "GET",
      signal,
    },
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message =
      payload && typeof payload.message === "string"
        ? payload.message
        : `Request failed (${response.status})`;
    throw new Error(message);
  }

  return weatherModuleCurrentResponseSchema.parse(await response.json());
};

const searchLocations = async (
  query: string,
): Promise<ReturnType<typeof weatherLocationSearchResponseSchema.parse>> => {
  const response = await fetch(
    `/api/modules/weather/locations?q=${encodeURIComponent(query)}`,
    {
      method: "GET",
    },
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message =
      payload && typeof payload.message === "string"
        ? payload.message
        : `Request failed (${response.status})`;
    throw new Error(message);
  }

  return weatherLocationSearchResponseSchema.parse(await response.json());
};

const formatTemperature = (value: number | null, unit: WeatherModuleConfig["temperatureUnit"]) => {
  if (value === null) {
    return "--";
  }

  const label = unit === "fahrenheit" ? "F" : "C";
  return `${Math.round(value)}°${label}`;
};

const formatWind = (value: number | null, unit: WeatherModuleConfig["windSpeedUnit"]) => {
  if (value === null) {
    return "--";
  }

  const unitLabel = unit === "mph" ? "mph" : unit === "knots" ? "kn" : "km/h";
  return `${Math.round(value)} ${unitLabel}`;
};

const forecastDaysByDensity = (density: TileDensity): number => {
  if (density === "xs") {
    return 0;
  }

  if (density === "sm") {
    return 3;
  }

  if (density === "md") {
    return 5;
  }

  return 7;
};

const forecastCardsByWidth = (width: number): number => {
  if (width < 240) {
    return 0;
  }

  if (width < 340) {
    return 2;
  }

  if (width < 440) {
    return 3;
  }

  if (width < 560) {
    return 4;
  }

  if (width < 700) {
    return 5;
  }

  if (width < 860) {
    return 6;
  }

  return 7;
};

const formatLocationLabel = (label: string, density: TileDensity): string => {
  const parts = label
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return label;
  }

  if (density === "xs") {
    return parts[0];
  }

  if (parts.length >= 2) {
    return `${parts[0]}, ${parts.at(-1)}`;
  }

  return parts[0];
};

const weatherSymbolForCode = (conditionCode: number | null, isDay: boolean | null): string => {
  if (conditionCode === null) {
    return "❔";
  }

  if (conditionCode === 0) {
    return isDay === false ? "🌙" : "☀️";
  }

  if (conditionCode === 1) {
    return isDay === false ? "🌙" : "🌤️";
  }

  if (conditionCode === 2) {
    return "⛅";
  }

  if (conditionCode === 3) {
    return "☁️";
  }

  if (conditionCode === 45 || conditionCode === 48) {
    return "🌫️";
  }

  if (conditionCode >= 51 && conditionCode <= 57) {
    return "🌦️";
  }

  if (conditionCode >= 61 && conditionCode <= 67) {
    return "🌧️";
  }

  if (conditionCode >= 71 && conditionCode <= 77) {
    return "🌨️";
  }

  if (conditionCode >= 80 && conditionCode <= 82) {
    return "🌦️";
  }

  if (conditionCode >= 85 && conditionCode <= 86) {
    return "🌨️";
  }

  if (conditionCode >= 95 && conditionCode <= 99) {
    return "⛈️";
  }

  return "❔";
};

const formatForecastDayLabel = (isoDate: string, index: number): string => {
  if (index === 0) {
    return "Today";
  }

  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return isoDate.slice(5);
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
  }).format(parsed);
};

interface WeatherTone {
  accentRgbVar: string;
  summaryLabel: string;
}

const WEATHER_TONE_MAP: Record<string, WeatherTone> = {
  clearDay: {
    accentRgbVar: "var(--color-status-loading-rgb)",
    summaryLabel: "Bright sky",
  },
  clearNight: {
    accentRgbVar: "var(--color-text-accent-rgb)",
    summaryLabel: "Night sky",
  },
  cloudy: {
    accentRgbVar: "var(--tone-slate-300-rgb)",
    summaryLabel: "Overcast",
  },
  rain: {
    accentRgbVar: "var(--color-text-accent-rgb)",
    summaryLabel: "Wet weather",
  },
  storm: {
    accentRgbVar: "var(--color-status-error-rgb)",
    summaryLabel: "Storm front",
  },
  snow: {
    accentRgbVar: "var(--tone-slate-100-rgb)",
    summaryLabel: "Cold air",
  },
};

const resolveWeatherTone = (
  conditionCode: number | null,
  isDay: boolean | null,
): WeatherTone => {
  if (conditionCode !== null && conditionCode >= 95) {
    return WEATHER_TONE_MAP.storm;
  }

  if (
    conditionCode !== null &&
    ((conditionCode >= 51 && conditionCode <= 67) || (conditionCode >= 80 && conditionCode <= 82))
  ) {
    return WEATHER_TONE_MAP.rain;
  }

  if (conditionCode !== null && conditionCode >= 71 && conditionCode <= 86) {
    return WEATHER_TONE_MAP.snow;
  }

  if (conditionCode === 0 || conditionCode === 1) {
    return isDay === false ? WEATHER_TONE_MAP.clearNight : WEATHER_TONE_MAP.clearDay;
  }

  return WEATHER_TONE_MAP.cloudy;
};

const buildModuleAccentStyle = (accentRgbVar: string): CSSProperties =>
  ({
    ["--module-accent-rgb" as string]: accentRgbVar,
  }) as CSSProperties;

const WEATHER_ORB_STYLE: CSSProperties = {
  background:
    "radial-gradient(circle at 32% 28%, rgb(var(--module-accent-rgb, var(--color-text-accent-rgb)) / 0.3), rgb(var(--tone-slate-950-rgb) / 0.08) 58%, rgb(var(--tone-slate-950-rgb) / 0.22) 100%)",
  boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.05)",
};

const formatDayNightLabel = (isDay: boolean | null): string => {
  if (isDay === null) {
    return "Now";
  }

  return isDay ? "Day" : "Night";
};

const WeatherStatCard = ({
  label,
  value,
  icon,
  settings,
}: {
  label: string;
  value: string;
  icon: string;
  settings: WeatherModuleConfig;
}) => (
  <div className="module-panel-card rounded-2xl px-3 py-2">
    <div className="flex items-center gap-2">
      <span
        aria-hidden
        style={{ fontSize: scaleRoleRem(0.95, settings.presentation.primaryScale) }}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p
          className="module-panel-label"
          style={{ fontSize: scaleRoleRem(0.55, settings.presentation.supportingScale) }}
        >
          {label}
        </p>
        <p
          className="truncate font-medium text-[color:var(--color-text-primary)]"
          style={{ fontSize: scaleRoleRem(0.82, settings.presentation.primaryScale) }}
        >
          {value}
        </p>
      </div>
    </div>
  </div>
);

export const moduleDefinition = defineModule({
  manifest: {
    id: "weather",
    name: "Weather",
    version: "2.0.0",
    description: "Weather module migrated to Hearth Module SDK",
    icon: "cloud",
    defaultSize: { w: 4, h: 3 },
    timeMode: "source-local",
    categories: ["weather"],
    permissions: ["network"],
    dataSources: [{ id: "weather-api", kind: "rest" }],
  },
  settingsSchema: weatherModuleConfigSchema,
  dataSchema: weatherModuleCurrentResponseSchema,
  runtime: {
    Component: ({ instanceId, settings, isEditing }) => {
      const { ref: tileRef, metrics: tileMetrics } = useTileDensity<HTMLDivElement>();
      const density = tileMetrics.density;
      const [payload, setPayload] = useState<WeatherModuleCurrentResponse>(() => emptyPayload());
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState<string | null>(null);
      const forecastLimit = useMemo(() => {
        if (!settings.showForecast) {
          return 0;
        }

        return Math.min(forecastDaysByDensity(density), forecastCardsByWidth(tileMetrics.width));
      }, [density, settings.showForecast, tileMetrics.width]);
      const forecastDays = useMemo(
        () => payload.forecastDays.slice(0, forecastLimit),
        [forecastLimit, payload.forecastDays],
      );
      const compactForecastCards = density === "sm";
      const showForecast = forecastDays.length > 0;
      const showTopCondition = density !== "xs";
      const showForecastWind = density === "lg";
      const showForecastPrecipitation = density !== "xs";
      const locationLabel = formatLocationLabel(payload.locationLabel, density);
      const locationLabelSizeRem = density === "xs" ? 0.625 : 0.75;
      const temperatureSizeRem = density === "xs" ? 1.875 : density === "sm" ? 2.25 : 3;
      const conditionSizeRem = 0.875;
      const supportingSizeRem = 0.75;
      const forecastHeadingSizeRem = 0.6875;
      const forecastDaySizeRem = 0.625;
      const forecastTemperatureSizeRem = 0.6875;
      const statusTextSizeRem = 0.875;
      const heroIconSizeRem = density === "xs" ? 1.75 : 2.2;
      const forecastIconSizeRem = density === "xs" ? 1 : 1.2;
      const heroCompact = density === "xs" || tileMetrics.width < 380;
      const tone = resolveWeatherTone(payload.conditionCode, payload.isDay);
      const moduleAccentStyle = buildModuleAccentStyle(tone.accentRgbVar);
      const showStats = density !== "xs";
      const showForecastSectionTitle = density !== "xs";

      useEffect(() => {
        if (isEditing) {
          setLoading(false);
          setError(null);
          return;
        }

        let active = true;
        let abortController: AbortController | null = null;

        const refresh = async () => {
          abortController?.abort();
          abortController = new AbortController();

          try {
            const next = await loadWeather(instanceId, abortController.signal);
            if (!active) {
              return;
            }

            setPayload(next);
            setError(null);
          } catch (loadError) {
            if (!active || (loadError instanceof Error && loadError.name === "AbortError")) {
              return;
            }

            setError(loadError instanceof Error ? loadError.message : "Failed to load weather");
          } finally {
            if (active) {
              setLoading(false);
            }
          }
        };

        void refresh();
        const timer = window.setInterval(
          () => {
            void refresh();
          },
          Math.max(60, settings.refreshIntervalSeconds) * 1000,
        );

        return () => {
          active = false;
          window.clearInterval(timer);
          abortController?.abort();
        };
      }, [instanceId, isEditing, settings.refreshIntervalSeconds]);

      if (isEditing) {
        return (
          <div
            className="module-panel-shell flex h-full flex-col justify-between px-4 py-4 text-[color:var(--color-text-primary)]"
            style={moduleAccentStyle}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p
                  className="module-panel-label"
                  style={{ fontSize: scaleRoleRem(0.62, settings.presentation.headingScale) }}
                >
                  Weather preview
                </p>
                <p
                  className="mt-2 font-semibold text-[color:var(--color-text-primary)]"
                  style={{ fontSize: scaleRoleRem(1.05, settings.presentation.primaryScale) }}
                >
                  {settings.locationQuery}
                </p>
              </div>
              <div className="module-panel-chip rounded-full px-3 py-1 text-xs uppercase tracking-[0.22em]">
                Preview
              </div>
            </div>
            <p
              className="text-[color:var(--color-text-secondary)]"
              style={{ fontSize: scaleRoleRem(0.76, settings.presentation.supportingScale) }}
            >
              Refreshes every {settings.refreshIntervalSeconds}s in {" "}
              {settings.temperatureUnit === "fahrenheit" ? "Fahrenheit" : "Celsius"}
            </p>
          </div>
        );
      }

      return (
        <div
          ref={tileRef}
          className="module-panel-shell relative isolate flex h-full min-h-0 flex-col p-3 text-[color:var(--color-text-primary)]"
          style={moduleAccentStyle}
        >
          {loading ? (
            <div
              className="relative z-10 flex min-h-0 flex-1 items-center justify-center text-[color:var(--color-text-secondary)]"
              style={{
                fontSize: scaleRoleRem(
                  statusTextSizeRem,
                  settings.presentation.supportingScale,
                ),
              }}
            >
              Loading weather...
            </div>
          ) : null}

          {!loading && error ? (
            <div
              className="relative z-10 flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-rose-300/40 bg-rose-300/10 px-4 text-center text-rose-50"
              style={{
                fontSize: scaleRoleRem(
                  supportingSizeRem,
                  settings.presentation.supportingScale,
                ),
              }}
            >
              {error}
            </div>
          ) : null}

          {!loading && !error ? (
            <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
              <div
                className={`flex ${heroCompact ? "flex-col gap-3" : "items-start justify-between gap-4"}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="module-panel-chip max-w-full truncate rounded-full px-3 py-1 uppercase tracking-[0.22em]"
                      style={{
                        fontSize: scaleRoleRem(
                          locationLabelSizeRem,
                          settings.presentation.headingScale,
                        ),
                      }}
                      title={payload.locationLabel}
                    >
                      {locationLabel}
                    </span>
                    <span
                      className="module-panel-chip module-panel-chip--neutral rounded-full px-3 py-1 uppercase tracking-[0.22em]"
                      style={{
                        fontSize: scaleRoleRem(
                          forecastHeadingSizeRem,
                          settings.presentation.supportingScale,
                        ),
                      }}
                    >
                      {formatDayNightLabel(payload.isDay)}
                    </span>
                  </div>

                  <div className="mt-3 flex items-end gap-3">
                    <p
                      className="font-semibold leading-none tracking-[-0.07em]"
                      style={{
                        color: "rgb(var(--module-accent-rgb, var(--color-text-accent-rgb)))",
                        fontSize: scaleRoleRem(
                          temperatureSizeRem,
                          settings.presentation.primaryScale,
                        ),
                      }}
                    >
                      {formatTemperature(payload.temperature, settings.temperatureUnit)}
                    </p>

                    {showTopCondition ? (
                      <div className="pb-2">
                        <p
                          className="font-medium text-[color:var(--color-text-primary)]"
                          style={{
                            fontSize: scaleRoleRem(
                              conditionSizeRem,
                              settings.presentation.primaryScale,
                            ),
                          }}
                        >
                          {payload.conditionLabel}
                        </p>
                        {!heroCompact ? (
                          <p
                            className="text-[color:var(--color-text-secondary)]"
                            style={{
                              fontSize: scaleRoleRem(
                                supportingSizeRem,
                                settings.presentation.supportingScale,
                              ),
                            }}
                          >
                            {tone.summaryLabel}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div
                  className={`flex shrink-0 items-center gap-3 ${
                    heroCompact ? "justify-between" : "flex-col text-center"
                  }`}
                >
                  <div
                    className="module-panel-card flex h-20 w-20 items-center justify-center rounded-full border"
                    style={WEATHER_ORB_STYLE}
                  >
                    <span
                      aria-hidden
                      style={{
                        color: "rgb(var(--module-accent-rgb, var(--color-text-accent-rgb)))",
                        fontSize: scaleRoleRem(
                          heroIconSizeRem,
                          settings.presentation.primaryScale,
                        ),
                      }}
                    >
                      {weatherSymbolForCode(payload.conditionCode, payload.isDay)}
                    </span>
                  </div>
                  {!heroCompact ? (
                    <p
                      className="module-panel-label"
                      style={{
                        fontSize: scaleRoleRem(
                          supportingSizeRem,
                          settings.presentation.supportingScale,
                        ),
                      }}
                    >
                      {payload.conditionLabel}
                    </p>
                  ) : null}
                </div>
              </div>

              {showStats ? (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {settings.showWind ? (
                    <WeatherStatCard
                      label="Wind"
                      value={formatWind(payload.windSpeed, settings.windSpeedUnit)}
                      icon="💨"
                      settings={settings}
                    />
                  ) : null}
                  {settings.showHumidity ? (
                    <WeatherStatCard
                      label="Humidity"
                      value={
                        payload.humidityPercent === null ? "--" : `${payload.humidityPercent}%`
                      }
                      icon="💧"
                      settings={settings}
                    />
                  ) : null}
                </div>
              ) : null}

              {showForecast ? (
                <section
                  className="module-panel-card mt-auto rounded-[24px] p-3"
                >
                  {showForecastSectionTitle ? (
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p
                        className="module-panel-label font-semibold"
                        style={{
                          fontSize: scaleRoleRem(
                            forecastHeadingSizeRem,
                            settings.presentation.headingScale,
                          ),
                        }}
                      >
                        Week ahead
                      </p>
                      <p
                        className="text-[color:var(--color-text-muted)]"
                        style={{
                          fontSize: scaleRoleRem(
                            supportingSizeRem,
                            settings.presentation.supportingScale,
                          ),
                        }}
                      >
                        {payload.conditionLabel}
                      </p>
                    </div>
                  ) : null}
                  <div
                    className="grid gap-2"
                    style={{
                      gridTemplateColumns: `repeat(${Math.max(1, forecastDays.length)}, minmax(0, 1fr))`,
                    }}
                  >
                    {forecastDays.map((day, index) => (
                      <div
                        key={day.date}
                        className="module-panel-card rounded-2xl p-2.5 text-left"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className="module-panel-label font-semibold text-[color:var(--color-text-secondary)]"
                            style={{
                              fontSize: scaleRoleRem(
                                forecastDaySizeRem,
                                settings.presentation.headingScale,
                              ),
                            }}
                          >
                            {formatForecastDayLabel(day.date, index)}
                          </p>
                          <span
                            aria-hidden
                            className="shrink-0"
                            style={{
                              fontSize: scaleRoleRem(
                                forecastIconSizeRem,
                                settings.presentation.primaryScale,
                              ),
                            }}
                          >
                            {weatherSymbolForCode(day.conditionCode, true)}
                          </span>
                        </div>
                        <p
                          className="mt-3 font-semibold text-[color:var(--color-text-primary)]"
                          style={{
                            fontSize: scaleRoleRem(
                              compactForecastCards ? 0.92 : forecastTemperatureSizeRem,
                              settings.presentation.primaryScale,
                            ),
                          }}
                        >
                          {day.tempMax === null ? "--" : `${Math.round(day.tempMax)}°`}
                          <span
                            style={{
                              color: "rgb(var(--tone-slate-300-rgb) / 0.5)",
                            }}
                          >
                            {" "}
                            /{" "}
                          </span>
                          <span className="text-[color:var(--color-text-secondary)]">
                            {day.tempMin === null ? "--" : `${Math.round(day.tempMin)}°`}
                          </span>
                        </p>
                        {showForecastPrecipitation ? (
                          <div className="mt-2 flex items-center gap-1.5 text-[color:var(--color-text-secondary)]">
                            <span aria-hidden>🌧️</span>
                            <span
                              style={{
                                fontSize: scaleRoleRem(
                                  forecastDaySizeRem,
                                  settings.presentation.supportingScale,
                                ),
                              }}
                            >
                              {day.precipitationChancePercent === null
                                ? "--"
                                : `${day.precipitationChancePercent}%`}
                            </span>
                          </div>
                        ) : null}
                        {showForecastWind ? (
                          <div className="mt-1 flex items-center gap-1.5 text-[color:var(--color-text-muted)]">
                            <span aria-hidden>💨</span>
                            <span
                              style={{
                                fontSize: scaleRoleRem(
                                  forecastDaySizeRem,
                                  settings.presentation.supportingScale,
                                ),
                              }}
                            >
                              {day.windMax === null ? "--" : Math.round(day.windMax)}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {payload.warning ? (
                <p
                  className="module-panel-card mt-3 rounded-2xl px-3 py-2 text-[color:var(--color-text-secondary)]"
                  style={{
                    fontSize: scaleRoleRem(
                      forecastHeadingSizeRem,
                      settings.presentation.supportingScale,
                    ),
                  }}
                >
                  {payload.warning}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      );
    },
  },
  admin: {
    SettingsPanel: ({ settings, onChange }) => {
      const [searchResults, setSearchResults] = useState<WeatherLocationResult[]>([]);
      const [searchLoading, setSearchLoading] = useState(false);
      const [searchError, setSearchError] = useState<string | null>(null);
      const [searchWarning, setSearchWarning] = useState<string | null>(null);
      const [geoLoading, setGeoLoading] = useState(false);

      const applyPatch = (patch: Partial<WeatherModuleConfig>) => {
        onChange({
          ...settings,
          ...patch,
        });
      };

      const runSearch = async () => {
        const query = settings.locationQuery.trim();
        if (!query) {
          setSearchError("Enter a location to search.");
          setSearchWarning(null);
          setSearchResults([]);
          return;
        }

        setSearchLoading(true);
        setSearchError(null);
        setSearchWarning(null);

        try {
          const payload = await searchLocations(query);
          setSearchResults(payload.results);
          setSearchWarning(payload.warning);
          if (!payload.warning && payload.results.length === 0) {
            setSearchWarning("No matching locations found.");
          }
        } catch (error) {
          setSearchResults([]);
          setSearchWarning(null);
          setSearchError(
            error instanceof Error ? error.message : "Failed to search weather locations",
          );
        } finally {
          setSearchLoading(false);
        }
      };

      const applyLocationResult = (result: WeatherLocationResult) => {
        applyPatch({
          locationQuery: result.label,
          latitude: result.latitude,
          longitude: result.longitude,
        });
        setSearchResults([]);
        setSearchWarning(null);
        setSearchError(null);
      };

      const useDeviceLocation = async () => {
        if (!("geolocation" in navigator)) {
          setSearchError("Geolocation is not available in this browser.");
          return;
        }

        setGeoLoading(true);
        setSearchError(null);

        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 15_000,
              maximumAge: 60_000,
            });
          });

          const latitude = Number(position.coords.latitude.toFixed(6));
          const longitude = Number(position.coords.longitude.toFixed(6));
          applyPatch({
            locationQuery: `Local (${latitude.toFixed(3)}, ${longitude.toFixed(3)})`,
            latitude,
            longitude,
          });
          setSearchResults([]);
          setSearchWarning(null);
        } catch (error) {
          setSearchError(
            error instanceof Error ? error.message : "Unable to read this device location",
          );
        } finally {
          setGeoLoading(false);
        }
      };

      return (
        <div className="space-y-4 rounded-lg border border-slate-700 bg-slate-900 p-4 text-sm text-slate-200">
          <h3 className="text-base font-semibold">Weather settings</h3>

          <div className="space-y-2">
            <label className="block space-y-2">
              <span>Location</span>
              <input
                className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
                type="text"
                value={settings.locationQuery}
                placeholder="Perth, AU"
                onChange={(event) =>
                  applyPatch({
                    locationQuery: event.target.value,
                    latitude: null,
                    longitude: null,
                  })
                }
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded border border-cyan-500/60 bg-cyan-500/20 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/30 disabled:opacity-60"
                onClick={() => void runSearch()}
                disabled={searchLoading}
              >
                {searchLoading ? "Searching..." : "Search places"}
              </button>
              <button
                type="button"
                className="rounded border border-emerald-500/60 bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/30 disabled:opacity-60"
                onClick={() => void useDeviceLocation()}
                disabled={geoLoading}
              >
                {geoLoading ? "Locating..." : "Use this device location"}
              </button>
              {settings.latitude !== null && settings.longitude !== null ? (
                <button
                  type="button"
                  className="rounded border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-400"
                  onClick={() =>
                    applyPatch({
                      latitude: null,
                      longitude: null,
                    })
                  }
                >
                  Clear pinned coordinates
                </button>
              ) : null}
            </div>

            {settings.latitude !== null && settings.longitude !== null ? (
              <p className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">
                Using pinned coordinates: {settings.latitude.toFixed(4)}, {" "}
                {settings.longitude.toFixed(4)}
              </p>
            ) : (
              <p className="rounded border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs text-slate-300">
                Using location search text (geocoded each refresh).
              </p>
            )}

            {searchError ? (
              <p className="rounded border border-rose-500/50 bg-rose-500/10 px-2 py-1 text-xs text-rose-200">
                {searchError}
              </p>
            ) : null}

            {searchWarning ? (
              <p className="rounded border border-amber-500/50 bg-amber-500/10 px-2 py-1 text-xs text-amber-200">
                {searchWarning}
              </p>
            ) : null}

            {searchResults.length > 0 ? (
              <div className="max-h-44 space-y-1 overflow-y-auto rounded border border-slate-700 bg-slate-950/70 p-1">
                {searchResults.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    className="w-full rounded border border-slate-700 bg-slate-900/70 px-2 py-1.5 text-left text-xs text-slate-100 hover:border-cyan-400"
                    onClick={() => applyLocationResult(result)}
                  >
                    {result.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <label className="block space-y-2">
            <span>Temperature unit</span>
            <select
              className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
              value={settings.temperatureUnit}
              onChange={(event) =>
                applyPatch({
                  temperatureUnit:
                    event.target.value === "fahrenheit" ? "fahrenheit" : "celsius",
                })
              }
            >
              <option value="celsius">Celsius</option>
              <option value="fahrenheit">Fahrenheit</option>
            </select>
          </label>

          <label className="block space-y-2">
            <span>Wind speed unit</span>
            <select
              className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
              value={settings.windSpeedUnit}
              onChange={(event) => {
                const nextUnit = event.target.value;
                applyPatch({
                  windSpeedUnit:
                    nextUnit === "mph"
                      ? "mph"
                      : nextUnit === "knots"
                        ? "knots"
                        : "kmh",
                });
              }}
            >
              <option value="kmh">km/h</option>
              <option value="mph">mph</option>
              <option value="knots">knots</option>
            </select>
          </label>

          <label className="block space-y-2">
            <span>Refresh interval (seconds)</span>
            <input
              className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
              type="number"
              min={60}
              max={3600}
              value={settings.refreshIntervalSeconds}
              onChange={(event) =>
                applyPatch({
                  refreshIntervalSeconds: Math.max(
                    60,
                    Math.min(3600, Number(event.target.value) || 60),
                  ),
                })
              }
            />
          </label>

          <label className="flex items-center justify-between">
            <span>Show forecast</span>
            <input
              type="checkbox"
              checked={settings.showForecast}
              onChange={(event) => applyPatch({ showForecast: event.target.checked })}
            />
          </label>

          <label className="flex items-center justify-between">
            <span>Show wind</span>
            <input
              type="checkbox"
              checked={settings.showWind}
              onChange={(event) => applyPatch({ showWind: event.target.checked })}
            />
          </label>

          <label className="flex items-center justify-between">
            <span>Show humidity</span>
            <input
              type="checkbox"
              checked={settings.showHumidity}
              onChange={(event) => applyPatch({ showHumidity: event.target.checked })}
            />
          </label>

          <ModulePresentationControls
            value={settings.presentation}
            onChange={(presentation) => applyPatch({ presentation })}
          />
        </div>
      );
    },
  },
});

export default moduleDefinition;
