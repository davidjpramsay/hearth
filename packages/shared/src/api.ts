import { z } from "zod";
import { layoutConfigSchema, layoutRecordSchema } from "./layout.js";
import {
  photoCollectionFolderSchema,
  photoCollectionsConfigSchema,
} from "./modules/photos.js";

export const loginRequestSchema = z.object({
  password: z.string().min(4).max(128),
});

export const loginResponseSchema = z.object({
  token: z.string().min(1),
});

export const createLayoutRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
  config: layoutConfigSchema.optional(),
});

export const updateLayoutRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    config: layoutConfigSchema.optional(),
  })
  .refine((value) => value.name !== undefined || value.config !== undefined, {
    message: "At least one field is required",
  });

export const layoutsQuerySchema = z.object({
  activeOnly: z
    .preprocess((value) => {
      if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (normalized === "true") {
          return true;
        }
        if (normalized === "false") {
          return false;
        }
      }
      return value;
    }, z.boolean())
    .optional()
    .default(false),
});

export const layoutsResponseSchema = z.array(layoutRecordSchema);
export const layoutResponseSchema = layoutRecordSchema;
export const photoCollectionsResponseSchema = photoCollectionsConfigSchema;
export const photoLibraryFoldersResponseSchema = z.object({
  folders: z.array(photoCollectionFolderSchema).max(4096).default([]),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type CreateLayoutRequest = z.infer<typeof createLayoutRequestSchema>;
export type UpdateLayoutRequest = z.infer<typeof updateLayoutRequestSchema>;
export type LayoutsQuery = z.infer<typeof layoutsQuerySchema>;
export type PhotoCollectionsResponse = z.infer<typeof photoCollectionsResponseSchema>;
export type PhotoLibraryFoldersResponse = z.infer<
  typeof photoLibraryFoldersResponseSchema
>;
