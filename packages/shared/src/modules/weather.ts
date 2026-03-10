import { z } from "zod";
import { withModulePresentation } from "./presentation.js";

export const weatherTemperatureUnitSchema = z.enum(["celsius", "fahrenheit"]);
export const weatherWindSpeedUnitSchema = z.enum(["kmh", "mph", "knots"]);

export const weatherModuleConfigSchema = withModulePresentation(
  z.object({
    locationQuery: z.string().trim().max(120).default("Perth, AU"),
    latitude: z.number().min(-90).max(90).nullable().default(null),
    longitude: z.number().min(-180).max(180).nullable().default(null),
    temperatureUnit: weatherTemperatureUnitSchema.default("celsius"),
    windSpeedUnit: weatherWindSpeedUnitSchema.default("kmh"),
    refreshIntervalSeconds: z.number().int().min(60).max(3600).default(600),
    showForecast: z.boolean().default(true),
    showHumidity: z.boolean().default(true),
    showWind: z.boolean().default(true),
  }),
);

export const weatherModuleCurrentResponseSchema = z.object({
  generatedAt: z.string().datetime({ offset: true }),
  locationLabel: z.string().min(1),
  temperature: z.number().nullable(),
  conditionCode: z.number().int().nullable(),
  conditionLabel: z.string().min(1),
  isDay: z.boolean().nullable(),
  windSpeed: z.number().nullable(),
  humidityPercent: z.number().int().min(0).max(100).nullable(),
  forecastDays: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        conditionCode: z.number().int().nullable(),
        tempMax: z.number().nullable(),
        tempMin: z.number().nullable(),
        windMax: z.number().nullable(),
        precipitationChancePercent: z.number().int().min(0).max(100).nullable(),
      }),
    )
    .default([]),
  warning: z.string().nullable().default(null),
});

export const weatherModuleParamsSchema = z.object({
  instanceId: z.string().min(1),
});

export const weatherLocationSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(120),
});

export const weatherLocationResultSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  name: z.string().min(1),
  admin1: z.string().nullable(),
  country: z.string().nullable(),
  countryCode: z.string().nullable(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  timezone: z.string().nullable(),
});

export const weatherLocationSearchResponseSchema = z.object({
  generatedAt: z.string().datetime({ offset: true }),
  results: z.array(weatherLocationResultSchema),
  warning: z.string().nullable().default(null),
});

export type WeatherTemperatureUnit = z.infer<typeof weatherTemperatureUnitSchema>;
export type WeatherWindSpeedUnit = z.infer<typeof weatherWindSpeedUnitSchema>;
export type WeatherModuleConfig = z.infer<typeof weatherModuleConfigSchema>;
export type WeatherModuleCurrentResponse = z.infer<
  typeof weatherModuleCurrentResponseSchema
>;
export type WeatherModuleParams = z.infer<typeof weatherModuleParamsSchema>;
export type WeatherLocationSearchQuery = z.infer<typeof weatherLocationSearchQuerySchema>;
export type WeatherLocationResult = z.infer<typeof weatherLocationResultSchema>;
export type WeatherLocationSearchResponse = z.infer<
  typeof weatherLocationSearchResponseSchema
>;
