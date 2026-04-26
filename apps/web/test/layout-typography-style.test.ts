import assert from "node:assert/strict";
import test from "node:test";
import { buildLayoutTypographyStyle } from "../src/layout/layout-typography";

const originalCSS = globalThis.CSS;

test("buildLayoutTypographyStyle maps custom module typography onto the four layout sizes", () => {
  const style = buildLayoutTypographyStyle({
    mode: "custom",
    density: "standard",
    smallRem: 0.875,
    bodyRem: 1,
    titleRem: 1.25,
    displayRem: 2.5,
  }) as Record<string, string>;

  assert.equal(style["--size-layout-small"], "0.875rem");
  assert.equal(style["--size-layout-body"], "1rem");
  assert.equal(style["--size-layout-title"], "1.25rem");
  assert.equal(style["--size-layout-display"], "2.5rem");
  assert.equal(style["--size-module-body"], "1rem");
  assert.equal(style["--size-module-title-content"], "1.25rem");
  assert.equal(style["--size-module-display"], "2.5rem");
  assert.equal(style["--size-module-overline"], "0.875rem");
  assert.equal(style["--size-module-heading"], "1.25rem");
  assert.equal(style["--size-module-display-lg"], "2.5rem");
});

test("buildLayoutTypographyStyle defaults to automatic container-based module sizing", () => {
  const style = buildLayoutTypographyStyle({
    mode: "auto",
    density: "comfortable",
    smallRem: 0.75,
    bodyRem: 0.875,
    titleRem: 1.125,
    displayRem: 2.25,
  }) as Record<string, string>;

  assert.equal(style["--layout-typography-mode"], "auto");
  assert.equal(style["--layout-typography-density"], "comfortable");
  assert.match(style["--size-module-body"], /cqi/);
  assert.match(style["--size-module-display"], /cqb/);
  assert.match(style["--module-panel-padding"], /cqi/);
});

test("buildLayoutTypographyStyle falls back when container query units are unsupported", () => {
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: {
      supports: () => false,
    },
  });

  try {
    const style = buildLayoutTypographyStyle({
      mode: "auto",
      density: "standard",
      smallRem: 0.75,
      bodyRem: 0.875,
      titleRem: 1.125,
      displayRem: 2.25,
    }) as Record<string, string>;

    assert.equal(style["--layout-typography-mode"], "auto-fallback");
    assert.equal(style["--size-module-body"], "0.875rem");
    assert.equal(style["--size-module-display"], "2.25rem");
  } finally {
    Object.defineProperty(globalThis, "CSS", {
      configurable: true,
      value: originalCSS,
    });
  }
});
