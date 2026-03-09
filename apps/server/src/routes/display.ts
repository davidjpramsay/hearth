import {
  displayDevicesResponseSchema,
  photoCollectionsConfigSchema,
  photoLibraryFoldersResponseSchema,
  reportScreenProfileRequestSchema,
  reportScreenProfileResponseSchema,
  screenProfileLayoutsSchema,
  updateDisplayDeviceRequestSchema,
} from "@hearth/shared";
import { readdir } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { DuplicateDeviceNameError } from "../repositories/device-name.js";
import type { AppServices } from "../types.js";

const PHOTO_LIBRARY_ROOT = resolve(config.dataDir, "photos");
const MAX_FOLDER_OPTIONS = 4096;
const displayDeviceParamsSchema = z.object({
  id: z.string().trim().min(1).max(128),
});

const toRelativeFolderPath = (absolutePath: string): string | null => {
  const rel = relative(PHOTO_LIBRARY_ROOT, absolutePath);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
    return null;
  }
  return rel.replace(/\\/g, "/");
};

const listPhotoLibraryFolders = async (): Promise<string[]> => {
  const folders: string[] = [];
  const seen = new Set<string>();

  const walk = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true }).catch(
      () => null,
    );
    if (!entries) {
      return;
    }

    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.isDirectory()) {
        continue;
      }
      const absolutePath = resolve(directory, entry.name);
      const relativeFolderPath = toRelativeFolderPath(absolutePath);
      if (!relativeFolderPath || seen.has(relativeFolderPath)) {
        continue;
      }
      seen.add(relativeFolderPath);
      folders.push(relativeFolderPath);
      if (folders.length >= MAX_FOLDER_OPTIONS) {
        return;
      }
      await walk(absolutePath);
      if (folders.length >= MAX_FOLDER_OPTIONS) {
        return;
      }
    }
  };

  await walk(PHOTO_LIBRARY_ROOT);
  return folders;
};

export const registerDisplayRoutes = (
  app: FastifyInstance,
  services: AppServices,
): void => {
  app.get("/display/devices", async (request, reply) => {
    await app.authenticate(request, reply);

    if (reply.sent) {
      return;
    }

    return reply.send(
      displayDevicesResponseSchema.parse({
        devices: services.deviceRepository.listDevices(),
      }),
    );
  });

  app.put("/display/devices/:id", async (request, reply) => {
    await app.authenticate(request, reply);

    if (reply.sent) {
      return;
    }

    const parsedParams = displayDeviceParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.code(400).send({ message: parsedParams.error.message });
    }

    const parsedBody = updateDisplayDeviceRequestSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.code(400).send({ message: parsedBody.error.message });
    }

    const existing = services.deviceRepository.getDevice(parsedParams.data.id);
    if (!existing) {
      return reply.code(404).send({ message: "Device not found" });
    }

    const validatedTargetSelection =
      services.screenProfileService.validateManagedDeviceTargetSelection(
        parsedBody.data.targetSelection,
      );
    if (!validatedTargetSelection.ok) {
      return reply.code(400).send({ message: validatedTargetSelection.message });
    }

    let updatedDevice;
    try {
      updatedDevice = services.deviceRepository.updateDevice(
        parsedParams.data.id,
        {
          ...parsedBody.data,
          targetSelection: validatedTargetSelection.targetSelection,
        },
      );
    } catch (error) {
      if (error instanceof DuplicateDeviceNameError) {
        return reply.code(409).send({ message: error.message });
      }

      throw error;
    }

    services.layoutEventBus.publish({
      type: "display-device-updated",
      deviceId: updatedDevice.id,
      changedAt: new Date().toISOString(),
      reason: "device-updated",
    });

    return reply.send(updatedDevice);
  });

  app.get("/display/screen-profiles", async (request, reply) => {
    await app.authenticate(request, reply);

    if (reply.sent) {
      return;
    }

    const mapping = services.settingsRepository.getScreenProfileLayouts();
    return reply.send(screenProfileLayoutsSchema.parse(mapping));
  });

  app.put("/display/screen-profiles", async (request, reply) => {
    await app.authenticate(request, reply);

    if (reply.sent) {
      return;
    }

    const parsedBody = screenProfileLayoutsSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.code(400).send({ message: parsedBody.error.message });
    }

    services.settingsRepository.setScreenProfileLayouts(parsedBody.data);
    return reply.send(
      screenProfileLayoutsSchema.parse(
        services.settingsRepository.getScreenProfileLayouts(),
      ),
    );
  });

  app.get("/display/photo-collections", async (request, reply) => {
    await app.authenticate(request, reply);

    if (reply.sent) {
      return;
    }

    const collections = services.settingsRepository.getPhotoCollections();
    return reply.send(photoCollectionsConfigSchema.parse(collections));
  });

  app.put("/display/photo-collections", async (request, reply) => {
    await app.authenticate(request, reply);

    if (reply.sent) {
      return;
    }

    const parsedBody = photoCollectionsConfigSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.code(400).send({ message: parsedBody.error.message });
    }

    services.settingsRepository.setPhotoCollections(parsedBody.data);
    return reply.send(
      photoCollectionsConfigSchema.parse(
        services.settingsRepository.getPhotoCollections(),
      ),
    );
  });

  app.get("/display/photo-library-folders", async (request, reply) => {
    await app.authenticate(request, reply);

    if (reply.sent) {
      return;
    }

    const folders = await listPhotoLibraryFolders();
    return reply.send(photoLibraryFoldersResponseSchema.parse({ folders }));
  });

  app.post("/display/screen-profile/report", async (request, reply) => {
    const parsedBody = reportScreenProfileRequestSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.code(400).send({ message: parsedBody.error.message });
    }

    const result = services.screenProfileService.reportScreenProfile(parsedBody.data);
    return reply.send(reportScreenProfileResponseSchema.parse(result));
  });
};
