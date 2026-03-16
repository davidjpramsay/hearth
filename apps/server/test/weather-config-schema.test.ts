import assert from "node:assert/strict";
import test from "node:test";
import { weatherModuleConfigSchema } from "@hearth/shared";

test("weather config schema migrates legacy today visibility flags", () => {
  const parsed = weatherModuleConfigSchema.parse({
    locationQuery: "Perth, AU",
    showWind: false,
    showHumidity: true,
  });

  assert.equal(parsed.showTodayWind, false);
  assert.equal(parsed.showTodayHumidity, true);
});

test("weather config schema defaults wind speed to knots", () => {
  const parsed = weatherModuleConfigSchema.parse({
    locationQuery: "Perth, AU",
  });

  assert.equal(parsed.windSpeedUnit, "knots");
  assert.equal(parsed.showTodayMinTemperature, true);
  assert.equal(parsed.showTodayPrecipitation, true);
});
