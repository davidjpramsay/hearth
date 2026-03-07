import assert from "node:assert/strict";
import test from "node:test";
import { serverStatusResponseSchema } from "../src/modules/adapters/server-status";

test("server status adapter response schema accepts valid payload", () => {
  const parsed = serverStatusResponseSchema.parse({
    ok: true,
    service: "hearth-server",
    uptimeSeconds: 123.4,
    timestamp: new Date().toISOString(),
    memory: {
      rss: 1000,
      heapUsed: 500,
      heapTotal: 900,
    },
    host: {
      hostname: "local",
      platform: "darwin",
    },
  });

  assert.equal(parsed.ok, true);
  assert.equal(parsed.service, "hearth-server");
});
