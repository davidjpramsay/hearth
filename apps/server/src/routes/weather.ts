import {
  weatherModuleConfigSchema,
  weatherModuleCurrentResponseSchema,
  weatherLocationSearchQuerySchema,
  weatherLocationSearchResponseSchema,
  weatherModuleParamsSchema,
  type WeatherWindSpeedUnit,
} from "@hearth/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppServices } from "../types.js";

const WEATHER_CODE_LABELS: Record<number, string> = {
  0: "Clear",
  1: "Mostly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Light rain showers",
  81: "Rain showers",
  82: "Heavy rain showers",
  85: "Light snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Severe hail thunderstorm",
};

const GEOCODE_RESPONSE_SCHEMA = z.object({
  results: z
    .array(
      z.object({
        id: z.number().int().optional(),
        name: z.string(),
        latitude: z.number(),
        longitude: z.number(),
        country: z.string().optional(),
        country_code: z.string().optional(),
        admin1: z.string().optional(),
        timezone: z.string().optional(),
      }),
    )
    .optional()
    .default([]),
});

const FORECAST_RESPONSE_SCHEMA = z.object({
  current: z
    .object({
      temperature_2m: z.number(),
      weather_code: z.number().int().optional(),
      is_day: z.number().int().optional(),
      wind_speed_10m: z.number().optional(),
      relative_humidity_2m: z.number().optional(),
    })
    .optional(),
  daily: z
    .object({
      time: z.array(z.string()),
      weather_code: z.array(z.number().int()).optional(),
      temperature_2m_max: z.array(z.number()).optional(),
      temperature_2m_min: z.array(z.number()).optional(),
      wind_speed_10m_max: z.array(z.number()).optional(),
      precipitation_probability_max: z.array(z.number()).optional(),
    })
    .optional(),
});

const LOCATION_SEARCH_CACHE_TTL_MS = 15 * 60 * 1000;
const LOCATION_SEARCH_CACHE_MAX_ENTRIES = 128;
const CURRENT_WEATHER_CACHE_MAX_ENTRIES = 256;
const CURRENT_WEATHER_ERROR_CACHE_TTL_MS = 60 * 1000;

interface TimedCacheEntry {
  fetchedAtMs: number;
}

interface LocationSearchCacheEntry extends TimedCacheEntry {
  results: z.infer<typeof weatherLocationSearchResponseSchema>["results"];
  warning: string | null;
}

interface CurrentWeatherCacheEntry extends TimedCacheEntry {
  payload: z.infer<typeof weatherModuleCurrentResponseSchema>;
  ttlMs: number;
}

const locationSearchCache = new Map<string, LocationSearchCacheEntry>();
const currentWeatherCache = new Map<string, CurrentWeatherCacheEntry>();

const fetchJson = async <T>(
  url: string,
  parser: (payload: unknown) => T,
): Promise<T> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }

    return parser(await response.json());
  } finally {
    clearTimeout(timeout);
  }
};

const conditionLabelFor = (conditionCode: number | null): string => {
  if (conditionCode === null) {
    return "Unknown";
  }

  return WEATHER_CODE_LABELS[conditionCode] ?? `Code ${conditionCode}`;
};

const normalizeLocationQuery = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, " ");

const resolveLocationLabel = (value: string): string => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "Weather";
};

const trimOldestCacheEntries = <T extends TimedCacheEntry>(
  cache: Map<string, T>,
  maxEntries: number,
): void => {
  if (cache.size <= maxEntries) {
    return;
  }

  const sortedEntries = Array.from(cache.entries()).sort(
    (left, right) => left[1].fetchedAtMs - right[1].fetchedAtMs,
  );
  const overflowCount = Math.max(0, cache.size - maxEntries);

  for (let index = 0; index < overflowCount; index += 1) {
    const key = sortedEntries[index]?.[0];
    if (key) {
      cache.delete(key);
    }
  }
};

const readFreshCacheEntry = <T extends TimedCacheEntry>(
  cache: Map<string, T>,
  key: string,
  ttlMs: number,
): T | null => {
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }

  if (Date.now() - entry.fetchedAtMs > ttlMs) {
    cache.delete(key);
    return null;
  }

  return entry;
};

const readFreshCurrentWeatherCacheEntry = (
  key: string,
): CurrentWeatherCacheEntry | null => {
  const entry = currentWeatherCache.get(key);
  if (!entry) {
    return null;
  }

  if (Date.now() - entry.fetchedAtMs > entry.ttlMs) {
    currentWeatherCache.delete(key);
    return null;
  }

  return entry;
};

const parseLocationParts = (
  rawQuery: string,
): {
  raw: string;
  normalizedName: string;
  firstPart: string | null;
  countryCode: string | null;
} => {
  const normalized = rawQuery.trim().replace(/\s+/g, " ");
  const parts = normalized
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const firstPart = parts[0] ?? null;
  const lastPart = parts.at(-1) ?? null;
  const countryCode =
    lastPart && /^[a-z]{2}$/i.test(lastPart) ? lastPart.toUpperCase() : null;

  if (countryCode && parts.length >= 2) {
    return {
      raw: normalized,
      normalizedName: parts.slice(0, -1).join(", "),
      firstPart,
      countryCode,
    };
  }

  return {
    raw: normalized,
    normalizedName: normalized,
    firstPart,
    countryCode: null,
  };
};

const mapWindUnitForProvider = (unit: WeatherWindSpeedUnit): "kmh" | "mph" | "kn" => {
  if (unit === "knots") {
    return "kn";
  }

  return unit;
};

const fetchGeocodeResults = async (input: {
  name: string;
  countryCode: string | null;
  count: number;
}) => {
  const geocodeUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
  geocodeUrl.searchParams.set("name", input.name);
  geocodeUrl.searchParams.set("count", String(input.count));
  geocodeUrl.searchParams.set("language", "en");
  geocodeUrl.searchParams.set("format", "json");
  if (input.countryCode) {
    geocodeUrl.searchParams.set("countryCode", input.countryCode);
  }

  const geocodePayload = await fetchJson(
    geocodeUrl.toString(),
    (payload) => GEOCODE_RESPONSE_SCHEMA.parse(payload),
  );

  return geocodePayload.results;
};

const findLocations = async (
  rawQuery: string,
  count: number,
): Promise<Array<z.infer<typeof GEOCODE_RESPONSE_SCHEMA>["results"][number]>> => {
  const parsed = parseLocationParts(rawQuery);
  const attempts: Array<{ name: string; countryCode: string | null }> = [];
  const pushAttempt = (name: string, countryCode: string | null) => {
    const cleanedName = name.trim();
    if (!cleanedName) {
      return;
    }

    if (
      attempts.some(
        (entry) => entry.name === cleanedName && entry.countryCode === countryCode,
      )
    ) {
      return;
    }

    attempts.push({ name: cleanedName, countryCode });
  };

  pushAttempt(parsed.normalizedName, parsed.countryCode);
  pushAttempt(parsed.raw, null);
  if (parsed.firstPart) {
    pushAttempt(parsed.firstPart, parsed.countryCode);
    pushAttempt(parsed.firstPart, null);
  }

  for (const attempt of attempts) {
    const results = await fetchGeocodeResults({
      name: attempt.name,
      countryCode: attempt.countryCode,
      count,
    });

    if (results.length > 0) {
      return results;
    }
  }

  return [];
};

const toLocationLabel = (location: {
  name: string;
  admin1?: string;
  country?: string;
  country_code?: string;
}): string =>
  [
    location.name,
    location.admin1 ?? null,
    location.country_code ?? location.country ?? null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(", ");

const readActiveConfig = (
  services: AppServices,
  instanceId: string,
):
  | {
      config: ReturnType<typeof weatherModuleConfigSchema.parse>;
    }
  | null => {
  const instance = services.layoutRepository.findModuleInstance(instanceId, "weather");
  if (!instance) {
    return null;
  }

  const parsedConfig = weatherModuleConfigSchema.safeParse(instance.module.config);
  const normalizedConfig = parsedConfig.success
    ? parsedConfig.data
    : weatherModuleConfigSchema.parse({});

  return {
    config: normalizedConfig,
  };
};

const buildCurrentWeatherCacheKey = (
  activeConfig: ReturnType<typeof weatherModuleConfigSchema.parse>,
): string =>
  JSON.stringify({
    locationQuery: normalizeLocationQuery(activeConfig.locationQuery),
    latitude: activeConfig.latitude,
    longitude: activeConfig.longitude,
    temperatureUnit: activeConfig.temperatureUnit,
    windSpeedUnit: activeConfig.windSpeedUnit,
  });

export const registerWeatherRoutes = (
  app: FastifyInstance,
  services: AppServices,
): void => {
  app.get("/modules/weather/locations", async (request, reply) => {
    const query = weatherLocationSearchQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send({ message: query.error.message });
    }

    const searchKey = normalizeLocationQuery(query.data.q);
    const cachedSearch = readFreshCacheEntry(
      locationSearchCache,
      searchKey,
      LOCATION_SEARCH_CACHE_TTL_MS,
    );
    if (cachedSearch) {
      return reply.send(
        weatherLocationSearchResponseSchema.parse({
          generatedAt: new Date().toISOString(),
          results: cachedSearch.results,
          warning: cachedSearch.warning,
        }),
      );
    }

    try {
      const matches = await findLocations(query.data.q, 8);

      const uniqueMatches = new Map<string, (typeof matches)[number]>();
      for (const match of matches) {
        uniqueMatches.set(
          `${match.latitude.toFixed(4)},${match.longitude.toFixed(4)},${match.name}`,
          match,
        );
      }

      const payload = weatherLocationSearchResponseSchema.parse({
        generatedAt: new Date().toISOString(),
        results: Array.from(uniqueMatches.values()).map((location) => ({
          id: location.id ? String(location.id) : `${location.latitude},${location.longitude}`,
          label: toLocationLabel(location),
          name: location.name,
          admin1: location.admin1 ?? null,
          country: location.country ?? null,
          countryCode: location.country_code ?? null,
          latitude: location.latitude,
          longitude: location.longitude,
          timezone: location.timezone ?? null,
        })),
        warning: null,
      });

      locationSearchCache.set(searchKey, {
        fetchedAtMs: Date.now(),
        results: payload.results,
        warning: payload.warning,
      });
      trimOldestCacheEntries(locationSearchCache, LOCATION_SEARCH_CACHE_MAX_ENTRIES);

      return reply.send(payload);
    } catch (error) {
      request.log.warn(
        {
          err: error,
          query: query.data.q,
        },
        "Failed to search weather locations",
      );

      const payload = weatherLocationSearchResponseSchema.parse({
        generatedAt: new Date().toISOString(),
        results: [],
        warning: "Unable to search locations right now.",
      });

      return reply.send(payload);
    }
  });

  app.get("/modules/weather/:instanceId/current", async (request, reply) => {
    const params = weatherModuleParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: params.error.message });
    }

    const activeConfig = readActiveConfig(services, params.data.instanceId);
    if (!activeConfig) {
      return reply.code(404).send({ message: "Weather module instance not found" });
    }

    const generatedAt = new Date().toISOString();
    const currentWeatherCacheKey = buildCurrentWeatherCacheKey(activeConfig.config);
    const currentWeatherTtlMs =
      Math.max(60, activeConfig.config.refreshIntervalSeconds) * 1000;
    const cachedCurrent = readFreshCurrentWeatherCacheEntry(currentWeatherCacheKey);
    if (cachedCurrent) {
      return reply.send(weatherModuleCurrentResponseSchema.parse(cachedCurrent.payload));
    }

    const configuredLocationLabel = resolveLocationLabel(activeConfig.config.locationQuery);
    const defaultPayload = {
      generatedAt,
      locationLabel: configuredLocationLabel,
      temperature: null,
      conditionCode: null,
      conditionLabel: "Unavailable",
      isDay: null,
      windSpeed: null,
      humidityPercent: null,
      forecastDays: [],
      warning: null,
    };

    try {
      let latitude = activeConfig.config.latitude;
      let longitude = activeConfig.config.longitude;
      let locationLabel = configuredLocationLabel;

      if (latitude === null || longitude === null) {
        const geocodeMatches = await findLocations(activeConfig.config.locationQuery, 1);
        const location = geocodeMatches[0];
        if (!location) {
          const warning =
            activeConfig.config.locationQuery.trim().length > 0
              ? `No weather location match for '${activeConfig.config.locationQuery}'.`
              : "No weather location is set for this module.";
          const payload = weatherModuleCurrentResponseSchema.parse({
            ...defaultPayload,
            warning,
          });
          currentWeatherCache.set(currentWeatherCacheKey, {
            fetchedAtMs: Date.now(),
            payload,
            ttlMs: currentWeatherTtlMs,
          });
          trimOldestCacheEntries(currentWeatherCache, CURRENT_WEATHER_CACHE_MAX_ENTRIES);

          return reply.send(
            payload,
          );
        }

        latitude = location.latitude;
        longitude = location.longitude;
        locationLabel = toLocationLabel(location);
      }

      if (latitude === null || longitude === null) {
        const payload = weatherModuleCurrentResponseSchema.parse({
          ...defaultPayload,
          warning: "Location is not set for this weather module.",
        });
        currentWeatherCache.set(currentWeatherCacheKey, {
          fetchedAtMs: Date.now(),
          payload,
          ttlMs: currentWeatherTtlMs,
        });
        trimOldestCacheEntries(currentWeatherCache, CURRENT_WEATHER_CACHE_MAX_ENTRIES);

        return reply.send(
          payload,
        );
      }

      const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
      forecastUrl.searchParams.set("latitude", String(latitude));
      forecastUrl.searchParams.set("longitude", String(longitude));
      forecastUrl.searchParams.set(
        "current",
        "temperature_2m,weather_code,is_day,wind_speed_10m,relative_humidity_2m",
      );
      forecastUrl.searchParams.set(
        "daily",
        "weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,precipitation_probability_max",
      );
      forecastUrl.searchParams.set("temperature_unit", activeConfig.config.temperatureUnit);
      forecastUrl.searchParams.set(
        "wind_speed_unit",
        mapWindUnitForProvider(activeConfig.config.windSpeedUnit),
      );
      forecastUrl.searchParams.set("timezone", "auto");

      const forecastPayload = await fetchJson(
        forecastUrl.toString(),
        (payload) => FORECAST_RESPONSE_SCHEMA.parse(payload),
      );

      const current = forecastPayload.current;
      if (!current) {
        const payload = weatherModuleCurrentResponseSchema.parse({
          ...defaultPayload,
          locationLabel,
          warning: "Weather provider returned no current conditions.",
        });
        currentWeatherCache.set(currentWeatherCacheKey, {
          fetchedAtMs: Date.now(),
          payload,
          ttlMs: CURRENT_WEATHER_ERROR_CACHE_TTL_MS,
        });
        trimOldestCacheEntries(currentWeatherCache, CURRENT_WEATHER_CACHE_MAX_ENTRIES);

        return reply.send(
          payload,
        );
      }

      const conditionCode = Number.isFinite(current.weather_code)
        ? Number(current.weather_code)
        : null;
      const daily = forecastPayload.daily;
      const forecastDays = daily
        ? daily.time.slice(0, 7).map((date, index) => ({
            date,
            conditionCode:
              typeof daily.weather_code?.[index] === "number"
                ? Math.round(daily.weather_code[index] ?? 0)
                : null,
            tempMax:
              typeof daily.temperature_2m_max?.[index] === "number"
                ? daily.temperature_2m_max[index]
                : null,
            tempMin:
              typeof daily.temperature_2m_min?.[index] === "number"
                ? daily.temperature_2m_min[index]
                : null,
            windMax:
              typeof daily.wind_speed_10m_max?.[index] === "number"
                ? daily.wind_speed_10m_max[index]
                : null,
            precipitationChancePercent:
              typeof daily.precipitation_probability_max?.[index] === "number"
                ? Math.round(
                    Math.max(
                      0,
                      Math.min(100, daily.precipitation_probability_max[index]),
                    ),
                  )
                : null,
          }))
        : [];

      const payload = weatherModuleCurrentResponseSchema.parse({
        generatedAt,
        locationLabel,
        temperature: current.temperature_2m,
        conditionCode,
        conditionLabel: conditionLabelFor(conditionCode),
        isDay:
          current.is_day === 1 ? true : current.is_day === 0 ? false : null,
        windSpeed:
          typeof current.wind_speed_10m === "number" ? current.wind_speed_10m : null,
        humidityPercent:
          typeof current.relative_humidity_2m === "number"
            ? Math.round(current.relative_humidity_2m)
            : null,
        forecastDays,
        warning: null,
      });

      currentWeatherCache.set(currentWeatherCacheKey, {
        fetchedAtMs: Date.now(),
        payload,
        ttlMs: currentWeatherTtlMs,
      });
      trimOldestCacheEntries(currentWeatherCache, CURRENT_WEATHER_CACHE_MAX_ENTRIES);

      return reply.send(payload);
    } catch (error) {
      request.log.warn(
        {
          err: error,
          locationQuery: activeConfig.config.locationQuery,
        },
        "Failed to load weather data",
      );

      const payload = weatherModuleCurrentResponseSchema.parse({
        ...defaultPayload,
        warning: "Weather provider is currently unavailable.",
      });
      currentWeatherCache.set(currentWeatherCacheKey, {
        fetchedAtMs: Date.now(),
        payload,
        ttlMs: CURRENT_WEATHER_ERROR_CACHE_TTL_MS,
      });
      trimOldestCacheEntries(currentWeatherCache, CURRENT_WEATHER_CACHE_MAX_ENTRIES);

      return reply.send(payload);
    }
  });
};
