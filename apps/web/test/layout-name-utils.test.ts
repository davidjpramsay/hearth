import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDuplicateLayoutName,
  getLayoutDisplayName,
  getStarterLayoutExperienceName,
  getStarterLayoutRatio,
  isPhotoStarterLayoutName,
} from "../src/pages/layout-name-utils";

test("uses (copy) suffix when no collision exists", () => {
  const name = buildDuplicateLayoutName({
    sourceName: "Home layout",
    existingNames: ["Home layout", "Kitchen"],
  });

  assert.equal(name, "Home layout (copy)");
});

test("increments copy suffix when collisions exist", () => {
  const name = buildDuplicateLayoutName({
    sourceName: "Home layout",
    existingNames: ["Home layout", "Home layout (copy)", "home layout (copy 2)"],
  });

  assert.equal(name, "Home layout (copy 3)");
});

test("clamps long names to API maximum length", () => {
  const sourceName = "A".repeat(80);
  const name = buildDuplicateLayoutName({
    sourceName,
    existingNames: [sourceName],
  });

  assert.equal(name.length, 80);
  assert.ok(name.endsWith(" (copy)"));
});

test("formats starter layout names consistently for selectors", () => {
  assert.equal(getLayoutDisplayName("Hearth Week · 16:9"), "Family Week · 16:9");
  assert.equal(getLayoutDisplayName("Hearth Agenda · 9:16"), "Today & Agenda · 9:16");
  assert.equal(getLayoutDisplayName("Hearth Focus · 1:1"), "Family Focus · 1:1");
  assert.equal(getLayoutDisplayName("Hearth Photo · 4:3"), "Photo Focus · 4:3");
});

test("preserves custom names and exposes starter metadata", () => {
  assert.equal(getLayoutDisplayName("Kitchen dashboard"), "Kitchen dashboard");
  assert.equal(getStarterLayoutRatio("Hearth Week · 3:2"), "3:2");
  assert.equal(getStarterLayoutExperienceName("Hearth Week · 3:2"), "Family Week");
  assert.equal(isPhotoStarterLayoutName("Hearth Photo · 3:4"), true);
  assert.equal(isPhotoStarterLayoutName("Hearth Week · 3:4"), false);
});
