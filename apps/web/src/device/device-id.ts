const DEVICE_ID_STORAGE_KEY = "hearth:screen-session-id";
const DEVICE_ID_COOKIE_KEY = "hearth_device_id";
const DEVICE_ID_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 * 10;

const createDeviceId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};

const readLocalDeviceId = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY)?.trim();
    return existing && existing.length > 0 ? existing : null;
  } catch {
    return null;
  }
};

const readCookieDeviceId = (): string | null => {
  if (typeof document === "undefined" || typeof document.cookie !== "string") {
    return null;
  }

  const prefix = `${DEVICE_ID_COOKIE_KEY}=`;
  const value = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);

  if (!value) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(value).trim();
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
};

const persistDeviceId = (deviceId: string): void => {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
    } catch {
      // A cookie still provides continuity when localStorage is unavailable.
    }
  }

  if (typeof document !== "undefined") {
    try {
      document.cookie = `${DEVICE_ID_COOKIE_KEY}=${encodeURIComponent(deviceId)}; Path=/; Max-Age=${DEVICE_ID_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
    } catch {
      // localStorage still provides continuity when cookies are unavailable.
    }
  }
};

export const getDeviceId = (): string | null => readCookieDeviceId() ?? readLocalDeviceId();

export const getOrCreateDeviceId = (): string => {
  const existing = getDeviceId();
  if (existing) {
    // Keep both stores in sync. Either one can recover the installation ID if
    // a browser update or kiosk reset clears the other.
    persistDeviceId(existing);
    return existing;
  }

  const generated = createDeviceId();

  persistDeviceId(generated);

  return generated;
};
