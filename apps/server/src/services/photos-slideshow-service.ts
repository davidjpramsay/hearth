import { access, open, readFile, readdir, stat } from "node:fs/promises";
import { watch, type FSWatcher } from "node:fs";
import { basename, extname, isAbsolute, relative, resolve } from "node:path";
import { createHash } from "node:crypto";
import {
  photoCollectionIdSchema,
  photoCollectionsConfigSchema,
  photosModuleConfigSchema,
  photosModuleNextResponseSchema,
  photosOrientationSchema,
  type PhotoCollectionsConfig,
  type PhotosModuleConfig,
  type PhotosModuleNextResponse,
  type PhotosOrientation,
} from "@hearth/shared";
import { z } from "zod";
import type { ModuleStateRepository } from "../repositories/module-state-repository.js";
import { config } from "../config.js";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"]);

const ORIENTATION_DEBOUNCE_MS = 0;
const FOLDER_RESCAN_INTERVAL_MS = 15_000;
const MAX_WATCH_DIRECTORIES = 256;
const IMAGE_METADATA_SCAN_BYTES = 256 * 1024;
const PHOTO_LIBRARY_ROOT = resolve(config.dataDir, "photos");
const LEGACY_PHOTO_LIBRARY_ROOT_LABEL = "/photos";

const photoModuleStateSchema = z.object({
  currentPhotoId: z.string().nullable().default(null),
  photoOrder: z.array(z.string()).default([]),
  shuffle: z.boolean().default(true),
  lastFrameAdvancedAtMs: z.number().int().nonnegative().default(0),
  stableOrientation: photosOrientationSchema.nullable().default(null),
  lastOrientationChangeAtMs: z.number().int().nonnegative().default(0),
});

type PhotoModuleState = z.infer<typeof photoModuleStateSchema>;

interface PhotoAsset {
  id: string;
  absolutePath: string;
  filename: string;
  width: number;
  height: number;
  orientation: PhotosOrientation;
}

interface FolderCache {
  loadedAtMs: number;
  dirty: boolean;
  photos: PhotoAsset[];
  watchers: Map<string, FSWatcher>;
}

interface PhotoMetadata {
  width: number;
  height: number;
  exifOrientation: number | null;
}

interface PhotoMetadataCacheEntry {
  mtimeMs: number;
  size: number;
  metadata: PhotoMetadata | null;
}

interface ResolvedPhotoSource {
  folders: string[];
  sourceKey: string;
  sourceLabel: string;
  collectionId: string | null;
  sourceKind: "set" | "layout" | null;
}

const photoOrientationStateSchema = z.object({
  stableOrientation: photosOrientationSchema.nullable().default(null),
  lastOrientationChangeAtMs: z.number().int().nonnegative().default(0),
});

type PhotoOrientationState = z.infer<typeof photoOrientationStateSchema>;

const normalizeScreenSessionId = (screenSessionId: string | null | undefined): string | null => {
  if (typeof screenSessionId !== "string") {
    return null;
  }
  const trimmed = screenSessionId.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toPlaybackStateKey = (
  sourceKey: string,
  shuffle: boolean,
  screenSessionId: string | null,
): string => {
  const sourceHash = createHash("sha1").update(sourceKey).digest("hex");
  const baseKey = `photos-playback:${sourceHash}:${shuffle ? "shuffle" : "ordered"}`;
  if (!screenSessionId) {
    return baseKey;
  }
  const screenHash = createHash("sha1").update(screenSessionId).digest("hex");
  return `${baseKey}:screen:${screenHash}`;
};

const toOrientationStateKey = (sourceKey: string, screenSessionId: string | null): string => {
  const sourceHash = createHash("sha1").update(sourceKey).digest("hex");
  const baseKey = `photos-orientation:${sourceHash}`;
  if (!screenSessionId) {
    return baseKey;
  }
  const screenHash = createHash("sha1").update(screenSessionId).digest("hex");
  return `${baseKey}:screen:${screenHash}`;
};

const pathIsWithin = (parentPath: string, childPath: string): boolean => {
  const rel = relative(parentPath, childPath);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};

const normalizeCollectionFolderEntry = (folder: string): string | null => {
  const normalized = folder.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized === ".") {
    return PHOTO_LIBRARY_ROOT;
  }

  const absolute = resolve(PHOTO_LIBRARY_ROOT, normalized);
  if (!pathIsWithin(PHOTO_LIBRARY_ROOT, absolute)) {
    return null;
  }

  return absolute;
};

const toFolderSourceLabel = (absolutePath: string): string => {
  const rel = relative(PHOTO_LIBRARY_ROOT, absolutePath);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
    return LEGACY_PHOTO_LIBRARY_ROOT_LABEL;
  }

  const normalizedRel = rel.replace(/\\/g, "/");
  return normalizedRel.length > 0
    ? `${LEGACY_PHOTO_LIBRARY_ROOT_LABEL}/${normalizedRel}`
    : LEGACY_PHOTO_LIBRARY_ROOT_LABEL;
};

export const resolveLegacyPhotoFolderPath = (
  folderPath: string | null | undefined,
): string | null => {
  if (typeof folderPath !== "string") {
    return null;
  }

  const normalized = folderPath.trim().replace(/\\/g, "/");
  if (!normalized) {
    return null;
  }

  if (
    normalized === LEGACY_PHOTO_LIBRARY_ROOT_LABEL ||
    normalized === `${LEGACY_PHOTO_LIBRARY_ROOT_LABEL}/` ||
    normalized === "."
  ) {
    return PHOTO_LIBRARY_ROOT;
  }

  if (normalized.startsWith(`${LEGACY_PHOTO_LIBRARY_ROOT_LABEL}/`)) {
    return normalizeCollectionFolderEntry(
      normalized.slice(LEGACY_PHOTO_LIBRARY_ROOT_LABEL.length + 1),
    );
  }

  const absoluteCandidate = resolve(normalized);
  if (pathIsWithin(PHOTO_LIBRARY_ROOT, absoluteCandidate)) {
    return absoluteCandidate;
  }

  return normalizeCollectionFolderEntry(normalized);
};

export const resolvePhotoSource = (input: {
  moduleConfig: PhotosModuleConfig;
  requestedCollectionId?: string | null;
  requestedSourceKind?: "set" | "layout" | null;
  collectionsConfig: PhotoCollectionsConfig;
}): ResolvedPhotoSource => {
  const parseCollectionId = (value: unknown): string | null => {
    const parsed = photoCollectionIdSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  };

  const findCollectionFolders = (collectionId: string): string[] => {
    const collection = input.collectionsConfig.collections.find(
      (entry) => entry.id === collectionId,
    );
    if (!collection) {
      return [];
    }

    const folders: string[] = [];
    const seen = new Set<string>();
    for (const folder of collection.folders) {
      const normalized = normalizeCollectionFolderEntry(folder);
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      folders.push(normalized);
    }
    return folders;
  };

  const requestedSourceKind =
    input.requestedSourceKind === "set" || input.requestedSourceKind === "layout"
      ? input.requestedSourceKind
      : null;

  const requestedCollectionId = parseCollectionId(input.requestedCollectionId);
  if (requestedCollectionId) {
    const folders = findCollectionFolders(requestedCollectionId);
    if (folders.length > 0) {
      return {
        folders,
        sourceKey: `collection:${requestedCollectionId}`,
        sourceLabel: `collection '${requestedCollectionId}'`,
        collectionId: requestedCollectionId,
        sourceKind: requestedSourceKind,
      };
    }
  }

  if (requestedSourceKind === "set") {
    const fallbackFolder = PHOTO_LIBRARY_ROOT;
    return {
      folders: [fallbackFolder],
      sourceKey: `set-folder:${fallbackFolder}`,
      sourceLabel: LEGACY_PHOTO_LIBRARY_ROOT_LABEL,
      collectionId: null,
      sourceKind: "set",
    };
  }

  const moduleCollectionId = parseCollectionId(input.moduleConfig.collectionId);
  if (moduleCollectionId) {
    const folders = findCollectionFolders(moduleCollectionId);
    if (folders.length > 0) {
      return {
        folders,
        sourceKey: `collection:${moduleCollectionId}`,
        sourceLabel: `collection '${moduleCollectionId}'`,
        collectionId: moduleCollectionId,
        sourceKind: requestedSourceKind,
      };
    }
  }

  const legacyFolder = resolveLegacyPhotoFolderPath(input.moduleConfig.folderPath);
  if (legacyFolder) {
    return {
      folders: [legacyFolder],
      sourceKey: `folder:${legacyFolder}`,
      sourceLabel: toFolderSourceLabel(legacyFolder),
      collectionId: null,
      sourceKind: requestedSourceKind,
    };
  }

  const fallbackFolder = PHOTO_LIBRARY_ROOT;
  return {
    folders: [fallbackFolder],
    sourceKey: `folder:${fallbackFolder}`,
    sourceLabel: LEGACY_PHOTO_LIBRARY_ROOT_LABEL,
    collectionId: null,
    sourceKind: requestedSourceKind,
  };
};

const shuffleArray = <T>(input: T[]): T[] => {
  const next = [...input];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const swapIndex = Math.floor(Math.random() * (i + 1));
    [next[i], next[swapIndex]] = [next[swapIndex], next[i]];
  }

  return next;
};

const getOrientationFromDimensions = (width: number, height: number): PhotosOrientation => {
  if (width === height) {
    return "square";
  }

  return height > width ? "portrait" : "landscape";
};

const parseExifOrientation = (segmentBuffer: Buffer): number | null => {
  if (segmentBuffer.length < 14) {
    return null;
  }

  if (segmentBuffer.subarray(0, 6).toString("ascii") !== "Exif\u0000\u0000") {
    return null;
  }

  const tiffOffset = 6;
  const byteOrder = segmentBuffer.subarray(tiffOffset, tiffOffset + 2).toString("ascii");
  const littleEndian = byteOrder === "II";

  if (!littleEndian && byteOrder !== "MM") {
    return null;
  }

  const readU16 = (offset: number): number =>
    littleEndian ? segmentBuffer.readUInt16LE(offset) : segmentBuffer.readUInt16BE(offset);
  const readU32 = (offset: number): number =>
    littleEndian ? segmentBuffer.readUInt32LE(offset) : segmentBuffer.readUInt32BE(offset);

  if (segmentBuffer.length < tiffOffset + 8) {
    return null;
  }

  const ifdOffset = readU32(tiffOffset + 4);
  const ifdStart = tiffOffset + ifdOffset;

  if (ifdStart + 2 > segmentBuffer.length) {
    return null;
  }

  const entryCount = readU16(ifdStart);

  for (let i = 0; i < entryCount; i += 1) {
    const entryOffset = ifdStart + 2 + i * 12;

    if (entryOffset + 12 > segmentBuffer.length) {
      break;
    }

    const tag = readU16(entryOffset);
    if (tag !== 0x0112) {
      continue;
    }

    const type = readU16(entryOffset + 2);
    const count = readU32(entryOffset + 4);

    if (type === 3 && count === 1) {
      return readU16(entryOffset + 8);
    }

    const valueOffset = readU32(entryOffset + 8);
    const valuePtr = tiffOffset + valueOffset;

    if (valuePtr + 2 <= segmentBuffer.length) {
      return readU16(valuePtr);
    }

    return null;
  }

  return null;
};

const parseJpegMetadata = (
  input: Buffer,
): { width: number; height: number; exifOrientation: number | null } | null => {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  let width: number | null = null;
  let height: number | null = null;
  let exifOrientation: number | null = null;

  const sofMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);

  while (offset + 4 <= input.length) {
    if (input[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    let marker = input[offset + 1];
    while (marker === 0xff) {
      offset += 1;
      marker = input[offset + 1];
    }

    if (marker === 0xd9 || marker === 0xda) {
      break;
    }

    if (offset + 4 > input.length) {
      break;
    }

    const segmentLength = input.readUInt16BE(offset + 2);
    if (segmentLength < 2) {
      break;
    }

    const segmentDataStart = offset + 4;
    const segmentDataEnd = offset + 2 + segmentLength;

    if (segmentDataEnd > input.length) {
      break;
    }

    if (marker === 0xe1 && exifOrientation === null) {
      exifOrientation = parseExifOrientation(input.subarray(segmentDataStart, segmentDataEnd));
    }

    if (sofMarkers.has(marker) && segmentDataStart + 5 <= input.length) {
      height = input.readUInt16BE(segmentDataStart + 1);
      width = input.readUInt16BE(segmentDataStart + 3);
    }

    offset = segmentDataEnd;

    if (width !== null && height !== null && exifOrientation !== null) {
      break;
    }
  }

  if (width === null || height === null || width < 1 || height < 1) {
    return null;
  }

  return {
    width,
    height,
    exifOrientation,
  };
};

const parsePngMetadata = (input: Buffer): { width: number; height: number } | null => {
  if (
    input.length < 24 ||
    input[0] !== 0x89 ||
    input[1] !== 0x50 ||
    input[2] !== 0x4e ||
    input[3] !== 0x47
  ) {
    return null;
  }

  const width = input.readUInt32BE(16);
  const height = input.readUInt32BE(20);

  if (width < 1 || height < 1) {
    return null;
  }

  return { width, height };
};

const parseGifMetadata = (input: Buffer): { width: number; height: number } | null => {
  if (input.length < 10) {
    return null;
  }

  const signature = input.subarray(0, 6).toString("ascii");
  if (signature !== "GIF87a" && signature !== "GIF89a") {
    return null;
  }

  const width = input.readUInt16LE(6);
  const height = input.readUInt16LE(8);

  if (width < 1 || height < 1) {
    return null;
  }

  return { width, height };
};

const parseBmpMetadata = (input: Buffer): { width: number; height: number } | null => {
  if (input.length < 26 || input[0] !== 0x42 || input[1] !== 0x4d) {
    return null;
  }

  const width = Math.abs(input.readInt32LE(18));
  const height = Math.abs(input.readInt32LE(22));
  if (width < 1 || height < 1) {
    return null;
  }

  return { width, height };
};

const parseWebpMetadata = (input: Buffer): { width: number; height: number } | null => {
  if (
    input.length < 30 ||
    input.subarray(0, 4).toString("ascii") !== "RIFF" ||
    input.subarray(8, 12).toString("ascii") !== "WEBP"
  ) {
    return null;
  }

  const chunkType = input.subarray(12, 16).toString("ascii");

  if (chunkType === "VP8X" && input.length >= 30) {
    const width = 1 + input[24] + (input[25] << 8) + (input[26] << 16);
    const height = 1 + input[27] + (input[28] << 8) + (input[29] << 16);

    if (width >= 1 && height >= 1) {
      return { width, height };
    }
  }

  if (chunkType === "VP8L" && input.length >= 25 && input[20] === 0x2f) {
    const b0 = input[21];
    const b1 = input[22];
    const b2 = input[23];
    const b3 = input[24];
    const width = 1 + (b0 | ((b1 & 0x3f) << 8));
    const height = 1 + (((b1 & 0xc0) >> 6) | (b2 << 2) | ((b3 & 0x0f) << 10));

    if (width >= 1 && height >= 1) {
      return { width, height };
    }
  }

  if (chunkType === "VP8 " && input.length >= 30) {
    const width = input.readUInt16LE(26) & 0x3fff;
    const height = input.readUInt16LE(28) & 0x3fff;

    if (width >= 1 && height >= 1) {
      return { width, height };
    }
  }

  return null;
};

const parseImageMetadataFromBuffer = (input: Buffer): PhotoMetadata | null => {
  const jpeg = parseJpegMetadata(input);
  if (jpeg) {
    return jpeg;
  }

  const png = parsePngMetadata(input);
  if (png) {
    return { ...png, exifOrientation: null };
  }

  const gif = parseGifMetadata(input);
  if (gif) {
    return { ...gif, exifOrientation: null };
  }

  const webp = parseWebpMetadata(input);
  if (webp) {
    return { ...webp, exifOrientation: null };
  }

  const bmp = parseBmpMetadata(input);
  if (bmp) {
    return { ...bmp, exifOrientation: null };
  }

  return null;
};

const readFileHead = async (absolutePath: string, maxBytes: number): Promise<Buffer> => {
  const handle = await open(absolutePath, "r");

  try {
    const buffer = Buffer.allocUnsafe(maxBytes);
    const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
};

const parseImageMetadata = async (absolutePath: string): Promise<PhotoMetadata | null> => {
  const headBuffer = await readFileHead(absolutePath, IMAGE_METADATA_SCAN_BYTES);
  const headMetadata = parseImageMetadataFromBuffer(headBuffer);
  if (headMetadata) {
    return headMetadata;
  }

  // Fall back to a full read only when header parsing was insufficient.
  const fullBuffer = await readFile(absolutePath);
  if (fullBuffer.length === headBuffer.length) {
    return null;
  }

  return parseImageMetadataFromBuffer(fullBuffer);
};

const toEffectiveDimensions = (
  width: number,
  height: number,
  exifOrientation: number | null,
): { width: number; height: number } => {
  if (exifOrientation !== null && [5, 6, 7, 8].includes(exifOrientation)) {
    return { width: height, height: width };
  }

  return { width, height };
};

const scanFolderTree = async (
  rootPath: string,
): Promise<{ files: string[]; directories: string[] }> => {
  const files: string[] = [];
  const directories: string[] = [];

  const walk = async (directory: string): Promise<void> => {
    directories.push(directory);
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const absolutePath = resolve(directory, entry.name);

      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const extension = extname(entry.name).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(extension)) {
        continue;
      }

      files.push(absolutePath);
    }
  };

  await walk(rootPath);
  return { files, directories };
};

export class PhotosSlideshowService {
  private readonly folderCaches = new Map<string, FolderCache>();
  private readonly photoMetadataCache = new Map<string, PhotoMetadataCacheEntry>();

  constructor(private readonly moduleStateRepository: ModuleStateRepository) {}

  async getNextFrame(input: {
    instanceId: string;
    config: unknown;
    screenSessionId?: string | null;
    requestedCollectionId?: string | null;
    requestedSourceKind?: "set" | "layout" | null;
    collectionsConfig?: unknown;
  }): Promise<PhotosModuleNextResponse> {
    const moduleConfig = photosModuleConfigSchema.parse(input.config);
    const collectionsConfig = photoCollectionsConfigSchema.parse(input.collectionsConfig ?? {});
    const source = resolvePhotoSource({
      moduleConfig,
      requestedCollectionId: input.requestedCollectionId ?? null,
      requestedSourceKind: input.requestedSourceKind ?? null,
      collectionsConfig,
    });
    const screenSessionId = normalizeScreenSessionId(input.screenSessionId);
    const playbackStateKey = toPlaybackStateKey(
      source.sourceKey,
      moduleConfig.shuffle,
      screenSessionId,
    );
    const orientationStateKey = toOrientationStateKey(source.sourceKey, screenSessionId);
    const photos = await this.getPhotosForFolders(source.folders);

    if (photos.length === 0) {
      const orientationState = this.readOrientationState(orientationStateKey);
      this.writeState(playbackStateKey, {
        ...this.readState(playbackStateKey),
        currentPhotoId: null,
      });

      return photosModuleNextResponseSchema.parse({
        generatedAt: new Date().toISOString(),
        frame: null,
        stableOrientation: orientationState.stableOrientation,
        warning: `No supported images found in ${source.sourceLabel}.`,
      });
    }

    const nowMs = Date.now();
    const previousState = this.readState(playbackStateKey);
    const previousOrientationState = this.readOrientationState(orientationStateKey);
    const photoById = new Map(photos.map((photo) => [photo.id, photo]));
    const availableIds = photos.map((photo) => photo.id);
    const availableIdSet = new Set(availableIds);
    const previousOrder = previousState.photoOrder.filter((photoId) => availableIdSet.has(photoId));
    const hasFullCoverage = previousOrder.length === availableIds.length;
    const orderedIds =
      moduleConfig.shuffle !== previousState.shuffle || !hasFullCoverage
        ? moduleConfig.shuffle
          ? shuffleArray(availableIds)
          : availableIds
        : moduleConfig.shuffle
          ? previousOrder
          : availableIds;

    const previousPhoto = previousState.currentPhotoId
      ? (photoById.get(previousState.currentPhotoId) ?? null)
      : null;
    const previousIndex = previousPhoto ? orderedIds.indexOf(previousPhoto.id) : -1;
    const frameIntervalMs = Math.max(3, moduleConfig.intervalSeconds) * 1000;
    const shouldAdvance =
      previousIndex < 0 ||
      moduleConfig.shuffle !== previousState.shuffle ||
      !hasFullCoverage ||
      previousState.lastFrameAdvancedAtMs <= 0 ||
      nowMs - previousState.lastFrameAdvancedAtMs >= frameIntervalMs;
    const selectedPhoto = shouldAdvance
      ? (photoById.get(orderedIds[(previousIndex + 1 + orderedIds.length) % orderedIds.length]) ??
        photos[0])
      : (previousPhoto ?? photos[0]);

    let stableOrientation = previousOrientationState.stableOrientation;
    let lastOrientationChangeAtMs = previousOrientationState.lastOrientationChangeAtMs;
    if (!stableOrientation) {
      stableOrientation = selectedPhoto.orientation;
      lastOrientationChangeAtMs = nowMs;
    } else if (stableOrientation !== selectedPhoto.orientation) {
      if (nowMs - lastOrientationChangeAtMs >= ORIENTATION_DEBOUNCE_MS) {
        stableOrientation = selectedPhoto.orientation;
        lastOrientationChangeAtMs = nowMs;
      }
    }

    this.writeState(playbackStateKey, {
      currentPhotoId: selectedPhoto.id,
      photoOrder: orderedIds,
      shuffle: moduleConfig.shuffle,
      lastFrameAdvancedAtMs: shouldAdvance ? nowMs : previousState.lastFrameAdvancedAtMs,
      stableOrientation,
      lastOrientationChangeAtMs,
    });
    this.writeOrientationState(orientationStateKey, {
      stableOrientation,
      lastOrientationChangeAtMs,
    });

    return photosModuleNextResponseSchema.parse({
      generatedAt: new Date().toISOString(),
      frame: {
        imageId: selectedPhoto.id,
        imageUrl: this.getImageUrl(
          input.instanceId,
          selectedPhoto.id,
          source.collectionId,
          source.sourceKind,
        ),
        filename: selectedPhoto.filename,
        width: selectedPhoto.width,
        height: selectedPhoto.height,
        orientation: selectedPhoto.orientation,
      },
      stableOrientation,
      warning: null,
    });
  }

  async resolveImagePathFromToken(input: {
    moduleConfig: PhotosModuleConfig;
    token: string;
    requestedCollectionId?: string | null;
    requestedSourceKind?: "set" | "layout" | null;
    collectionsConfig?: unknown;
  }): Promise<string | null> {
    const collectionsConfig = photoCollectionsConfigSchema.parse(input.collectionsConfig ?? {});
    const source = resolvePhotoSource({
      moduleConfig: input.moduleConfig,
      requestedCollectionId: input.requestedCollectionId ?? null,
      requestedSourceKind: input.requestedSourceKind ?? null,
      collectionsConfig,
    });
    const photos = await this.getPhotosForFolders(source.folders);
    const photoFromId = photos.find((photo) => photo.id === input.token);
    const candidatePath = photoFromId?.absolutePath ?? this.decodeImageToken(input.token);

    if (!candidatePath || !source.folders.some((folder) => pathIsWithin(folder, candidatePath))) {
      return null;
    }

    if (!IMAGE_EXTENSIONS.has(extname(candidatePath).toLowerCase())) {
      return null;
    }

    try {
      await access(candidatePath);
      return candidatePath;
    } catch {
      return null;
    }
  }

  private decodeImageToken(token: string): string | null {
    try {
      const decodedPath = Buffer.from(token, "base64url").toString("utf8");
      if (!decodedPath) {
        return null;
      }

      return resolve(decodedPath);
    } catch {
      return null;
    }
  }

  private getImageUrl(
    instanceId: string,
    imageId: string,
    collectionId: string | null,
    sourceKind: "set" | "layout" | null,
  ): string {
    const token = imageId;
    const queryParams = new URLSearchParams();
    if (collectionId) {
      queryParams.set("collectionId", collectionId);
    }
    if (sourceKind) {
      queryParams.set("sourceKind", sourceKind);
    }
    const query = queryParams.toString();
    const suffix = query.length > 0 ? `?${query}` : "";
    return `/api/modules/photos/${encodeURIComponent(instanceId)}/image/${encodeURIComponent(token)}${suffix}`;
  }

  private async getPhotosForFolders(folderPaths: string[]): Promise<PhotoAsset[]> {
    const merged = new Map<string, PhotoAsset>();

    for (const folderPath of folderPaths) {
      const cache = await this.getFolderCache(folderPath);
      for (const photo of cache.photos) {
        if (!merged.has(photo.id)) {
          merged.set(photo.id, photo);
        }
      }
    }

    return [...merged.values()].sort(
      (left, right) =>
        left.filename.localeCompare(right.filename) ||
        left.absolutePath.localeCompare(right.absolutePath),
    );
  }

  private readState(stateKey: string): PhotoModuleState {
    const rawState = this.moduleStateRepository.getState<unknown>(stateKey);
    const parsedState = photoModuleStateSchema.safeParse(rawState);
    return parsedState.success ? parsedState.data : photoModuleStateSchema.parse({});
  }

  private writeState(stateKey: string, state: PhotoModuleState): void {
    this.moduleStateRepository.setState(stateKey, state);
  }

  private readOrientationState(stateKey: string): PhotoOrientationState {
    const rawState = this.moduleStateRepository.getState<unknown>(stateKey);
    const parsedState = photoOrientationStateSchema.safeParse(rawState);
    return parsedState.success ? parsedState.data : photoOrientationStateSchema.parse({});
  }

  private writeOrientationState(stateKey: string, state: PhotoOrientationState): void {
    this.moduleStateRepository.setState(stateKey, photoOrientationStateSchema.parse(state));
  }

  private async getFolderCache(folderPath: string): Promise<FolderCache> {
    const nowMs = Date.now();
    const existing =
      this.folderCaches.get(folderPath) ??
      ({
        loadedAtMs: 0,
        dirty: true,
        photos: [],
        watchers: new Map(),
      } satisfies FolderCache);

    if (
      existing.dirty ||
      nowMs - existing.loadedAtMs >= FOLDER_RESCAN_INTERVAL_MS ||
      existing.loadedAtMs === 0
    ) {
      await this.refreshFolderCache(folderPath, existing);
    }

    this.folderCaches.set(folderPath, existing);
    return existing;
  }

  private async refreshFolderCache(folderPath: string, cache: FolderCache): Promise<void> {
    let scanResult: { files: string[]; directories: string[] };
    try {
      scanResult = await scanFolderTree(folderPath);
    } catch {
      cache.photos = [];
      cache.loadedAtMs = Date.now();
      cache.dirty = false;
      for (const watcher of cache.watchers.values()) {
        watcher.close();
      }
      cache.watchers.clear();
      return;
    }

    const assets = await Promise.all(
      scanResult.files.map(async (absolutePath): Promise<PhotoAsset | null> => {
        try {
          const fileStat = await stat(absolutePath);
          const parsedMetadata = await this.getPhotoMetadata(
            absolutePath,
            fileStat.mtimeMs,
            fileStat.size,
          );

          if (!parsedMetadata) {
            return null;
          }

          const effective = toEffectiveDimensions(
            parsedMetadata.width,
            parsedMetadata.height,
            parsedMetadata.exifOrientation,
          );

          if (effective.width < 1 || effective.height < 1) {
            return null;
          }

          const id = createHash("sha1")
            .update(`${absolutePath}:${fileStat.mtimeMs}:${fileStat.size}`)
            .digest("hex");

          return {
            id,
            absolutePath,
            filename: basename(absolutePath),
            width: effective.width,
            height: effective.height,
            orientation: getOrientationFromDimensions(effective.width, effective.height),
          };
        } catch {
          return null;
        }
      }),
    );

    this.prunePhotoMetadataCache(new Set(scanResult.files));

    cache.photos = assets
      .filter((asset): asset is PhotoAsset => asset !== null)
      .sort((left, right) => left.filename.localeCompare(right.filename));
    cache.loadedAtMs = Date.now();
    cache.dirty = false;

    const watchedDirectories = scanResult.directories.slice(0, MAX_WATCH_DIRECTORIES);
    const nextDirectories = new Set(watchedDirectories);

    for (const [directoryPath, watcher] of cache.watchers) {
      if (nextDirectories.has(directoryPath)) {
        continue;
      }

      watcher.close();
      cache.watchers.delete(directoryPath);
    }

    for (const directoryPath of nextDirectories) {
      if (cache.watchers.has(directoryPath)) {
        continue;
      }

      try {
        const watcher = watch(directoryPath, () => {
          cache.dirty = true;
        });
        watcher.on("error", () => {
          cache.dirty = true;
          watcher.close();
          cache.watchers.delete(directoryPath);
        });
        cache.watchers.set(directoryPath, watcher);
      } catch {
        // Ignore watcher errors and rely on periodic rescans.
      }
    }
  }

  private async getPhotoMetadata(
    absolutePath: string,
    mtimeMs: number,
    size: number,
  ): Promise<PhotoMetadata | null> {
    const cached = this.photoMetadataCache.get(absolutePath);
    if (cached && cached.mtimeMs === mtimeMs && cached.size === size) {
      return cached.metadata;
    }

    const metadata = await parseImageMetadata(absolutePath);
    this.photoMetadataCache.set(absolutePath, {
      mtimeMs,
      size,
      metadata,
    });

    return metadata;
  }

  private prunePhotoMetadataCache(validFiles: Set<string>): void {
    for (const cachedPath of this.photoMetadataCache.keys()) {
      if (!validFiles.has(cachedPath)) {
        this.photoMetadataCache.delete(cachedPath);
      }
    }
  }
}
