import test from "node:test";
import assert from "node:assert/strict";
import { THEME_COLOR_SLOTS } from "@hearth/shared";
import { THEME_OPTIONS, buildThemePaletteEntriesForTheme, type ThemeId } from "../src/theme/theme";

const hexToRgb = (value: string): [number, number, number] => [
  Number.parseInt(value.slice(1, 3), 16),
  Number.parseInt(value.slice(3, 5), 16),
  Number.parseInt(value.slice(5, 7), 16),
];

const toRelativeLuminance = ([red, green, blue]: [number, number, number]): number => {
  const normalize = (channel: number): number => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * normalize(red) + 0.7152 * normalize(green) + 0.0722 * normalize(blue);
};

const toContrastRatio = (left: number, right: number): number => {
  const lighter = Math.max(left, right);
  const darker = Math.min(left, right);
  return (lighter + 0.05) / (darker + 0.05);
};

const colorDistance = (left: string, right: string): number => {
  const leftRgb = hexToRgb(left);
  const rightRgb = hexToRgb(right);

  return Math.sqrt(
    leftRgb.reduce((sum, channel, index) => sum + (channel - (rightRgb[index] ?? channel)) ** 2, 0),
  );
};

const previewPaletteDistance = (leftThemeId: ThemeId, rightThemeId: ThemeId): number => {
  const leftPalette = buildThemePaletteEntriesForTheme(leftThemeId).slice(0, 6);
  const rightPalette = buildThemePaletteEntriesForTheme(rightThemeId).slice(0, 6);

  return (
    leftPalette.reduce(
      (sum, entry, index) => sum + colorDistance(entry.hex, rightPalette[index]?.hex ?? entry.hex),
      0,
    ) / leftPalette.length
  );
};

test("every theme exposes a full 12-slot palette", () => {
  for (const theme of THEME_OPTIONS) {
    const entries = buildThemePaletteEntriesForTheme(theme.id as ThemeId);
    assert.equal(entries.length, THEME_COLOR_SLOTS.length);
    assert.deepEqual(
      entries.map((entry) => entry.slot),
      [...THEME_COLOR_SLOTS],
    );
  }
});

test("theme palette slots maintain readable foreground contrast", () => {
  for (const theme of THEME_OPTIONS) {
    const entries = buildThemePaletteEntriesForTheme(theme.id as ThemeId);
    for (const entry of entries) {
      const background = toRelativeLuminance(hexToRgb(entry.hex));
      const foreground = toRelativeLuminance(hexToRgb(entry.foreground));
      const contrast = toContrastRatio(background, foreground);
      assert.ok(
        contrast >= 4.5,
        `${theme.id} ${entry.slot} contrast ${contrast.toFixed(2)} is below 4.5`,
      );
    }
  }
});

test("theme preview palettes stay visually distinct", () => {
  // Light and dark deliberately share one product palette, with brighter dark-mode accents.
  const minimumAverageDistance = 30;

  for (let leftIndex = 0; leftIndex < THEME_OPTIONS.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < THEME_OPTIONS.length; rightIndex += 1) {
      const leftTheme = THEME_OPTIONS[leftIndex]!;
      const rightTheme = THEME_OPTIONS[rightIndex]!;
      const distance = previewPaletteDistance(leftTheme.id as ThemeId, rightTheme.id as ThemeId);

      assert.ok(
        distance >= minimumAverageDistance,
        `${leftTheme.id} and ${rightTheme.id} preview palettes are too similar (${distance.toFixed(2)})`,
      );
    }
  }
});
