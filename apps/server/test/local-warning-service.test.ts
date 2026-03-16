import assert from "node:assert/strict";
import test from "node:test";
import { LOCAL_WARNING_CONDITION_TYPE } from "@hearth/shared";
import {
  configureLayoutLogicRegistry,
  resolveLayoutLogicCondition,
} from "../src/layout-logic/registry.js";
import {
  isEscalatingLocalWarning,
  LocalWarningService,
} from "../src/services/local-warning-service.js";

const CAPAU_SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<edxlde:EDXLDistribution xmlns:edxlde="urn:oasis:names:tc:emergency:EDXL:DE:1.0" xmlns:cap="urn:oasis:names:tc:emergency:cap:1.2">
  <edxlde:contentObject>
    <edxlde:xmlContent>
      <edxlde:embeddedXMLContent>
        <cap:alert>
          <cap:identifier>warning-fire-1</cap:identifier>
          <cap:msgType>Alert</cap:msgType>
          <cap:info>
            <cap:category>Fire</cap:category>
            <cap:event>Bushfire</cap:event>
            <cap:urgency>Immediate</cap:urgency>
            <cap:severity>Moderate</cap:severity>
            <cap:expires>2026-03-16T12:00:00+08:00</cap:expires>
            <cap:headline>Bushfire Watch and Act - Yanchep</cap:headline>
            <cap:web>https://emergency.wa.gov.au/warnings/warning-fire-1</cap:web>
            <cap:area>
              <cap:areaDesc>Yanchep and surrounding parts of Wanneroo.</cap:areaDesc>
              <cap:alertLevel>Watch and Act</cap:alertLevel>
              <cap:polygon>-31.5500,115.6200 -31.5400,115.6200 -31.5400,115.6300 -31.5500,115.6300 -31.5500,115.6200</cap:polygon>
              <cap:circle>-31.5450,115.6250 0.0</cap:circle>
            </cap:area>
          </cap:info>
        </cap:alert>
        <cap:alert>
          <cap:identifier>warning-met-1</cap:identifier>
          <cap:msgType>Alert</cap:msgType>
          <cap:info>
            <cap:category>Met</cap:category>
            <cap:event>Thunderstorm</cap:event>
            <cap:event>Weather</cap:event>
            <cap:urgency>Future</cap:urgency>
            <cap:severity>Minor</cap:severity>
            <cap:expires>2026-03-16T09:00:00+08:00</cap:expires>
            <cap:headline>Storm Advice - Perth Metropolitan</cap:headline>
            <cap:web>https://emergency.wa.gov.au/warnings/warning-met-1</cap:web>
            <cap:area>
              <cap:areaDesc>Perth Metropolitan including Perth and nearby suburbs.</cap:areaDesc>
              <cap:alertLevel>Advice</cap:alertLevel>
              <cap:circle>-31.9505,115.8605 0.0</cap:circle>
            </cap:area>
          </cap:info>
        </cap:alert>
      </edxlde:embeddedXMLContent>
    </edxlde:xmlContent>
  </edxlde:contentObject>
</edxlde:EDXLDistribution>`;

test("local warning service matches Emergency WA warnings by pinned coordinates", async () => {
  const service = new LocalWarningService({
    fetchText: async () => CAPAU_SAMPLE_XML,
  });

  await service.refreshNow();

  assert.equal(
    service.hasActiveWarning({
      locationQuery: "Yanchep, AU",
      latitude: -31.545,
      longitude: 115.625,
    }),
    true,
  );
});

test("local warning service matches Emergency WA warnings by selected place name", async () => {
  const service = new LocalWarningService({
    fetchText: async () => CAPAU_SAMPLE_XML,
  });

  await service.refreshNow();

  assert.equal(
    service.hasActiveWarning({
      locationQuery: "Perth, AU",
      latitude: null,
      longitude: null,
    }),
    true,
  );
});

test("layout logic registry resolves the local warning condition", async () => {
  const service = new LocalWarningService({
    fetchText: async () => CAPAU_SAMPLE_XML,
  });

  await service.refreshNow();
  configureLayoutLogicRegistry({
    localWarningService: service,
  });

  try {
    assert.equal(
      resolveLayoutLogicCondition({
        conditionType: LOCAL_WARNING_CONDITION_TYPE,
        conditionParams: {
          locationQuery: "Yanchep, AU",
          latitude: null,
          longitude: null,
        },
        trigger: "portrait-photo",
        orientation: null,
      }),
      true,
    );

    assert.equal(
      resolveLayoutLogicCondition({
        conditionType: LOCAL_WARNING_CONDITION_TYPE,
        conditionParams: {
          locationQuery: "Perth, AU",
          latitude: null,
          longitude: null,
        },
        trigger: "portrait-photo",
        orientation: null,
      }),
      false,
    );
  } finally {
    configureLayoutLogicRegistry({
      localWarningService: null,
    });
  }
});

test("local warning service can force a dev warning", async () => {
  const service = new LocalWarningService({
    devForceActive: true,
  });

  assert.equal(
    service.hasActiveWarning({
      locationQuery: "Perth, AU",
      latitude: null,
      longitude: null,
    }),
    true,
  );

  const warnings = await service.listActiveWarnings({
    locationQuery: "Perth, AU",
    latitude: null,
    longitude: null,
  });

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.serviceKind, "emergency-wa");
  assert.equal(warnings[0]?.alertLevel, "Watch and Act");
  assert.match(warnings[0]?.headline ?? "", /Perth, AU/);
});

test("local warning service keeps CAP-AU warnings even when expires is stale", async () => {
  const service = new LocalWarningService({
    fetchText: async () => CAPAU_SAMPLE_XML.replace(
      "<cap:expires>2026-03-16T09:00:00+08:00</cap:expires>",
      "<cap:expires>2026-03-15T00:00:00+08:00</cap:expires>",
    ),
    now: () => Date.parse("2026-03-16T00:08:00+08:00"),
  });

  await service.refreshNow();

  const warnings = await service.listActiveWarnings({
    locationQuery: "Perth, AU",
    latitude: null,
    longitude: null,
  });

  assert.equal(warnings.length > 0, true);
  assert.match(warnings[0]?.headline ?? "", /Perth Metropolitan/);
});

test("isEscalatingLocalWarning only escalates the top two Emergency WA levels", () => {
  assert.equal(
    isEscalatingLocalWarning({
      alertLevel: "Bushfire Advice",
      severity: "Minor",
      headline: "Advice only",
    }),
    false,
  );
  assert.equal(
    isEscalatingLocalWarning({
      alertLevel: "Bushfire Watch and Act",
      severity: "Moderate",
      headline: "Take action",
    }),
    true,
  );
  assert.equal(
    isEscalatingLocalWarning({
      alertLevel: "Emergency Warning",
      severity: "Minor",
      headline: "Take shelter now",
    }),
    true,
  );
  assert.equal(
    isEscalatingLocalWarning({
      alertLevel: "Smoke Alert",
      severity: "Minor",
      headline: "Smoke nearby",
    }),
    false,
  );
  assert.equal(
    isEscalatingLocalWarning({
      alertLevel: "Smoke Alert",
      severity: "Severe",
      headline: "Prepare now",
    }),
    false,
  );
});
