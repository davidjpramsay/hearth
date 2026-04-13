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
