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
} from "../ui/ModulePresentationControls";
import {
  resolveModuleConnectivityState,
  useBrowserOnlineStatus,
} from "../data/connection-state";
import { ModuleConnectionBadge } from "../ui/ModuleConnectionBadge";
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

const formatTemperatureCompact = (value: number | null) => {
  if (value === null) {
    return "--";
  }

  return `${Math.round(value)}°`;
};

const formatTemperatureRangeCompact = (
  max: number | null | undefined,
  min: number | null | undefined,
) => {
  const hasMax = max !== null && max !== undefined;
  const hasMin = min !== null && min !== undefined;

  if (!hasMax && !hasMin) {
    return "--";
  }

  if (!hasMax) {
    return formatTemperatureCompact(min ?? null);
  }

  if (!hasMin) {
    return formatTemperatureCompact(max ?? null);
  }

  return `${Math.round(max)}° / ${Math.round(min)}°`;
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

const normalizeWeatherLabel = (value: string | null | undefined): string =>
  (value ?? "").trim();

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

const formatForecastDayLabel = (isoDate: string): string => {
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

const WEATHER_META_TEXT_CLASS = "text-[color:var(--color-text-primary)]";
const WEATHER_SECTION_LABEL_CLASS = "module-copy-label";

const WeatherInlineStat = ({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: string;
}) => (
  <div
    className="flex min-w-0 items-center gap-1.5"
    title={`${label}: ${value}`}
    aria-label={`${label}: ${value}`}
  >
    <span aria-hidden className="module-copy-body shrink-0">
      {icon}
    </span>
    <span className={`module-copy-body truncate ${WEATHER_META_TEXT_CLASS}`}>
      {value}
    </span>
  </div>
);

const WeatherSettingsToggle = ({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) => (
  <label className={`flex items-center justify-between gap-3 ${disabled ? "opacity-60" : ""}`}>
    <span>{label}</span>
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
    />
  </label>
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
      const [lastUpdatedMs, setLastUpdatedMs] = useState<number | null>(null);
      const browserOnline = useBrowserOnlineStatus();
      const connectivityState = resolveModuleConnectivityState({
        error,
        hasSnapshot: lastUpdatedMs !== null,
        isOnline: browserOnline,
      });
      const forecastLimit = useMemo(() => {
        if (!settings.showForecast) {
          return 0;
        }

        return Math.min(forecastDaysByDensity(density), forecastCardsByWidth(tileMetrics.width));
      }, [density, settings.showForecast, tileMetrics.width]);
      const forecastDays = useMemo(
        () => payload.forecastDays.slice(1, 1 + forecastLimit),
        [forecastLimit, payload.forecastDays],
      );
      const compactForecastCards = density === "sm";
      const showForecast = forecastDays.length > 0;
      const showTopCondition = settings.showTodayConditionLabel && density !== "xs";
      const showHeroIcon = settings.showTodayConditionIcon;
      const showForecastWind = settings.showForecastWind && density !== "xs";
      const showForecastPrecipitation =
        settings.showForecastPrecipitation && density !== "xs";
      const showForecastTemperature = settings.showForecastTemperature;
      const temperatureTextClass = "module-copy-hero";
      const heroIconClass = "module-copy-hero";
      const forecastIconClass = density === "xs" ? "module-copy-body" : "module-copy-title";
      const forecastTemperatureClass = compactForecastCards
        ? "module-copy-body"
        : "module-copy-title";
      const heroCompact = density === "xs" || tileMetrics.width < 380;
      const useStructuredHero = !heroCompact;
      const tone = resolveWeatherTone(payload.conditionCode, payload.isDay);
      const moduleAccentStyle = buildModuleAccentStyle(tone.accentRgbVar);
      const todayForecast = payload.forecastDays[0] ?? null;
      const conditionLabel = normalizeWeatherLabel(payload.conditionLabel);
      const todayStats = [
        settings.showTodayMinTemperature
          ? {
              key: "min-temp",
              label: "Max / Min",
              value: formatTemperatureRangeCompact(
                todayForecast?.tempMax ?? null,
                todayForecast?.tempMin ?? null,
              ),
              icon: "🌡️",
            }
          : null,
        settings.showTodayPrecipitation
          ? {
              key: "rain",
              label: "Rain",
              value:
                todayForecast?.precipitationChancePercent === null ||
                todayForecast?.precipitationChancePercent === undefined
                  ? "--"
                  : `${todayForecast.precipitationChancePercent}%`,
              icon: "🌧️",
            }
          : null,
        settings.showTodayWind
          ? {
              key: "wind",
              label: "Wind",
              value: formatWind(payload.windSpeed, settings.windSpeedUnit),
              icon: "💨",
            }
          : null,
        settings.showTodayHumidity
          ? {
              key: "humidity",
              label: "Humidity",
              value:
                payload.humidityPercent === null ? "--" : `${payload.humidityPercent}%`,
              icon: "💧",
            }
          : null,
      ].filter(
        (stat): stat is { key: string; label: string; value: string; icon: string } =>
          stat !== null,
      );
      const showStats = density !== "xs" && todayStats.length > 0;
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
            setLastUpdatedMs(Date.now());
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
      }, [
        instanceId,
        isEditing,
        settings.latitude,
        settings.locationQuery,
        settings.longitude,
        settings.refreshIntervalSeconds,
        settings.temperatureUnit,
        settings.windSpeedUnit,
      ]);

      if (isEditing) {
        return (
          <div
            className="module-panel-shell flex h-full flex-col justify-between px-4 py-4 text-[color:var(--color-text-primary)]"
            style={moduleAccentStyle}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="module-copy-label text-[color:rgb(var(--tone-slate-200-rgb)/0.68)]">
                  Weather preview
                </p>
                <p className="module-copy-title mt-2 text-[color:var(--color-text-primary)]">
                  {settings.locationQuery}
                </p>
              </div>
              <div className="module-panel-chip module-copy-label rounded-full px-3 py-1">
                Preview
              </div>
            </div>
            <p className="module-copy-meta text-[color:var(--color-text-secondary)]">
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
          <ModuleConnectionBadge visible={connectivityState.showDisconnected} />
          {loading ? (
            <div className="module-copy-body relative z-10 flex min-h-0 flex-1 items-center justify-center text-[color:var(--color-text-secondary)]">
              Loading weather...
            </div>
          ) : null}

          {!loading && connectivityState.blockingError ? (
            <div className="module-copy-meta relative z-10 flex min-h-0 flex-1 items-center justify-center rounded border border-rose-300/40 bg-rose-300/10 px-4 text-center text-rose-50">
              {connectivityState.blockingError}
            </div>
          ) : null}

          {!loading && !connectivityState.blockingError ? (
            <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
              {useStructuredHero ? (
                <div
                  className={`grid items-stretch gap-4 ${
                    showHeroIcon ? "grid-cols-[minmax(0,1fr)_auto]" : "grid-cols-1"
                  }`}
                >
                  <div className="flex min-w-0 flex-col gap-4">
                    <div className="flex items-end gap-3">
                      <p
                        className={`${temperatureTextClass} leading-none`}
                        style={{
                          color: "rgb(var(--module-accent-rgb, var(--color-text-accent-rgb)))",
                        }}
                      >
                        {formatTemperature(payload.temperature, settings.temperatureUnit)}
                      </p>

                      {showTopCondition ? (
                        <div className="pb-2">
                          <p className="module-copy-title text-[color:var(--color-text-primary)]">
                            {conditionLabel}
                          </p>
                        </div>
                      ) : null}
                    </div>

                    {showStats ? (
                      <div className="module-panel-card flex max-w-[22rem] flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
                        {todayStats.map((stat) => (
                          <WeatherInlineStat
                            key={stat.key}
                            label={stat.label}
                            value={stat.value}
                            icon={stat.icon}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {showHeroIcon ? (
                    <div className="flex shrink-0 self-stretch flex-col items-center justify-between py-1 text-center">
                      <div
                        className="module-panel-card flex h-20 w-20 items-center justify-center rounded-full border"
                        style={WEATHER_ORB_STYLE}
                      >
                        <span
                          aria-hidden
                          className={heroIconClass}
                          style={{
                            color:
                              "rgb(var(--module-accent-rgb, var(--color-text-accent-rgb)))",
                          }}
                        >
                          {weatherSymbolForCode(payload.conditionCode, payload.isDay)}
                        </span>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-end gap-3">
                        <p
                          className={`${temperatureTextClass} leading-none`}
                          style={{
                            color: "rgb(var(--module-accent-rgb, var(--color-text-accent-rgb)))",
                          }}
                        >
                          {formatTemperature(payload.temperature, settings.temperatureUnit)}
                        </p>

                        {showTopCondition ? (
                          <div className="pb-2">
                            <p className="module-copy-title text-[color:var(--color-text-primary)]">
                              {conditionLabel}
                            </p>
                          </div>
                        ) : null}
                      </div>

                    {showStats ? (
                        <div className="module-panel-card mt-2 flex max-w-[22rem] flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
                          {todayStats.map((stat) => (
                            <WeatherInlineStat
                              key={stat.key}
                              label={stat.label}
                              value={stat.value}
                              icon={stat.icon}
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>

                    {showHeroIcon ? (
                      <div className="flex shrink-0 flex-col items-center gap-3 text-center">
                        <div
                          className="module-panel-card flex h-20 w-20 items-center justify-center rounded-full border"
                          style={WEATHER_ORB_STYLE}
                        >
                          <span
                            aria-hidden
                            className={heroIconClass}
                            style={{
                              color:
                                "rgb(var(--module-accent-rgb, var(--color-text-accent-rgb)))",
                            }}
                          >
                            {weatherSymbolForCode(payload.conditionCode, payload.isDay)}
                          </span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}

              {showForecast ? (
                <section className="module-panel-card mt-3 p-3">
                  {showForecastSectionTitle ? (
                    <div className="mb-2">
                      <p className={WEATHER_SECTION_LABEL_CLASS}>Week ahead</p>
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
                        className="module-panel-card p-2.5 text-left"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={`${WEATHER_SECTION_LABEL_CLASS} text-[color:var(--color-text-secondary)]`}
                          >
                            {formatForecastDayLabel(day.date)}
                          </p>
                          <span aria-hidden className={`${forecastIconClass} shrink-0`}>
                            {weatherSymbolForCode(day.conditionCode, true)}
                          </span>
                        </div>
                        {showForecastTemperature ? (
                          <p
                            className={`${forecastTemperatureClass} mt-3 text-[color:var(--color-text-primary)]`}
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
                        ) : null}
                        {showForecastPrecipitation ? (
                          <div className="mt-2 flex items-center gap-1.5 text-[color:var(--color-text-secondary)]">
                            <span aria-hidden>🌧️</span>
                            <span className={`module-copy-meta ${WEATHER_META_TEXT_CLASS}`}>
                              {day.precipitationChancePercent === null
                                ? "--"
                                : `${day.precipitationChancePercent}%`}
                            </span>
                          </div>
                        ) : null}
                        {showForecastWind ? (
                          <div className="mt-1 flex items-center gap-1.5 text-[color:var(--color-text-muted)]">
                            <span aria-hidden>💨</span>
                            <span className={`module-copy-meta ${WEATHER_META_TEXT_CLASS}`}>
                              {formatWind(day.windMax, settings.windSpeedUnit)}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {payload.warning ? (
                <p className="module-copy-label module-panel-card mt-3 px-3 py-2 text-[color:var(--color-text-secondary)]">
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

          <div className="space-y-3 rounded border border-slate-700 bg-slate-950/60 p-3">
            <div>
              <p className="font-semibold text-slate-100">Today</p>
              <p className="mt-1 text-xs text-slate-400">
                Controls the current conditions area at the top of the tile.
              </p>
            </div>
            <div className="space-y-2">
              <WeatherSettingsToggle
                label="Show condition text"
                checked={settings.showTodayConditionLabel}
                onChange={(showTodayConditionLabel) =>
                  applyPatch({ showTodayConditionLabel })
                }
              />
              <WeatherSettingsToggle
                label="Show condition symbol"
                checked={settings.showTodayConditionIcon}
                onChange={(showTodayConditionIcon) =>
                  applyPatch({ showTodayConditionIcon })
                }
              />
              <WeatherSettingsToggle
                label="Show max / min"
                checked={settings.showTodayMinTemperature}
                onChange={(showTodayMinTemperature) =>
                  applyPatch({ showTodayMinTemperature })
                }
              />
              <WeatherSettingsToggle
                label="Show rain chance"
                checked={settings.showTodayPrecipitation}
                onChange={(showTodayPrecipitation) =>
                  applyPatch({ showTodayPrecipitation })
                }
              />
              <WeatherSettingsToggle
                label="Show wind"
                checked={settings.showTodayWind}
                onChange={(showTodayWind) => applyPatch({ showTodayWind })}
              />
              <WeatherSettingsToggle
                label="Show humidity"
                checked={settings.showTodayHumidity}
                onChange={(showTodayHumidity) => applyPatch({ showTodayHumidity })}
              />
            </div>
          </div>

          <div className="space-y-3 rounded border border-slate-700 bg-slate-950/60 p-3">
            <div>
              <p className="font-semibold text-slate-100">Forecast</p>
              <p className="mt-1 text-xs text-slate-400">
                Controls the cards in the week-ahead section.
              </p>
            </div>
            <div className="space-y-2">
              <WeatherSettingsToggle
                label="Show forecast"
                checked={settings.showForecast}
                onChange={(showForecast) => applyPatch({ showForecast })}
              />
              <WeatherSettingsToggle
                label="Show temperatures"
                checked={settings.showForecastTemperature}
                disabled={!settings.showForecast}
                onChange={(showForecastTemperature) =>
                  applyPatch({ showForecastTemperature })
                }
              />
              <WeatherSettingsToggle
                label="Show rain chance"
                checked={settings.showForecastPrecipitation}
                disabled={!settings.showForecast}
                onChange={(showForecastPrecipitation) =>
                  applyPatch({ showForecastPrecipitation })
                }
              />
              <WeatherSettingsToggle
                label="Show wind"
                checked={settings.showForecastWind}
                disabled={!settings.showForecast}
                onChange={(showForecastWind) => applyPatch({ showForecastWind })}
              />
            </div>
          </div>

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
