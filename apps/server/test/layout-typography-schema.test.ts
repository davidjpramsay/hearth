import assert from "node:assert/strict";
import test from "node:test";
import { layoutTypographySchema } from "@hearth/shared";

test("layout typography schema migrates legacy six-role values into the new four-role scale", () => {
  const parsed = layoutTypographySchema.parse({
    labelRem: 0.6875,
    metaRem: 0.75,
    bodyRem: 0.875,
    titleRem: 1.125,
    metricRem: 1.25,
    displayRem: 2.25,
  });

  assert.deepEqual(parsed, {
    mode: "custom",
    density: "standard",
    smallRem: 0.75,
    bodyRem: 0.875,
    titleRem: 1.125,
    displayRem: 2.25,
  });
});

test("layout typography defaults to automatic responsive sizing", () => {
  const parsed = layoutTypographySchema.parse({});

  assert.deepEqual(parsed, {
    mode: "auto",
    density: "standard",
    smallRem: 0.75,
    bodyRem: 0.875,
    titleRem: 1.125,
    displayRem: 2.25,
  });
});

test("layout typography migrates default four-role layouts to automatic sizing", () => {
  const parsed = layoutTypographySchema.parse({
    smallRem: 0.75,
    bodyRem: 0.875,
    titleRem: 1.125,
    displayRem: 2.25,
  });

  assert.deepEqual(parsed, {
    mode: "auto",
    density: "standard",
    smallRem: 0.75,
    bodyRem: 0.875,
    titleRem: 1.125,
    displayRem: 2.25,
  });
});

test("layout typography preserves customized four-role layouts as custom sizing", () => {
  const parsed = layoutTypographySchema.parse({
    smallRem: 0.875,
    bodyRem: 1,
    titleRem: 1.25,
    displayRem: 2.5,
  });

  assert.deepEqual(parsed, {
    mode: "custom",
    density: "standard",
    smallRem: 0.875,
    bodyRem: 1,
    titleRem: 1.25,
    displayRem: 2.5,
  });
});
