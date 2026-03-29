import { z } from "zod";

export const serverStatusResponseSchema = z.object({
  ok: z.boolean(),
  service: z.string(),
  uptimeSeconds: z.number().nonnegative(),
  timestamp: z.string(),
  processStartedAt: z.string(),
  memory: z.object({
    rss: z.number().nonnegative(),
    heapUsed: z.number().nonnegative(),
    heapTotal: z.number().nonnegative(),
  }),
  host: z.object({
    hostname: z.string(),
    platform: z.string(),
  }),
  time: z
    .object({
      runtimeTimeZone: z.string(),
      defaultSiteTimeZone: z.string().nullable(),
    })
    .optional(),
  build: z.object({
    serverEntrySha1: z.string().nullable(),
    serverEntryBuiltAt: z.string().nullable(),
    webIndexSha1: z.string().nullable(),
    webIndexBuiltAt: z.string().nullable(),
    webMainScript: z.string().nullable(),
    webMainStylesheet: z.string().nullable(),
  }),
});

export type ServerStatusResponse = z.infer<typeof serverStatusResponseSchema>;

export const getServerStatus = async (): Promise<ServerStatusResponse> => {
  const response = await fetch("/api/modules/server-status", {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(`Server status request failed (${response.status})`);
  }

  return serverStatusResponseSchema.parse(await response.json());
};
