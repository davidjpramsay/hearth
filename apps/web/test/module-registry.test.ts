import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { z } from "zod";
import { defineModule } from "@hearth/module-sdk";
import { MemoryModuleInstanceStore } from "../src/registry/module-instance-store";
import { UnifiedModuleRegistry } from "../src/registry/unified-module-registry";

test("unified module registry lists sdk modules", () => {
  const registry = new UnifiedModuleRegistry(new MemoryModuleInstanceStore());

  const sdkExample = defineModule({
    manifest: {
      id: "sdk-example",
      name: "SDK example",
      version: "1.0.0",
      defaultSize: { w: 3, h: 2 },
      timeMode: "site-local",
    },
    settingsSchema: z.object({ refreshSeconds: z.number().int().default(10) }),
    runtime: {
      Component: () => React.createElement("div", null),
    },
  });

  registry.registerSdk(sdkExample);

  const listed = registry.listModules();
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.id, "sdk-example");
  assert.equal(registry.getModule("sdk-example")?.source, "sdk");
  assert.equal(registry.getModule("sdk-example")?.timeMode, "site-local");
});

test("duplicate sdk module id throws", () => {
  const registry = new UnifiedModuleRegistry(new MemoryModuleInstanceStore());

  const sdkClockA = defineModule({
    manifest: {
      id: "clock",
      name: "Clock",
      version: "2.0.0",
      defaultSize: { w: 3, h: 2 },
    },
    settingsSchema: z.object({ showSeconds: z.boolean().default(true) }),
    runtime: {
      Component: () => React.createElement("div", null, "sdk-a"),
    },
  });
  const sdkClockB = defineModule({
    manifest: {
      id: "clock",
      name: "Clock",
      version: "2.0.1",
      defaultSize: { w: 3, h: 2 },
    },
    settingsSchema: z.object({ showSeconds: z.boolean().default(true) }),
    runtime: {
      Component: () => React.createElement("div", null, "sdk-b"),
    },
  });

  registry.registerSdk(sdkClockA);
  assert.throws(() => registry.registerSdk(sdkClockB));
});
