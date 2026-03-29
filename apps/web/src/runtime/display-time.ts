import { getRuntimeTimeZone, isValidIanaTimeZone } from "@hearth/shared";

const DISPLAY_SITE_TIME_ZONE_STORAGE_KEY = "hearth:display-site-time-zone";
const DISPLAY_SERVER_TIME_OFFSET_STORAGE_KEY = "hearth:display-server-time-offset-ms";
export const DISPLAY_TIME_CONTEXT_EVENT = "hearth:display-time-context";
const MAX_REASONABLE_SERVER_OFFSET_MS = 100 * 365 * 24 * 60 * 60 * 1000;

export interface DisplayTimeContext {
  siteTimeZone: string;
  serverTimeOffsetMs: number;
  syncedAtMs: number;
}

let cachedSiteTimeZone: string | null = null;
let cachedServerTimeOffsetMs: number | null = null;

const canUseWindowStorage = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.localStorage !== "undefined" &&
  window.localStorage !== null;

const normalizeSiteTimeZone = (value: string | null | undefined): string =>
  typeof value === "string" && isValidIanaTimeZone(value) ? value : getRuntimeTimeZone();

const normalizeServerTimeOffsetMs = (value: unknown): number => {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;

  if (!Number.isFinite(parsed) || Math.abs(parsed) > MAX_REASONABLE_SERVER_OFFSET_MS) {
    return 0;
  }

  return Math.round(parsed);
};

const readStoredSiteTimeZone = (): string => {
  if (!canUseWindowStorage()) {
    return getRuntimeTimeZone();
  }

  try {
    return normalizeSiteTimeZone(window.localStorage.getItem(DISPLAY_SITE_TIME_ZONE_STORAGE_KEY));
  } catch {
    return getRuntimeTimeZone();
  }
};

const readStoredServerTimeOffsetMs = (): number => {
  if (!canUseWindowStorage()) {
    return 0;
  }

  try {
    return normalizeServerTimeOffsetMs(
      window.localStorage.getItem(DISPLAY_SERVER_TIME_OFFSET_STORAGE_KEY),
    );
  } catch {
    return 0;
  }
};

const dispatchDisplayTimeContext = (detail: DisplayTimeContext): void => {
  if (typeof window === "undefined") {
    return;
  }

  if (typeof CustomEvent !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<DisplayTimeContext>(DISPLAY_TIME_CONTEXT_EVENT, {
        detail,
      }),
    );
    return;
  }

  if (typeof Event !== "undefined") {
    const event = new Event(DISPLAY_TIME_CONTEXT_EVENT);
    Object.defineProperty(event, "detail", {
      configurable: true,
      value: detail,
    });
    window.dispatchEvent(event);
  }
};

export const getDisplaySiteTimeZone = (): string => {
  if (cachedSiteTimeZone === null) {
    cachedSiteTimeZone = readStoredSiteTimeZone();
  }

  return cachedSiteTimeZone;
};

export const getDisplayTimeOffsetMs = (): number => {
  if (cachedServerTimeOffsetMs === null) {
    cachedServerTimeOffsetMs = readStoredServerTimeOffsetMs();
  }

  return cachedServerTimeOffsetMs;
};

export const getDisplayNowMs = (): number => Date.now() + getDisplayTimeOffsetMs();

export const getDisplayNow = (): Date => new Date(getDisplayNowMs());

export const syncDisplayTimeContext = (input: {
  siteTimeZone: string | null | undefined;
  serverNowMs: number;
  localStartedAtMs?: number;
  localReceivedAtMs?: number;
}): DisplayTimeContext => {
  const localReceivedAtMs =
    typeof input.localReceivedAtMs === "number" && Number.isFinite(input.localReceivedAtMs)
      ? input.localReceivedAtMs
      : Date.now();
  const localStartedAtMs =
    typeof input.localStartedAtMs === "number" && Number.isFinite(input.localStartedAtMs)
      ? input.localStartedAtMs
      : localReceivedAtMs;
  const roundTripMs = Math.max(0, localReceivedAtMs - localStartedAtMs);
  const estimatedServerNowMs = input.serverNowMs + Math.round(roundTripMs / 2);
  const detail = {
    siteTimeZone: normalizeSiteTimeZone(input.siteTimeZone),
    serverTimeOffsetMs: normalizeServerTimeOffsetMs(estimatedServerNowMs - localReceivedAtMs),
    syncedAtMs: localReceivedAtMs,
  };

  cachedSiteTimeZone = detail.siteTimeZone;
  cachedServerTimeOffsetMs = detail.serverTimeOffsetMs;

  if (canUseWindowStorage()) {
    try {
      window.localStorage.setItem(DISPLAY_SITE_TIME_ZONE_STORAGE_KEY, detail.siteTimeZone);
      window.localStorage.setItem(
        DISPLAY_SERVER_TIME_OFFSET_STORAGE_KEY,
        String(detail.serverTimeOffsetMs),
      );
    } catch {
      // Ignore localStorage write failures on locked-down displays.
    }
  }

  dispatchDisplayTimeContext(detail);
  return detail;
};

export const addDisplayTimeContextListener = (
  listener: (detail: DisplayTimeContext) => void,
): (() => void) => {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleEvent = (event: Event) => {
    const detail =
      "detail" in event ? ((event as CustomEvent<DisplayTimeContext>).detail ?? null) : null;
    if (!detail) {
      return;
    }

    listener(detail);
  };

  window.addEventListener(DISPLAY_TIME_CONTEXT_EVENT, handleEvent as EventListener);
  return () => {
    window.removeEventListener(DISPLAY_TIME_CONTEXT_EVENT, handleEvent as EventListener);
  };
};
