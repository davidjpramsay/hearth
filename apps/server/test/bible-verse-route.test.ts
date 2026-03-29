import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { config } from "../src/config.js";
import {
  registerBibleVerseRoutes,
  selectDailyPassageReference,
} from "../src/routes/bible-verse.js";
import type { AppServices } from "../src/types.js";

const createModuleStateRepositoryStub = () => {
  const store = new Map<string, unknown>();

  return {
    getState: <T>(key: string): T | null => (store.get(key) as T | undefined) ?? null,
    setState: (key: string, value: unknown) => {
      store.set(key, value);
    },
  };
};

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
  registerBibleVerseRoutes(app, {
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
  } as unknown as AppServices);

  try {
    const response = await app.inject({
      method: "GET",
      url: "/modules/bible-verse/test-instance/today",
    });

    const expectedReference = selectDailyPassageReference(fixedNow, "Australia/Perth");
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

test("bible verse route falls back to the saved verse for the current site day", async () => {
  let fetchCount = 0;
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
    fetchCount += 1;
    if (fetchCount === 1) {
      const url = new URL(typeof input === "string" ? input : input.url);
      const reference = url.searchParams.get("q");

      return new Response(
        JSON.stringify({
          canonical: reference,
          passages: ["Saved fallback verse"],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    }

    throw new Error("ESV unavailable");
  }) as typeof fetch;

  const moduleStateRepository = createModuleStateRepositoryStub();
  const app = Fastify();
  registerBibleVerseRoutes(app, {
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
    moduleStateRepository,
  } as unknown as AppServices);

  try {
    const firstResponse = await app.inject({
      method: "GET",
      url: "/modules/bible-verse/test-instance/today",
    });
    assert.equal(firstResponse.statusCode, 200);
    assert.equal(firstResponse.json().verse, "Saved fallback verse");

    const secondResponse = await app.inject({
      method: "GET",
      url: "/modules/bible-verse/test-instance/today",
    });

    assert.equal(secondResponse.statusCode, 200);
    const payload = secondResponse.json();
    assert.equal(payload.verse, "Saved fallback verse");
    assert.match(payload.warning ?? "", /saved verse for today/i);
  } finally {
    await app.close();
    globalThis.Date = RealDate;
    globalThis.fetch = realFetch;
    config.esvApiKey = originalApiKey;
  }
});
