import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import {
  photoCollectionsConfigSchema,
  photosModuleConfigSchema,
} from "@hearth/shared";
import { config } from "../src/config.js";
import {
  resolveLegacyPhotoFolderPath,
  resolvePhotoSource,
} from "../src/services/photos-slideshow-service.js";

test("resolveLegacyPhotoFolderPath maps /photos aliases into DATA_DIR/photos", () => {
  const resolved = resolveLegacyPhotoFolderPath("/photos/family");

  assert.equal(resolved, resolve(config.dataDir, "photos", "family"));
});

test("resolvePhotoSource honors legacy module folderPath when no collection is selected", () => {
  const source = resolvePhotoSource({
    moduleConfig: photosModuleConfigSchema.parse({
      folderPath: "/photos/family",
      collectionId: null,
      intervalSeconds: 20,
      shuffle: true,
      layoutOrientation: "landscape",
    }),
    collectionsConfig: photoCollectionsConfigSchema.parse({ collections: [] }),
    requestedSourceKind: "layout",
  });

  assert.deepEqual(source.folders, [resolve(config.dataDir, "photos", "family")]);
  assert.equal(source.sourceLabel, "/photos/family");
});

test("resolvePhotoSource gives collections precedence over legacy folderPath", () => {
  const source = resolvePhotoSource({
    moduleConfig: photosModuleConfigSchema.parse({
      folderPath: "/photos/family",
      collectionId: "kids",
      intervalSeconds: 20,
      shuffle: true,
      layoutOrientation: "landscape",
    }),
    collectionsConfig: photoCollectionsConfigSchema.parse({
      collections: [
        {
          id: "kids",
          name: "Kids",
          folders: ["albums/kids"],
        },
      ],
    }),
    requestedSourceKind: "layout",
  });

  assert.deepEqual(source.folders, [resolve(config.dataDir, "photos", "albums/kids")]);
  assert.equal(source.sourceLabel, "collection 'kids'");
});
