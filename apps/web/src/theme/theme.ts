export const THEME_STORAGE_KEY = "hearth:theme-id";
const THEME_CHANGE_EVENT = "hearth:theme-change";

export type ThemeId = "default" | "nord" | "solarized" | "monokai";

interface ThemeOption {
  id: ThemeId;
  label: string;
}

const DEFAULT_THEME_ID: ThemeId = "default";

export const THEME_OPTIONS: ThemeOption[] = [
  { id: "default", label: "Default (Current)" },
  { id: "nord", label: "Nord" },
  { id: "solarized", label: "Solarized Dark" },
  { id: "monokai", label: "Monokai" },
];

const THEME_CLASS_PREFIX = "theme-";
const THEME_IDS = new Set<ThemeId>(THEME_OPTIONS.map((theme) => theme.id));
let themeSyncStarted = false;

const normalizeThemeId = (value: unknown): ThemeId => {
  if (typeof value === "string" && THEME_IDS.has(value as ThemeId)) {
    return value as ThemeId;
  }

  return DEFAULT_THEME_ID;
};

const getRootElement = (): HTMLElement | null => {
  if (typeof document === "undefined") {
    return null;
  }

  return document.documentElement;
};

const persistThemeId = (themeId: ThemeId): void => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, themeId);
  } catch {
    // Ignore localStorage write failures.
  }
};

export const getStoredThemeId = (): ThemeId => {
  if (typeof window === "undefined") {
    return DEFAULT_THEME_ID;
  }

  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return normalizeThemeId(stored);
  } catch {
    return DEFAULT_THEME_ID;
  }
};

export const getActiveThemeId = (): ThemeId => {
  const root = getRootElement();
  if (root) {
    const activeTheme = THEME_OPTIONS.find((theme) =>
      root.classList.contains(`${THEME_CLASS_PREFIX}${theme.id}`),
    );
    if (activeTheme) {
      return activeTheme.id;
    }
  }

  return getStoredThemeId();
};

interface ApplyThemeOptions {
  persist?: boolean;
  broadcast?: boolean;
}

const broadcastThemeChange = (themeId: ThemeId): void => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent<ThemeId>(THEME_CHANGE_EVENT, { detail: themeId }));
};

export const applyTheme = (themeId: ThemeId | string, options: ApplyThemeOptions = {}): ThemeId => {
  const { persist = true, broadcast = true } = options;
  const nextThemeId = normalizeThemeId(themeId);
  const root = getRootElement();
  if (root) {
    for (const theme of THEME_OPTIONS) {
      root.classList.remove(`${THEME_CLASS_PREFIX}${theme.id}`);
    }
    root.classList.add(`${THEME_CLASS_PREFIX}${nextThemeId}`);
    root.setAttribute("data-hearth-theme", nextThemeId);
    root.style.colorScheme = "dark";
  }

  if (persist) {
    persistThemeId(nextThemeId);
  }

  if (broadcast) {
    broadcastThemeChange(nextThemeId);
  }

  return nextThemeId;
};

export const initializeTheme = (): ThemeId =>
  applyTheme(getStoredThemeId(), { persist: false, broadcast: false });

export const subscribeToThemeChanges = (callback: (themeId: ThemeId) => void): (() => void) => {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const onThemeChanged = (event: Event) => {
    const detail = (event as CustomEvent<ThemeId | string | undefined>).detail;
    callback(normalizeThemeId(detail));
  };

  window.addEventListener(THEME_CHANGE_EVENT, onThemeChanged as EventListener);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onThemeChanged as EventListener);
  };
};

export const startThemeSync = (): void => {
  if (themeSyncStarted || typeof window === "undefined") {
    return;
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) {
      return;
    }

    applyTheme(event.newValue ?? DEFAULT_THEME_ID, {
      persist: false,
      broadcast: true,
    });
  };

  window.addEventListener("storage", onStorage);
  themeSyncStarted = true;
};
