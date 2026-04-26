import type { CSSProperties } from "react";
import { layoutTypographySchema, type LayoutTypography } from "@hearth/shared";

type LayoutTypographySizeKey = "smallRem" | "bodyRem" | "titleRem" | "displayRem";
type LayoutTypographyDensity = LayoutTypography["density"];

export interface LayoutTypographyControl {
  key: LayoutTypographySizeKey;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
}

export interface LayoutTypographyDensityOption {
  value: LayoutTypographyDensity;
  label: string;
  description: string;
}

export const LAYOUT_TYPOGRAPHY_CONTROLS: LayoutTypographyControl[] = [
  {
    key: "smallRem",
    label: "Small",
    description: "Labels",
    min: 0.625,
    max: 1.125,
    step: 0.125,
  },
  {
    key: "bodyRem",
    label: "Body",
    description: "Body text",
    min: 0.75,
    max: 1.375,
    step: 0.125,
  },
  {
    key: "titleRem",
    label: "Title",
    description: "Headings and titles.",
    min: 1,
    max: 1.875,
    step: 0.125,
  },
  {
    key: "displayRem",
    label: "Display",
    description: "Hero values",
    min: 1.75,
    max: 3.5,
    step: 0.25,
  },
];

export const LAYOUT_TYPOGRAPHY_DENSITY_OPTIONS: LayoutTypographyDensityOption[] = [
  {
    value: "standard",
    label: "Standard",
    description: "Balanced spacing and type for most displays.",
  },
  {
    value: "compact",
    label: "Compact",
    description: "Fits more text into smaller tiles.",
  },
  {
    value: "comfortable",
    label: "Comfortable",
    description: "Adds breathing room on larger displays.",
  },
];

export const DEFAULT_LAYOUT_TYPOGRAPHY: LayoutTypography = layoutTypographySchema.parse({});

const formatRemValue = (value: number): string => `${Number(value.toFixed(4)).toString()}rem`;

const buildCalcOffset = (valueRem: number): string => {
  if (valueRem === 0) {
    return "";
  }

  return valueRem > 0
    ? ` + ${formatRemValue(valueRem)}`
    : ` - ${formatRemValue(Math.abs(valueRem))}`;
};

const canUseContainerQueryLengthUnits = (): boolean => {
  if (typeof globalThis.CSS === "undefined" || typeof globalThis.CSS.supports !== "function") {
    return true;
  }

  return (
    globalThis.CSS.supports("font-size", "1cqi") && globalThis.CSS.supports("font-size", "1cqb")
  );
};

export const normalizeLayoutTypography = (
  input: LayoutTypography | null | undefined,
): LayoutTypography => layoutTypographySchema.parse(input ?? {});

export const areLayoutTypographyEqual = (
  left: LayoutTypography | null | undefined,
  right: LayoutTypography | null | undefined,
): boolean => {
  const normalizedLeft = normalizeLayoutTypography(left);
  const normalizedRight = normalizeLayoutTypography(right);

  return (
    normalizedLeft.mode === normalizedRight.mode &&
    normalizedLeft.density === normalizedRight.density &&
    normalizedLeft.smallRem === normalizedRight.smallRem &&
    normalizedLeft.bodyRem === normalizedRight.bodyRem &&
    normalizedLeft.titleRem === normalizedRight.titleRem &&
    normalizedLeft.displayRem === normalizedRight.displayRem
  );
};

const densityOffsets: Record<
  LayoutTypographyDensity,
  { fontRem: number; spaceRem: number; lineHeightBody: string; lineHeightMeta: string }
> = {
  compact: {
    fontRem: -0.05,
    spaceRem: -0.075,
    lineHeightBody: "1.38",
    lineHeightMeta: "1.32",
  },
  standard: {
    fontRem: 0,
    spaceRem: 0,
    lineHeightBody: "1.45",
    lineHeightMeta: "1.38",
  },
  comfortable: {
    fontRem: 0.06,
    spaceRem: 0.1,
    lineHeightBody: "1.52",
    lineHeightMeta: "1.44",
  },
};

const buildAutoLayoutTypographyStyle = (typography: LayoutTypography): CSSProperties => {
  const density = densityOffsets[typography.density];
  const fontOffset = buildCalcOffset(density.fontRem);
  const spaceOffset = buildCalcOffset(density.spaceRem);

  // Size type primarily from tile width so sibling modules feel consistent, then cap by tile
  // height so shallow rows still fit.
  return {
    ["--layout-typography-mode" as string]: "auto",
    ["--layout-typography-density" as string]: typography.density,
    ["--size-layout-small" as string]: formatRemValue(typography.smallRem),
    ["--size-layout-body" as string]: formatRemValue(typography.bodyRem),
    ["--size-layout-title" as string]: formatRemValue(typography.titleRem),
    ["--size-layout-display" as string]: formatRemValue(typography.displayRem),
    ["--size-module-title" as string]: `clamp(0.6875rem, min(calc(0.62rem + 0.24cqi${fontOffset}), calc(0.6rem + 1.6cqb${fontOffset})), 0.9rem)`,
    ["--size-module-subtitle" as string]: `clamp(0.6875rem, min(calc(0.62rem + 0.24cqi${fontOffset}), calc(0.6rem + 1.6cqb${fontOffset})), 0.9rem)`,
    ["--size-module-overline" as string]: `clamp(0.6875rem, min(calc(0.62rem + 0.24cqi${fontOffset}), calc(0.6rem + 1.6cqb${fontOffset})), 0.9rem)`,
    ["--size-module-label" as string]: `clamp(0.6875rem, min(calc(0.62rem + 0.24cqi${fontOffset}), calc(0.6rem + 1.6cqb${fontOffset})), 0.9rem)`,
    ["--size-module-meta" as string]: `clamp(0.75rem, min(calc(0.68rem + 0.22cqi${fontOffset}), calc(0.64rem + 1.7cqb${fontOffset})), 0.98rem)`,
    ["--size-module-body" as string]: `clamp(0.8125rem, min(calc(0.78rem + 0.38cqi${fontOffset}), calc(0.72rem + 2.2cqb${fontOffset})), 1.12rem)`,
    ["--size-module-body-strong" as string]: `clamp(0.875rem, min(calc(0.82rem + 0.46cqi${fontOffset}), calc(0.76rem + 2.55cqb${fontOffset})), 1.22rem)`,
    ["--size-module-heading" as string]: `clamp(1rem, min(calc(0.92rem + 0.75cqi${fontOffset}), calc(0.85rem + 4cqb${fontOffset})), 1.5rem)`,
    ["--size-module-title-content" as string]: `clamp(1rem, min(calc(0.92rem + 0.75cqi${fontOffset}), calc(0.85rem + 4cqb${fontOffset})), 1.5rem)`,
    ["--size-module-metric" as string]: `clamp(1.125rem, min(calc(1rem + 1.1cqi${fontOffset}), calc(0.9rem + 5.2cqb${fontOffset})), 1.85rem)`,
    ["--size-module-metric-lg" as string]: `clamp(1.25rem, min(calc(1.1rem + 1.55cqi${fontOffset}), calc(1rem + 6.5cqb${fontOffset})), 2.35rem)`,
    ["--size-module-display-sm" as string]: `clamp(2.75rem, min(calc(2.25rem + 2.5cqi${fontOffset}), calc(1.75rem + 12cqb${fontOffset})), 4.45rem)`,
    ["--size-module-display" as string]: `clamp(3.2rem, min(calc(2.85rem + 3.2cqi${fontOffset}), calc(1.85rem + 18cqb${fontOffset})), 5.2rem)`,
    ["--size-module-display-lg" as string]: `clamp(3.45rem, min(calc(3rem + 3.8cqi${fontOffset}), calc(2rem + 20cqb${fontOffset})), 5.85rem)`,
    ["--line-height-module-meta" as string]: density.lineHeightMeta,
    ["--line-height-module-body" as string]: density.lineHeightBody,
    ["--space-module-1" as string]: `clamp(0.25rem, min(calc(0.22rem + 0.18cqi${spaceOffset}), calc(0.18rem + 0.75cqb${spaceOffset})), 0.55rem)`,
    ["--space-module-2" as string]: `clamp(0.45rem, min(calc(0.34rem + 0.34cqi${spaceOffset}), calc(0.28rem + 1.2cqb${spaceOffset})), 0.85rem)`,
    ["--space-module-3" as string]: `clamp(0.65rem, min(calc(0.5rem + 0.48cqi${spaceOffset}), calc(0.4rem + 1.7cqb${spaceOffset})), 1.15rem)`,
    ["--space-module-4" as string]: `clamp(0.85rem, min(calc(0.62rem + 0.7cqi${spaceOffset}), calc(0.5rem + 2.2cqb${spaceOffset})), 1.55rem)`,
    ["--module-frame-padding" as string]: `clamp(0.5rem, min(calc(0.42rem + 0.32cqi${spaceOffset}), calc(0.36rem + 1.25cqb${spaceOffset})), 0.95rem)`,
    ["--module-panel-padding" as string]: `clamp(0.75rem, min(calc(0.58rem + 0.55cqi${spaceOffset}), calc(0.5rem + 1.9cqb${spaceOffset})), 1.25rem)`,
    ["--module-panel-padding-tight" as string]: `clamp(0.5rem, min(calc(0.42rem + 0.36cqi${spaceOffset}), calc(0.34rem + 1.35cqb${spaceOffset})), 0.95rem)`,
    ["--module-panel-radius" as string]: `clamp(0.5rem, min(calc(0.42rem + 0.24cqi), calc(0.38rem + 1cqb)), 0.85rem)`,
    ["--module-panel-radius-inner" as string]: `clamp(0.375rem, min(calc(0.3rem + 0.18cqi), calc(0.28rem + 0.75cqb)), 0.65rem)`,
  };
};

const buildCustomLayoutTypographyStyle = (
  typography: LayoutTypography,
  modeLabel: "custom" | "auto-fallback" = "custom",
): CSSProperties => {
  const smallRem = typography.smallRem;
  const bodyRem = typography.bodyRem;
  const titleRem = typography.titleRem;
  const displayRem = typography.displayRem;

  return {
    ["--layout-typography-mode" as string]: modeLabel,
    ["--layout-typography-density" as string]: typography.density,
    ["--size-layout-small" as string]: formatRemValue(smallRem),
    ["--size-layout-body" as string]: formatRemValue(bodyRem),
    ["--size-layout-title" as string]: formatRemValue(titleRem),
    ["--size-layout-display" as string]: formatRemValue(displayRem),
    ["--size-module-title" as string]: formatRemValue(smallRem),
    ["--size-module-subtitle" as string]: formatRemValue(smallRem),
    ["--size-module-overline" as string]: formatRemValue(smallRem),
    ["--size-module-label" as string]: formatRemValue(smallRem),
    ["--size-module-meta" as string]: formatRemValue(smallRem),
    ["--size-module-body" as string]: formatRemValue(bodyRem),
    ["--size-module-body-strong" as string]: formatRemValue(bodyRem),
    ["--size-module-heading" as string]: formatRemValue(titleRem),
    ["--size-module-title-content" as string]: formatRemValue(titleRem),
    ["--size-module-metric" as string]: formatRemValue(titleRem),
    ["--size-module-metric-lg" as string]: formatRemValue(titleRem),
    ["--size-module-display-sm" as string]: formatRemValue(displayRem),
    ["--size-module-display" as string]: formatRemValue(displayRem),
    ["--size-module-display-lg" as string]: formatRemValue(displayRem),
    ["--line-height-module-meta" as string]: "1.45",
    ["--line-height-module-body" as string]: "1.5",
    ["--space-module-1" as string]: formatRemValue(Math.max(0.25, bodyRem * 0.45)),
    ["--space-module-2" as string]: formatRemValue(Math.max(0.45, bodyRem * 0.7)),
    ["--space-module-3" as string]: formatRemValue(Math.max(0.65, bodyRem)),
    ["--space-module-4" as string]: formatRemValue(Math.max(0.85, bodyRem * 1.35)),
    ["--module-frame-padding" as string]: formatRemValue(Math.max(0.5, bodyRem * 0.72)),
    ["--module-panel-padding" as string]: formatRemValue(Math.max(0.75, bodyRem * 1.05)),
    ["--module-panel-padding-tight" as string]: formatRemValue(Math.max(0.5, bodyRem * 0.8)),
    ["--module-panel-radius" as string]: "var(--radius-module)",
    ["--module-panel-radius-inner" as string]: "var(--radius-module-inner)",
  };
};

export const buildLayoutTypographyStyle = (
  input: LayoutTypography | null | undefined,
): CSSProperties => {
  const typography = normalizeLayoutTypography(input);

  if (typography.mode === "auto") {
    return canUseContainerQueryLengthUnits()
      ? buildAutoLayoutTypographyStyle(typography)
      : buildCustomLayoutTypographyStyle(typography, "auto-fallback");
  }

  return buildCustomLayoutTypographyStyle(typography);
};

export const formatLayoutTypographyValue = (value: number): string =>
  `${Number(value.toFixed(4)).toString()}rem`;

export const snapLayoutTypographyValue = (
  value: number,
  control: Pick<LayoutTypographyControl, "min" | "max" | "step">,
): number => {
  const clamped = Math.min(control.max, Math.max(control.min, value));
  const stepped = Math.round((clamped - control.min) / control.step) * control.step + control.min;

  return Number(stepped.toFixed(4));
};
