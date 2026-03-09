const DEVICE_ID_STORAGE_KEY = "hearth:screen-session-id";

const createDeviceId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};

export const getDeviceId = (): string | null => {
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

export const getOrCreateDeviceId = (): string => {
  const existing = getDeviceId();
  if (existing) {
    return existing;
  }

  const generated = createDeviceId();

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, generated);
    } catch {
      // Ignore localStorage write failures.
    }
  }

  return generated;
};
