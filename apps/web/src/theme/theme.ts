import { DEFAULT_THEME_COLOR_SLOT, THEME_COLOR_SLOTS, type ThemeColorSlot } from "@hearth/shared";

export const THEME_STORAGE_KEY = "hearth:theme-id";
const THEME_CHANGE_EVENT = "hearth:theme-change";

export type ThemeId =
  | "default"
  | "nord"
  | "solarized"
  | "monokai"
  | "forest"
  | "ember"
  | "aurora"
  | "dusk";

export interface ThemeOption {
  id: ThemeId;
  label: string;
  primary: string;
  palette?: Record<ThemeColorSlot, string>;
}

interface RgbColor {
  red: number;
  green: number;
  blue: number;
}

interface HslColor {
  hue: number;
  saturation: number;
  lightness: number;
}

interface GeneratedPaletteEntry {
  slot: ThemeColorSlot;
  hex: string;
  rgb: string;
  foreground: string;
}

const DEFAULT_THEME_ID: ThemeId = "default";
const LIGHT_FOREGROUND = "#F8FAFC";
const DARK_FOREGROUND = "#020617";

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: "default",
    label: "Hearth Light",
    primary: "#0F7F78",
    palette: {
      "color-1": "#FF7566",
      "color-2": "#EF8E52",
      "color-3": "#F2AA1B",
      "color-4": "#A8B998",
      "color-5": "#54A99D",
      "color-6": "#2C9DA0",
      "color-7": "#7194C5",
      "color-8": "#587CB5",
      "color-9": "#9079B8",
      "color-10": "#C8799B",
      "color-11": "#8D9691",
      "color-12": "#C7A84C",
    },
  },
  {
    id: "dusk",
    label: "Hearth Dark",
    primary: "#62C4BA",
    palette: {
      "color-1": "#FF8679",
      "color-2": "#F39A60",
      "color-3": "#F5B83D",
      "color-4": "#B8C8A9",
      "color-5": "#6BC0B5",
      "color-6": "#5BBAC0",
      "color-7": "#88A9D5",
      "color-8": "#7692C6",
      "color-9": "#A991CE",
      "color-10": "#D792AE",
      "color-11": "#A7B0AB",
      "color-12": "#D6B968",
    },
  },
];

const THEME_CLASS_PREFIX = "theme-";
const LEGACY_DARK_THEME_IDS = new Set<ThemeId>([
  "nord",
  "solarized",
  "monokai",
  "forest",
  "ember",
  "aurora",
]);
const THEME_IDS = new Set<ThemeId>(THEME_OPTIONS.map((theme) => theme.id));
let themeSyncStarted = false;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const wrapHue = (value: number): number => {
  const result = value % 360;
  return result < 0 ? result + 360 : result;
};

const hexToRgb = (value: string): RgbColor => {
  const normalized = value.trim().replace(/^#/, "");
  return {
    red: Number.parseInt(normalized.slice(0, 2), 16),
    green: Number.parseInt(normalized.slice(2, 4), 16),
    blue: Number.parseInt(normalized.slice(4, 6), 16),
  };
};

const rgbToHex = (value: RgbColor): string =>
  `#${[value.red, value.green, value.blue]
    .map((channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;

const rgbToHsl = (value: RgbColor): HslColor => {
  const red = value.red / 255;
  const green = value.green / 255;
  const blue = value.blue / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;

  if (max === min) {
    return {
      hue: 0,
      saturation: 0,
      lightness,
    };
  }

  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);

  let hue = 0;
  if (max === red) {
    hue = (green - blue) / delta + (green < blue ? 6 : 0);
  } else if (max === green) {
    hue = (blue - red) / delta + 2;
  } else {
    hue = (red - green) / delta + 4;
  }

  return {
    hue: hue * 60,
    saturation,
    lightness,
  };
};

const hslToRgb = (value: HslColor): RgbColor => {
  const hue = wrapHue(value.hue) / 360;
  const saturation = clamp(value.saturation, 0, 1);
  const lightness = clamp(value.lightness, 0, 1);

  if (saturation === 0) {
    const channel = Math.round(lightness * 255);
    return { red: channel, green: channel, blue: channel };
  }

  const hueToChannel = (p: number, q: number, channelHue: number): number => {
    let nextHue = channelHue;
    if (nextHue < 0) {
      nextHue += 1;
    }
    if (nextHue > 1) {
      nextHue -= 1;
    }
    if (nextHue < 1 / 6) {
      return p + (q - p) * 6 * nextHue;
    }
    if (nextHue < 1 / 2) {
      return q;
    }
    if (nextHue < 2 / 3) {
      return p + (q - p) * (2 / 3 - nextHue) * 6;
    }
    return p;
  };

  const q =
    lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;

  return {
    red: Math.round(hueToChannel(p, q, hue + 1 / 3) * 255),
    green: Math.round(hueToChannel(p, q, hue) * 255),
    blue: Math.round(hueToChannel(p, q, hue - 1 / 3) * 255),
  };
};

const toRelativeLuminance = (value: RgbColor): number => {
  const normalizeChannel = (channel: number): number => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };

  return (
    0.2126 * normalizeChannel(value.red) +
    0.7152 * normalizeChannel(value.green) +
    0.0722 * normalizeChannel(value.blue)
  );
};

const toContrastRatio = (left: number, right: number): number => {
  const lighter = Math.max(left, right);
  const darker = Math.min(left, right);
  return (lighter + 0.05) / (darker + 0.05);
};

const withContrastAdjustedBackground = (background: RgbColor): RgbColor => {
  const lightLuminance = toRelativeLuminance(hexToRgb(LIGHT_FOREGROUND));
  const darkLuminance = toRelativeLuminance(hexToRgb(DARK_FOREGROUND));
  let candidate = background;
  let candidateHsl = rgbToHsl(candidate);

  for (let attempt = 0; attempt < 16; attempt += 1) {
    const backgroundLuminance = toRelativeLuminance(candidate);
    const lightContrast = toContrastRatio(lightLuminance, backgroundLuminance);
    const darkContrast = toContrastRatio(darkLuminance, backgroundLuminance);
    if (Math.max(lightContrast, darkContrast) >= 4.5) {
      return candidate;
    }

    candidateHsl = {
      ...candidateHsl,
      saturation: clamp(candidateHsl.saturation + 0.02, 0.32, 0.9),
      lightness:
        darkContrast >= lightContrast
          ? clamp(candidateHsl.lightness + 0.035, 0.18, 0.92)
          : clamp(candidateHsl.lightness - 0.035, 0.18, 0.92),
    };
    candidate = hslToRgb(candidateHsl);
  }

  return candidate;
};

const pickForeground = (background: RgbColor): string => {
  const backgroundLuminance = toRelativeLuminance(background);
  const lightContrast = toContrastRatio(
    toRelativeLuminance(hexToRgb(LIGHT_FOREGROUND)),
    backgroundLuminance,
  );
  const darkContrast = toContrastRatio(
    toRelativeLuminance(hexToRgb(DARK_FOREGROUND)),
    backgroundLuminance,
  );

  return darkContrast >= lightContrast ? DARK_FOREGROUND : LIGHT_FOREGROUND;
};

const toRgbString = (value: RgbColor): string => `${value.red} ${value.green} ${value.blue}`;

const buildGeneratedThemePalette = (primary: string): RgbColor[] => {
  const base = rgbToHsl(hexToRgb(primary));
  const baseSaturation = clamp(Math.max(base.saturation, 0.62), 0.58, 0.88);
  const baseLightness = clamp(Math.max(base.lightness, 0.58), 0.48, 0.72);
  const hueOffsets = [-120, -90, -60, -30, 0, 30, 60, 90, 120];

  return [
    ...hueOffsets.map((offset, index) =>
      hslToRgb({
        hue: base.hue + offset,
        saturation: clamp(baseSaturation - (index % 3) * 0.04, 0.56, 0.88),
        lightness: clamp(baseLightness + (index % 2 === 0 ? 0.02 : -0.02), 0.44, 0.74),
      }),
    ),
    hslToRgb({
      hue: base.hue,
      saturation: clamp(baseSaturation * 0.32, 0.16, 0.28),
      lightness: clamp(baseLightness + 0.02, 0.54, 0.72),
    }),
    hslToRgb({
      hue: base.hue + 18,
      saturation: clamp(baseSaturation * 0.9, 0.52, 0.78),
      lightness: clamp(baseLightness - 0.16, 0.34, 0.58),
    }),
    hslToRgb({
      hue: base.hue - 18,
      saturation: clamp(baseSaturation * 0.78, 0.42, 0.7),
      lightness: clamp(baseLightness + 0.16, 0.68, 0.84),
    }),
  ];
};

export const buildThemePaletteEntriesForTheme = (themeId: ThemeId): GeneratedPaletteEntry[] => {
  const theme = getThemeDefinition(themeId);
  const colors = theme.palette
    ? THEME_COLOR_SLOTS.map(
        (slot) => hexToRgb(theme.palette?.[slot] ?? theme.primary) ?? hexToRgb(theme.primary),
      )
    : buildGeneratedThemePalette(theme.primary).map((entry) => entry);

  return THEME_COLOR_SLOTS.map((slot, index) => {
    const baseRgb = colors[index] ?? colors[0] ?? hexToRgb(theme.primary);
    const rgb = withContrastAdjustedBackground(baseRgb);
    return {
      slot,
      hex: rgbToHex(rgb),
      rgb: toRgbString(rgb),
      foreground: pickForeground(rgb),
    };
  });
};
const getThemeDefinition = (themeId: ThemeId): ThemeOption =>
  THEME_OPTIONS.find((theme) => theme.id === themeId) ?? THEME_OPTIONS[0]!;

const applyThemePaletteVariables = (root: HTMLElement, themeId: ThemeId): void => {
  const palette = buildThemePaletteEntriesForTheme(themeId);
  for (const entry of palette) {
    root.style.setProperty(`--theme-palette-${entry.slot}`, entry.hex);
    root.style.setProperty(`--theme-palette-${entry.slot}-rgb`, entry.rgb);
    root.style.setProperty(`--theme-palette-${entry.slot}-foreground`, entry.foreground);
  }
};

export const normalizeThemeId = (value: unknown): ThemeId => {
  if (typeof value === "string" && THEME_IDS.has(value as ThemeId)) {
    return value as ThemeId;
  }

  if (typeof value === "string" && LEGACY_DARK_THEME_IDS.has(value as ThemeId)) {
    return "dusk";
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

export const getThemePaletteColorVar = (slot: ThemeColorSlot | null | undefined): string =>
  `var(--theme-palette-${slot ?? DEFAULT_THEME_COLOR_SLOT})`;

export const getThemePaletteRgbVar = (slot: ThemeColorSlot | null | undefined): string =>
  `var(--theme-palette-${slot ?? DEFAULT_THEME_COLOR_SLOT}-rgb)`;

export const getThemePaletteForegroundVar = (slot: ThemeColorSlot | null | undefined): string =>
  `var(--theme-palette-${slot ?? DEFAULT_THEME_COLOR_SLOT}-foreground)`;

export const readThemePaletteColor = (slot: ThemeColorSlot): string => {
  if (typeof window === "undefined") {
    return "";
  }

  return (
    getComputedStyle(document.documentElement).getPropertyValue(`--theme-palette-${slot}`).trim() ||
    getThemePaletteColorVar(slot)
  );
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
    root.style.colorScheme = nextThemeId === "dusk" ? "dark" : "light";
    applyThemePaletteVariables(root, nextThemeId);
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
