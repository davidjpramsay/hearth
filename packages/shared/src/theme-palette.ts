import { z } from "zod";

export const THEME_COLOR_SLOTS = [
  "color-1",
  "color-2",
  "color-3",
  "color-4",
  "color-5",
  "color-6",
  "color-7",
  "color-8",
  "color-9",
  "color-10",
  "color-11",
  "color-12",
] as const;

export const DEFAULT_THEME_COLOR_SLOT = "color-5";

export const themeColorSlotSchema = z.enum(THEME_COLOR_SLOTS);

export type ThemeColorSlot = z.infer<typeof themeColorSlotSchema>;

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

const LEGACY_REFERENCE_PALETTE: Record<ThemeColorSlot, string> = {
  "color-1": "#FB7185",
  "color-2": "#F97316",
  "color-3": "#F59E0B",
  "color-4": "#22C55E",
  "color-5": "#14B8A6",
  "color-6": "#22D3EE",
  "color-7": "#3B82F6",
  "color-8": "#6366F1",
  "color-9": "#8B5CF6",
  "color-10": "#EC4899",
  "color-11": "#94A3B8",
  "color-12": "#EAB308",
};

const hexToRgb = (value: string): [number, number, number] | null => {
  const normalized = value.trim();
  if (!HEX_COLOR_REGEX.test(normalized)) {
    return null;
  }

  return [
    Number.parseInt(normalized.slice(1, 3), 16),
    Number.parseInt(normalized.slice(3, 5), 16),
    Number.parseInt(normalized.slice(5, 7), 16),
  ];
};

const rgbDistance = (left: [number, number, number], right: [number, number, number]): number => {
  const red = left[0] - right[0];
  const green = left[1] - right[1];
  const blue = left[2] - right[2];
  return red * red + green * green + blue * blue;
};

export const getThemeColorSlotByIndex = (index: number): ThemeColorSlot =>
  THEME_COLOR_SLOTS[index % THEME_COLOR_SLOTS.length] ?? DEFAULT_THEME_COLOR_SLOT;

export const normalizeThemeColorSlot = (
  input: unknown,
  fallback: ThemeColorSlot = DEFAULT_THEME_COLOR_SLOT,
): ThemeColorSlot => {
  const parsedSlot = themeColorSlotSchema.safeParse(input);
  if (parsedSlot.success) {
    return parsedSlot.data;
  }

  if (typeof input !== "string") {
    return fallback;
  }

  const rgb = hexToRgb(input);
  if (!rgb) {
    return fallback;
  }

  let bestSlot = fallback;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const slot of THEME_COLOR_SLOTS) {
    const candidateRgb = hexToRgb(LEGACY_REFERENCE_PALETTE[slot]);
    if (!candidateRgb) {
      continue;
    }

    const distance = rgbDistance(rgb, candidateRgb);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestSlot = slot;
    }
  }

  return bestSlot;
};

export const themeColorSlotValueSchema = z.preprocess(
  (value) => normalizeThemeColorSlot(value),
  themeColorSlotSchema,
);
