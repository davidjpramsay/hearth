import { useEffect, useMemo, useState } from "react";
import {
  weatherModuleConfigSchema,
  weatherModuleCurrentResponseSchema,
  weatherLocationSearchResponseSchema,
  type ModuleDefinition,
  type WeatherModuleConfig,
  type WeatherModuleCurrentResponse,
  type WeatherLocationResult,
} from "@hearth/shared";
import { useTileDensity, type TileDensity } from "./tile-density.js";

const DEFAULT_CONFIG = weatherModuleConfigSchema.parse({});

const normalizeConfig = (config: unknown): WeatherModuleConfig => {
  const parsedConfig = weatherModuleConfigSchema.safeParse(config);
  return parsedConfig.success ? parsedConfig.data : DEFAULT_CONFIG;
};

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

export const weatherModule: ModuleDefinition<WeatherModuleConfig> = {
  id: "weather",
  displayName: "Weather",
  defaultSize: { w: 4, h: 3 },
  configSchema: weatherModuleConfigSchema,
  DashboardTile: ({ instanceId, config, isEditing }) => {
    const normalizedConfig = useMemo(() => normalizeConfig(config), [config]);
    const { ref: tileRef, metrics: tileMetrics } = useTileDensity<HTMLDivElement>();
    const density = tileMetrics.density;
    const [payload, setPayload] = useState<WeatherModuleCurrentResponse>(() => emptyPayload());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const forecastLimit = useMemo(() => {
      if (!normalizedConfig.showForecast) {
        return 0;
      }

      return Math.min(forecastDaysByDensity(density), forecastCardsByWidth(tileMetrics.width));
    }, [density, normalizedConfig.showForecast, tileMetrics.width]);
    const forecastDays = useMemo(
      () => payload.forecastDays.slice(0, forecastLimit),
      [forecastLimit, payload.forecastDays],
    );
    const compactForecastCards = density === "sm";
    const showForecast = forecastDays.length > 0;
    const showDayNight = density !== "xs";
    const showTopCondition = density !== "xs";
    const showTopMeta =
      density !== "xs" &&
      (normalizedConfig.showTodayWind || normalizedConfig.showTodayHumidity);
    const showForecastWind = normalizedConfig.showForecastWind && density !== "xs";
    const showForecastPrecipitation =
      normalizedConfig.showForecastPrecipitation && density !== "xs";
    const showForecastTemperature = normalizedConfig.showForecastTemperature;
    const temperatureClass =
      density === "xs" ? "text-3xl" : density === "sm" ? "text-4xl" : "text-5xl";
    const locationLabel = formatLocationLabel(payload.locationLabel, density);
    const locationLabelClass = density === "xs" ? "text-[10px]" : "text-xs";

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
        Math.max(60, normalizedConfig.refreshIntervalSeconds) * 1000,
      );

      return () => {
        active = false;
        window.clearInterval(timer);
        abortController?.abort();
      };
    }, [instanceId, isEditing, normalizedConfig.refreshIntervalSeconds]);

    if (isEditing) {
      return (
        <div className="flex h-full flex-col justify-center rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-3 text-slate-200">
          <p className="text-sm font-semibold text-slate-100">Weather preview</p>
          <p className="mt-2 text-xs text-slate-300">
            Location: {normalizedConfig.locationQuery}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Every {normalizedConfig.refreshIntervalSeconds}s | Unit:{" "}
            {normalizedConfig.temperatureUnit === "fahrenheit" ? "Fahrenheit" : "Celsius"}
          </p>
        </div>
      );
    }

    return (
      <div
        ref={tileRef}
        className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-slate-700 bg-gradient-to-b from-slate-900 to-slate-950 p-3 text-slate-100"
      >
        {loading ? (
          <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-slate-300">
            Loading weather...
          </div>
        ) : null}

        {!loading && error ? (
          <div className="flex min-h-0 flex-1 items-center justify-center rounded-md border border-rose-500/60 bg-rose-500/10 px-3 text-center text-xs text-rose-200">
            {error}
          </div>
        ) : null}

        {!loading && !error ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
            <p
              className={`truncate pr-1 font-semibold uppercase tracking-wide text-cyan-200 ${locationLabelClass}`}
              title={payload.locationLabel}
            >
              {locationLabel}
            </p>
            <div className="mt-2 flex items-end justify-between">
              <div>
                <p className={`${temperatureClass} font-semibold text-cyan-300`}>
                  {formatTemperature(payload.temperature, normalizedConfig.temperatureUnit)}
                </p>
                {showTopCondition ? (
                  <p className="mt-1 text-sm text-slate-200">{payload.conditionLabel}</p>
                ) : null}
              </div>
              <div className="flex flex-col items-end">
                <p className="text-2xl" aria-hidden>
                  {weatherSymbolForCode(payload.conditionCode, payload.isDay)}
                </p>
                {showDayNight ? (
                  <p className="text-xs uppercase tracking-wide text-slate-300">
                    {payload.isDay === null ? "" : payload.isDay ? "Day" : "Night"}
                  </p>
                ) : null}
              </div>
            </div>

            {showTopMeta ? (
              <div className="mt-3 space-y-1 text-xs text-slate-300">
                {normalizedConfig.showTodayWind ? (
                  <p>
                    Wind: {formatWind(payload.windSpeed, normalizedConfig.windSpeedUnit)}
                  </p>
                ) : null}
                {normalizedConfig.showTodayHumidity ? (
                  <p>
                    Humidity:{" "}
                    {payload.humidityPercent === null ? "--" : `${payload.humidityPercent}%`}
                  </p>
                ) : null}
              </div>
            ) : null}

            {showForecast ? (
              <section className="mt-auto pt-3">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                  Week forecast
                </p>
                <div
                  className="grid gap-1"
                  style={{
                    gridTemplateColumns: `repeat(${Math.max(1, forecastDays.length)}, minmax(0, 1fr))`,
                  }}
                >
                  {forecastDays.map((day, index) => (
                    <div
                      key={day.date}
                      className={`rounded border border-slate-700 bg-slate-900/70 text-center ${
                        compactForecastCards ? "min-w-0 px-1.5 py-1" : "min-w-0 px-2 py-1"
                      }`}
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-cyan-200">
                        {formatForecastDayLabel(day.date, index)}
                      </p>
                      <p className="mt-0.5 text-lg" aria-hidden>
                        {weatherSymbolForCode(day.conditionCode, true)}
                      </p>
                      {showForecastTemperature ? (
                        <p className="mt-0.5 text-[11px] font-semibold text-slate-100">
                          {day.tempMax === null ? "--" : `${Math.round(day.tempMax)}°`}
                          <span className="text-slate-400"> / </span>
                          <span className="text-slate-300">
                            {day.tempMin === null ? "--" : `${Math.round(day.tempMin)}°`}
                          </span>
                        </p>
                      ) : null}
                      {showForecastWind ? (
                        <p className="mt-0.5 text-[10px] text-slate-300">
                          💨 {formatWind(day.windMax, normalizedConfig.windSpeedUnit)}
                        </p>
                      ) : null}
                      {showForecastPrecipitation ? (
                        <p className="text-[10px] text-slate-300">
                          🌧️{" "}
                          {day.precipitationChancePercent === null
                            ? "--"
                            : `${day.precipitationChancePercent}%`}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {payload.warning ? (
              <p className="mt-2 rounded border border-amber-500/50 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">
                {payload.warning}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  },
  SettingsPanel: ({ config, onChange }) => {
    const normalizedConfig = normalizeConfig(config);
    const [searchResults, setSearchResults] = useState<WeatherLocationResult[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);
    const [searchWarning, setSearchWarning] = useState<string | null>(null);
    const [geoLoading, setGeoLoading] = useState(false);

    const applyPatch = (patch: Partial<WeatherModuleConfig>) => {
      onChange({
        ...normalizedConfig,
        ...patch,
      });
    };

    const runSearch = async () => {
      const query = normalizedConfig.locationQuery.trim();
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
          error instanceof Error
            ? error.message
            : "Unable to read this device location",
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
              value={normalizedConfig.locationQuery}
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
            {normalizedConfig.latitude !== null && normalizedConfig.longitude !== null ? (
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

          {normalizedConfig.latitude !== null && normalizedConfig.longitude !== null ? (
            <p className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">
              Using pinned coordinates: {normalizedConfig.latitude.toFixed(4)},{" "}
              {normalizedConfig.longitude.toFixed(4)}
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
            value={normalizedConfig.temperatureUnit}
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
            value={normalizedConfig.windSpeedUnit}
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
            value={normalizedConfig.refreshIntervalSeconds}
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
              label="Show wind"
              checked={normalizedConfig.showTodayWind}
              onChange={(showTodayWind) => applyPatch({ showTodayWind })}
            />
            <WeatherSettingsToggle
              label="Show humidity"
              checked={normalizedConfig.showTodayHumidity}
              onChange={(showTodayHumidity) => applyPatch({ showTodayHumidity })}
            />
          </div>
        </div>

        <div className="space-y-3 rounded border border-slate-700 bg-slate-950/60 p-3">
          <div>
            <p className="font-semibold text-slate-100">Forecast</p>
            <p className="mt-1 text-xs text-slate-400">
              Controls the cards in the week forecast section.
            </p>
          </div>
          <div className="space-y-2">
            <WeatherSettingsToggle
              label="Show forecast"
              checked={normalizedConfig.showForecast}
              onChange={(showForecast) => applyPatch({ showForecast })}
            />
            <WeatherSettingsToggle
              label="Show temperatures"
              checked={normalizedConfig.showForecastTemperature}
              disabled={!normalizedConfig.showForecast}
              onChange={(showForecastTemperature) =>
                applyPatch({ showForecastTemperature })
              }
            />
            <WeatherSettingsToggle
              label="Show rain chance"
              checked={normalizedConfig.showForecastPrecipitation}
              disabled={!normalizedConfig.showForecast}
              onChange={(showForecastPrecipitation) =>
                applyPatch({ showForecastPrecipitation })
              }
            />
            <WeatherSettingsToggle
              label="Show wind"
              checked={normalizedConfig.showForecastWind}
              disabled={!normalizedConfig.showForecast}
              onChange={(showForecastWind) => applyPatch({ showForecastWind })}
            />
          </div>
        </div>
      </div>
    );
  },
};
