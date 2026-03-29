import {
  calendarFeedsConfigSchema,
  displayDevicesResponseSchema,
  photoCollectionsConfigSchema,
  photoLibraryFoldersResponseSchema,
  reportScreenProfileRequestSchema,
  reportScreenProfileResponseSchema,
  screenProfileLayoutsSchema,
  updateDisplayDeviceRequestSchema,
} from "@hearth/shared";
import { readdir } from "node:fs/promises";
import { isIP } from "node:net";
import { isAbsolute, relative, resolve } from "node:path";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { DuplicateDeviceNameError } from "../repositories/device-name.js";
import { sanitizeLayoutRecordForPublicDisplay } from "../services/public-layout.js";
import type { AppServices } from "../types.js";

const PHOTO_LIBRARY_ROOT = resolve(config.dataDir, "photos");
const MAX_FOLDER_OPTIONS = 4096;
const MAX_DEVICE_IP_LENGTH = 255;
const displayDeviceParamsSchema = z.object({
  id: z.string().trim().min(1).max(128),
});

const normalizeIpLiteral = (value: string): string | null => {
  let candidate = value.trim().slice(0, MAX_DEVICE_IP_LENGTH);
  if (candidate.length === 0) {
    return null;
  }

  if (candidate.startsWith('"') && candidate.endsWith('"')) {
    candidate = candidate.slice(1, -1).trim();
  }

  if (candidate.startsWith("[")) {
    const closingIndex = candidate.indexOf("]");
    candidate = closingIndex >= 0 ? candidate.slice(1, closingIndex) : "";
  } else if (
    candidate.includes(".") &&
    candidate.includes(":") &&
    candidate.indexOf(":") === candidate.lastIndexOf(":")
  ) {
    candidate = candidate.slice(0, candidate.lastIndexOf(":"));
  }

  if (candidate.startsWith("::ffff:")) {
    const mappedIpv4 = candidate.slice("::ffff:".length);
    if (isIP(mappedIpv4) === 4) {
      candidate = mappedIpv4;
    }
  }

  return isIP(candidate) > 0 ? candidate : null;
};

const normalizeRequestIp = (value: string | string[] | undefined): string | null => {
  const rawValue = Array.isArray(value) ? value[0] : value;
  if (typeof rawValue !== "string") {
    return null;
  }

  for (const entry of rawValue.split(",")) {
    const candidate = normalizeIpLiteral(entry);
    if (candidate) {
      return candidate;
    }
  }

  return null;
};

const normalizeForwardedHeaderIp = (value: string | string[] | undefined): string | null => {
  const rawValue = Array.isArray(value) ? value[0] : value;
  if (typeof rawValue !== "string") {
    return null;
  }

  for (const forwardedEntry of rawValue.split(",")) {
    for (const token of forwardedEntry.split(";")) {
      const trimmedToken = token.trim();
      if (!trimmedToken.toLowerCase().startsWith("for=")) {
        continue;
      }

      const candidate = normalizeIpLiteral(trimmedToken.slice(4));
      if (candidate) {
        return candidate;
      }
    }
  }

  return null;
};

const getRequestDeviceIp = (request: FastifyRequest): string | null =>
  normalizeRequestIp(request.headers["cf-connecting-ip"]) ??
  normalizeRequestIp(request.headers["true-client-ip"]) ??
  normalizeRequestIp(request.headers["x-real-ip"]) ??
  normalizeRequestIp(request.headers["x-client-ip"]) ??
  normalizeRequestIp(request.headers["x-original-forwarded-for"]) ??
  normalizeForwardedHeaderIp(request.headers.forwarded) ??
  normalizeRequestIp(request.headers["x-forwarded-for"]) ??
  normalizeRequestIp(request.ip);

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
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => null);
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

export const registerDisplayRoutes = (app: FastifyInstance, services: AppServices): void => {
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
      updatedDevice = services.deviceRepository.updateDevice(parsedParams.data.id, {
        ...parsedBody.data,
        targetSelection: validatedTargetSelection.targetSelection,
      });
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

  app.delete("/display/devices/:id", async (request, reply) => {
    await app.authenticate(request, reply);

    if (reply.sent) {
      return;
    }

    const parsedParams = displayDeviceParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.code(400).send({ message: parsedParams.error.message });
    }

    const deleted = services.deviceRepository.deleteDevice(parsedParams.data.id);
    if (!deleted) {
      return reply.code(404).send({ message: "Device not found" });
    }

    services.layoutEventBus.publish({
      type: "display-device-updated",
      deviceId: parsedParams.data.id,
      changedAt: new Date().toISOString(),
      reason: "device-updated",
    });

    return reply.code(204).send();
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
      screenProfileLayoutsSchema.parse(services.settingsRepository.getScreenProfileLayouts()),
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
      photoCollectionsConfigSchema.parse(services.settingsRepository.getPhotoCollections()),
    );
  });

  app.get("/display/calendar-feeds", async (request, reply) => {
    await app.authenticate(request, reply);

    if (reply.sent) {
      return;
    }

    const feeds = services.settingsRepository.getCalendarFeeds();
    return reply.send(calendarFeedsConfigSchema.parse(feeds));
  });

  app.put("/display/calendar-feeds", async (request, reply) => {
    await app.authenticate(request, reply);

    if (reply.sent) {
      return;
    }

    const parsedBody = calendarFeedsConfigSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.code(400).send({ message: parsedBody.error.message });
    }

    services.settingsRepository.setCalendarFeeds(parsedBody.data);
    void services.calendarFeedService.prefetchConfiguredFeeds(parsedBody.data).catch((error) => {
      request.log.warn({ error }, "Failed to prefetch calendar feeds after settings update");
    });

    return reply.send(
      calendarFeedsConfigSchema.parse(services.settingsRepository.getCalendarFeeds()),
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

    const result = services.screenProfileService.reportScreenProfile(parsedBody.data, {
      lastSeenIp: getRequestDeviceIp(request),
    });
    return reply.send(
      reportScreenProfileResponseSchema.parse({
        ...result,
        layout: sanitizeLayoutRecordForPublicDisplay(result.layout),
      }),
    );
  });
};
