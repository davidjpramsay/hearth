import { createReadStream } from "node:fs";
import { extname } from "node:path";
import {
  photosImageQuerySchema,
  photosImageParamsSchema,
  photosModuleConfigSchema,
  photosModuleNextQuerySchema,
  photosModuleNextResponseSchema,
  photosModuleParamsSchema,
} from "@hearth/shared";
import type { FastifyInstance } from "fastify";
import type { AppServices } from "../types.js";

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
};

const getActivePhotosConfig = (
  services: AppServices,
  instanceId: string,
):
  | {
      config: ReturnType<typeof photosModuleConfigSchema.parse>;
    }
  | null => {
  const moduleInstance = services.layoutRepository.findModuleInstance(instanceId, "photos");
  if (!moduleInstance) {
    return null;
  }

  const parsedConfig = photosModuleConfigSchema.safeParse(moduleInstance.module.config);
  const normalizedConfig = parsedConfig.success
    ? parsedConfig.data
    : photosModuleConfigSchema.parse({});

  return {
    config: normalizedConfig,
  };
};

export const registerPhotoRoutes = (
  app: FastifyInstance,
  services: AppServices,
): void => {
  app.get("/modules/photos/:instanceId/next", async (request, reply) => {
    const params = photosModuleParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: params.error.message });
    }
    const query = photosModuleNextQuerySchema.safeParse(request.query ?? {});
    if (!query.success) {
      return reply.code(400).send({ message: query.error.message });
    }

    const activeConfig = getActivePhotosConfig(services, params.data.instanceId);
    if (!activeConfig) {
      return reply.code(404).send({ message: "Photos module instance not found" });
    }

    const frame = await services.photosSlideshowService.getNextFrame({
      instanceId: params.data.instanceId,
      config: activeConfig.config,
      screenSessionId: query.data.screenSessionId ?? null,
      requestedCollectionId: query.data.collectionId ?? null,
      requestedSourceKind: query.data.sourceKind ?? null,
      collectionsConfig: services.settingsRepository.getPhotoCollections(),
    });

    return reply.send(photosModuleNextResponseSchema.parse(frame));
  });

  app.get("/modules/photos/:instanceId/image/:token", async (request, reply) => {
    const params = photosImageParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: params.error.message });
    }
    const query = photosImageQuerySchema.safeParse(request.query ?? {});
    if (!query.success) {
      return reply.code(400).send({ message: query.error.message });
    }

    const activeConfig = getActivePhotosConfig(services, params.data.instanceId);
    if (!activeConfig) {
      return reply.code(404).send({ message: "Photos module instance not found" });
    }

    const imagePath = await services.photosSlideshowService.resolveImagePathFromToken(
      {
        moduleConfig: activeConfig.config,
        token: params.data.token,
        requestedCollectionId: query.data.collectionId ?? null,
        requestedSourceKind: query.data.sourceKind ?? null,
        collectionsConfig: services.settingsRepository.getPhotoCollections(),
      },
    );

    if (!imagePath) {
      return reply.code(404).send({ message: "Image not found" });
    }

    const extension = extname(imagePath).toLowerCase();
    const mimeType = MIME_TYPES[extension] ?? "application/octet-stream";
    // Image ids are hashed from path + mtime + size, so unchanged URLs are safe to reuse aggressively.
    reply.header("Cache-Control", "public, max-age=31536000, immutable");
    reply.type(mimeType);
    return reply.send(createReadStream(imagePath));
  });
};
