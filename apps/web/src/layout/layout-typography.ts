import type { CSSProperties } from "react";
import { layoutTypographySchema, type LayoutTypography } from "@hearth/shared";

export interface LayoutTypographyControl {
  key: keyof LayoutTypography;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
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

export const DEFAULT_LAYOUT_TYPOGRAPHY: LayoutTypography = layoutTypographySchema.parse({});

const formatRemValue = (value: number): string => `${Number(value.toFixed(4)).toString()}rem`;

export const normalizeLayoutTypography = (
  input: LayoutTypography | null | undefined,
): LayoutTypography => layoutTypographySchema.parse(input ?? {});

export const buildLayoutTypographyStyle = (
  input: LayoutTypography | null | undefined,
): CSSProperties => {
  const typography = normalizeLayoutTypography(input);
  const smallRem = typography.smallRem;
  const bodyRem = typography.bodyRem;
  const titleRem = typography.titleRem;
  const displayRem = typography.displayRem;

  return {
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
  };
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
