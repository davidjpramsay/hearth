import { isValidIanaTimeZone } from "@hearth/shared";

const FALLBACK_TIME_ZONES = [
  "UTC",
  "Australia/Perth",
  "Australia/Adelaide",
  "Australia/Brisbane",
  "Australia/Darwin",
  "Australia/Hobart",
  "Australia/Melbourne",
  "Australia/Sydney",
  "Pacific/Auckland",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Hong_Kong",
  "Asia/Dubai",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Vancouver",
  "America/Sao_Paulo",
  "Africa/Johannesburg",
];

let cachedTimeZoneOptions: string[] | null = null;

export const getSupportedTimeZoneOptions = (): string[] => {
  if (cachedTimeZoneOptions) {
    return cachedTimeZoneOptions;
  }

  const supportedValuesOf = (
    Intl as typeof Intl & {
      supportedValuesOf?: (key: string) => string[];
    }
  ).supportedValuesOf;

  const rawOptions =
    typeof supportedValuesOf === "function" ? supportedValuesOf("timeZone") : FALLBACK_TIME_ZONES;
  const normalized = rawOptions.filter(isValidIanaTimeZone);
  const deduplicated = [...new Set([...normalized, ...FALLBACK_TIME_ZONES])];

  cachedTimeZoneOptions = deduplicated;
  return deduplicated;
};
