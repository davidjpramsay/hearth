import assert from "node:assert/strict";
import test from "node:test";
import { defaultModulePresentationSettings } from "@hearth/shared";
import { moduleDefinition as bibleVerseModuleDefinition } from "../src/modules/sdk/bible-verse.module";
import { moduleDefinition as calendarModuleDefinition } from "../src/modules/sdk/calendar.module";
import { moduleDefinition as choresModuleDefinition } from "../src/modules/sdk/chores.module";
import { moduleDefinition as clockModuleDefinition } from "../src/modules/sdk/clock.module";
import { moduleDefinition as countDownModuleDefinition } from "../src/modules/sdk/count-down.module";
import { moduleDefinition as photosModuleDefinition } from "../src/modules/sdk/photos.module";
import { moduleDefinition as serverStatusModuleDefinition } from "../src/modules/sdk/server-status.module";
import { moduleDefinition as weatherModuleDefinition } from "../src/modules/sdk/weather.module";
import { moduleDefinition as welcomeModuleDefinition } from "../src/modules/sdk/welcome.module";

const activeModuleDefinitions = [
  bibleVerseModuleDefinition,
  calendarModuleDefinition,
  choresModuleDefinition,
  clockModuleDefinition,
  countDownModuleDefinition,
  photosModuleDefinition,
  serverStatusModuleDefinition,
  weatherModuleDefinition,
  welcomeModuleDefinition,
];

test("all active sdk modules expose default presentation roles", () => {
  for (const definition of activeModuleDefinitions) {
    const parsedSettings = definition.settingsSchema.parse({});
    assert.deepEqual(
      parsedSettings.presentation,
      defaultModulePresentationSettings,
      `expected ${definition.manifest.id} to expose default presentation settings`,
    );
  }
});

test("clock migrates legacy direct font-size settings into presentation roles", () => {
  const parsedSettings = clockModuleDefinition.settingsSchema.parse({
    timeFontSizeRem: 2.5,
    dateFontSizeRem: 1.25,
  });

  assert.equal(parsedSettings.presentation.primaryScale, 1.1);
  assert.equal(parsedSettings.presentation.supportingScale, 1.25);
  assert.equal("timeFontSizeRem" in parsedSettings, false);
  assert.equal("dateFontSizeRem" in parsedSettings, false);
});
