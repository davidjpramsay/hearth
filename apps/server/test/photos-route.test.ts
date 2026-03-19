import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Fastify from "fastify";
import { registerPhotoRoutes } from "../src/routes/photos.js";
import type { AppServices } from "../src/types.js";

test("photo image route serves cacheable versioned assets", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "hearth-photo-route-"));
  const imagePath = join(tempDir, "sample.jpg");
  writeFileSync(imagePath, "fake-image");

  const app = Fastify();
  registerPhotoRoutes(app, {
    layoutRepository: {
      findModuleInstance: () => ({
        module: {
          config: {},
        },
      }),
    },
    settingsRepository: {
      getPhotoCollections: () => ({ collections: [] }),
    },
    photosSlideshowService: {
      resolveImagePathFromToken: async () => imagePath,
    },
  } as unknown as AppServices);

  try {
    const response = await app.inject({
      method: "GET",
      url: "/modules/photos/test-instance/image/test-token",
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["cache-control"], "public, max-age=31536000, immutable");
    assert.match(response.headers["content-type"] ?? "", /^image\/jpeg\b/);
  } finally {
    await app.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});
