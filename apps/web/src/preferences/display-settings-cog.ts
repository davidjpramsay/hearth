export const DISPLAY_SETTINGS_COG_VISIBLE_STORAGE_KEY =
  "hearth:display-settings-cog-visible";
const DISPLAY_SETTINGS_COG_VISIBLE_CHANGE_EVENT =
  "hearth:display-settings-cog-visible-change";
const DEFAULT_DISPLAY_SETTINGS_COG_VISIBLE = true;

const normalizeDisplaySettingsCogVisible = (value: unknown): boolean => {
  if (value === false || value === "false") {
    return false;
  }

  return DEFAULT_DISPLAY_SETTINGS_COG_VISIBLE;
};

const broadcastDisplaySettingsCogVisibilityChange = (visible: boolean): void => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<boolean>(DISPLAY_SETTINGS_COG_VISIBLE_CHANGE_EVENT, {
      detail: visible,
    }),
  );
};

export const getDisplaySettingsCogVisible = (): boolean => {
  if (typeof window === "undefined") {
    return DEFAULT_DISPLAY_SETTINGS_COG_VISIBLE;
  }

  try {
    const stored = window.localStorage.getItem(DISPLAY_SETTINGS_COG_VISIBLE_STORAGE_KEY);
    return normalizeDisplaySettingsCogVisible(stored);
  } catch {
    return DEFAULT_DISPLAY_SETTINGS_COG_VISIBLE;
  }
};

interface SetDisplaySettingsCogVisibleOptions {
  persist?: boolean;
  broadcast?: boolean;
}

export const setDisplaySettingsCogVisible = (
  visible: boolean,
  options: SetDisplaySettingsCogVisibleOptions = {},
): boolean => {
  const { persist = true, broadcast = true } = options;
  const nextVisible = normalizeDisplaySettingsCogVisible(visible);

  if (persist && typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        DISPLAY_SETTINGS_COG_VISIBLE_STORAGE_KEY,
        nextVisible ? "true" : "false",
      );
    } catch {
      // Ignore localStorage write failures.
    }
  }

  if (broadcast) {
    broadcastDisplaySettingsCogVisibilityChange(nextVisible);
  }

  return nextVisible;
};

export const subscribeToDisplaySettingsCogVisibility = (
  callback: (visible: boolean) => void,
): (() => void) => {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const onVisibilityChanged = (event: Event) => {
    const detail = (event as CustomEvent<boolean | string | undefined>).detail;
    callback(normalizeDisplaySettingsCogVisible(detail));
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key !== DISPLAY_SETTINGS_COG_VISIBLE_STORAGE_KEY) {
      return;
    }

    callback(normalizeDisplaySettingsCogVisible(event.newValue));
  };

  window.addEventListener(
    DISPLAY_SETTINGS_COG_VISIBLE_CHANGE_EVENT,
    onVisibilityChanged as EventListener,
  );
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(
      DISPLAY_SETTINGS_COG_VISIBLE_CHANGE_EVENT,
      onVisibilityChanged as EventListener,
    );
    window.removeEventListener("storage", onStorage);
  };
};
