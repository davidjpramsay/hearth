import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { z } from "zod";
import {
  createLayoutLogicRegistry,
  defineModule,
  validateData,
  validateSettings,
} from "../src/index.js";

test("defineModule validates kebab-case module id", () => {
  assert.throws(
    () =>
      defineModule({
        manifest: {
          id: "BadId",
          name: "Bad module",
          version: "1.0.0",
          defaultSize: { w: 2, h: 2 },
        },
        settingsSchema: z.object({ enabled: z.boolean() }),
        runtime: {
          Component: () => React.createElement("div", null),
        },
      }),
    /kebab-case/,
  );
});

test("validateSettings parses settings schema", () => {
  const definition = defineModule({
    manifest: {
      id: "test-widget",
      name: "Test widget",
      version: "1.0.0",
      defaultSize: { w: 2, h: 2 },
    },
    settingsSchema: z.object({
      refreshSeconds: z.number().int().min(1).default(10),
    }),
    runtime: {
      Component: () => React.createElement("div", null),
    },
  });

  const settings = validateSettings(definition, {});
  assert.equal(settings.refreshSeconds, 10);
});

test("validateData validates data schema when provided", () => {
  const definition = defineModule({
    manifest: {
      id: "status-widget",
      name: "Status widget",
      version: "1.0.0",
      defaultSize: { w: 3, h: 2 },
      timeMode: "source-local",
    },
    settingsSchema: z.object({}),
    dataSchema: z.object({
      ok: z.boolean(),
      uptimeSeconds: z.number().nonnegative(),
    }),
    runtime: {
      Component: () => React.createElement("div", null),
    },
  });

  const data = validateData(definition, { ok: true, uptimeSeconds: 42 });
  assert.equal(data.ok, true);
  assert.equal(data.uptimeSeconds, 42);
  assert.equal(definition.manifest.timeMode, "source-local");

  assert.throws(() => validateData(definition, { ok: true, uptimeSeconds: -1 }), /greater than or equal to 0/);
});

test("createLayoutLogicRegistry validates duplicate ids", () => {
  assert.throws(
    () =>
      createLayoutLogicRegistry({
        conditions: [
          {
            id: "photo.orientation.portrait",
            label: "Photo is portrait",
            description: "Condition A",
            trigger: "portrait-photo",
          },
          {
            id: "photo.orientation.portrait",
            label: "Duplicate id",
            description: "Condition B",
            trigger: "portrait-photo",
          },
        ],
        canvasActions: [
          {
            id: "photo.select-next",
            label: "Select next photo",
            nodeLabel: "Select next photo from library",
            description: "Select next photo.",
          },
        ],
        ruleActions: [
          {
            id: "layout.display",
            label: "Display layout",
            description: "Display one layout.",
            fields: [],
            renderSummary: () => "summary",
          },
        ],
      }),
    /Duplicate condition id/,
  );
});
