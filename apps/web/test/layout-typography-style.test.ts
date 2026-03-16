import assert from "node:assert/strict";
import test from "node:test";
import { buildLayoutTypographyStyle } from "../src/layout/layout-typography";

test("buildLayoutTypographyStyle maps module typography onto the four layout sizes", () => {
  const style = buildLayoutTypographyStyle({
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
