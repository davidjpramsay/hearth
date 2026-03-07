import { z } from "zod";

export const photosOrientationSchema = z.enum(["portrait", "landscape", "square"]);
export const photosLayoutOrientationSchema = z.enum(["landscape", "portrait"]);
export const photosRequestSourceKindSchema = z.enum(["set", "layout"]);
export const photoCollectionIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9-]*$/);
export const photoCollectionNameSchema = z.string().trim().min(1).max(80);
export const photoCollectionFolderSchema = z.string().trim().min(1).max(255);

export const photoCollectionSchema = z.object({
  id: photoCollectionIdSchema,
  name: photoCollectionNameSchema,
  folders: z.array(photoCollectionFolderSchema).min(1).max(64),
});

export const photoCollectionsConfigSchema = z
  .object({
    collections: z.array(photoCollectionSchema).max(128).default([]),
  })
  .superRefine((value, context) => {
    const usedIds = new Set<string>();
    for (let index = 0; index < value.collections.length; index += 1) {
      const entry = value.collections[index];
      const idKey = entry.id.toLowerCase();
      if (!usedIds.has(idKey)) {
        usedIds.add(idKey);
        continue;
      }
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["collections", index, "id"],
        message: "Collection ids must be unique.",
      });
    }
  });

export const photosModuleConfigSchema = z.object({
  folderPath: z.string().trim().min(1).max(2048).default("/photos"),
  collectionId: photoCollectionIdSchema.nullable().default(null),
  intervalSeconds: z.number().int().min(3).max(3600).default(20),
  shuffle: z.boolean().default(true),
  layoutOrientation: photosLayoutOrientationSchema.default("landscape"),
});

export const photosModuleFrameSchema = z.object({
  imageId: z.string().min(1),
  imageUrl: z.string().min(1),
  filename: z.string().min(1),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
  orientation: photosOrientationSchema,
});

export const photosModuleNextResponseSchema = z.object({
  generatedAt: z.string().datetime({ offset: true }),
  frame: photosModuleFrameSchema.nullable(),
  stableOrientation: photosOrientationSchema.nullable(),
  warning: z.string().nullable().default(null),
});

export const photosModuleParamsSchema = z.object({
  instanceId: z.string().min(1),
});

export const photosModuleNextQuerySchema = z.object({
  screenSessionId: z.string().trim().min(1).max(128).optional(),
  collectionId: photoCollectionIdSchema.optional(),
  sourceKind: photosRequestSourceKindSchema.optional(),
});

export const photosImageParamsSchema = z.object({
  instanceId: z.string().min(1),
  token: z.string().min(1),
});

export const photosImageQuerySchema = z.object({
  collectionId: photoCollectionIdSchema.optional(),
  sourceKind: photosRequestSourceKindSchema.optional(),
});

export type PhotosOrientation = z.infer<typeof photosOrientationSchema>;
export type PhotosLayoutOrientation = z.infer<typeof photosLayoutOrientationSchema>;
export type PhotosRequestSourceKind = z.infer<typeof photosRequestSourceKindSchema>;
export type PhotoCollectionId = z.infer<typeof photoCollectionIdSchema>;
export type PhotoCollectionName = z.infer<typeof photoCollectionNameSchema>;
export type PhotoCollection = z.infer<typeof photoCollectionSchema>;
export type PhotoCollectionsConfig = z.infer<typeof photoCollectionsConfigSchema>;
export type PhotosModuleConfig = z.infer<typeof photosModuleConfigSchema>;
export type PhotosModuleFrame = z.infer<typeof photosModuleFrameSchema>;
export type PhotosModuleNextResponse = z.infer<typeof photosModuleNextResponseSchema>;
export type PhotosModuleParams = z.infer<typeof photosModuleParamsSchema>;
export type PhotosModuleNextQuery = z.infer<typeof photosModuleNextQuerySchema>;
export type PhotosImageParams = z.infer<typeof photosImageParamsSchema>;
export type PhotosImageQuery = z.infer<typeof photosImageQuerySchema>;
