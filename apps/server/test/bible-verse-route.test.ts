import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { config } from "../src/config.js";
import {
  registerBibleVerseRoutes,
  selectDailyPassageReference,
} from "../src/routes/bible-verse.js";
import type { AppServices } from "../src/types.js";

test("bible verse route selects the verse of the day using the household timezone", async () => {
  let requestedReference: string | null = null;
  const fixedNow = new Date("2026-03-09T16:45:00.000Z");
  const RealDate = Date;
  const realFetch = globalThis.fetch;
  const originalApiKey = config.esvApiKey;

  class FixedDate extends Date {
    constructor(...args: ConstructorParameters<typeof Date>) {
      super(args.length === 0 ? fixedNow.toISOString() : args[0]);
    }

    static now(): number {
      return fixedNow.getTime();
    }
  }

  globalThis.Date = FixedDate as DateConstructor;
  config.esvApiKey = "test-esv-key";
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    requestedReference = url.searchParams.get("q");

    return new Response(
      JSON.stringify({
        canonical: requestedReference,
        passages: ["Test verse"],
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }) as typeof fetch;

  const app = Fastify();
  registerBibleVerseRoutes(
    app,
    {
      layoutRepository: {
        findModuleInstance: () => ({
          module: {
            config: {
              refreshIntervalSeconds: 300,
              showReference: true,
              showSource: false,
            },
          },
        }),
      },
      settingsRepository: {
        getSiteTimeConfig: () => ({
          siteTimezone: "Australia/Perth",
        }),
      },
    } as unknown as AppServices,
  );

  try {
    const response = await app.inject({
      method: "GET",
      url: "/modules/bible-verse/test-instance/today",
    });

    const expectedReference = selectDailyPassageReference(
      fixedNow,
      "Australia/Perth",
    );
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.equal(requestedReference, expectedReference);

    const payload = response.json();
    assert.equal(payload.reference, expectedReference);
    assert.equal(payload.verse, "Test verse");
  } finally {
    await app.close();
    globalThis.Date = RealDate;
    globalThis.fetch = realFetch;
    config.esvApiKey = originalApiKey;
  }
});
