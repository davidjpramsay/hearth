import assert from "node:assert/strict";
import test from "node:test";
import { buildDuplicateLayoutName } from "../src/pages/layout-name-utils";

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
