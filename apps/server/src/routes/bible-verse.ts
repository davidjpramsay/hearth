import {
  bibleVerseModuleConfigSchema,
  bibleVerseModuleParamsSchema,
  bibleVerseModuleResponseSchema,
  getDayOfYearInTimeZone,
} from "@hearth/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import type { AppServices } from "../types.js";

const DAILY_PASSAGE_REFERENCES = [
  "john 3:16",
  "psalm 23:1",
  "proverbs 3:5-6",
  "romans 8:28",
  "philippians 4:6-7",
  "isaiah 41:10",
  "joshua 1:9",
  "matthew 11:28-30",
  "2 corinthians 5:7",
  "galatians 5:22-23",
  "james 1:5",
  "1 peter 5:7",
  "hebrews 11:1",
  "matthew 6:33",
  "psalm 46:1",
  "deuteronomy 31:6",
  "romans 12:2",
  "john 14:27",
  "1 corinthians 13:4-7",
  "2 timothy 1:7",
  "ephesians 2:8-9",
  "psalm 91:1-2",
  "luke 1:37",
  "matthew 5:14-16",
  "colossians 3:23",
  "romans 15:13",
  "psalm 119:105",
  "john 8:12",
  "acts 1:8",
  "micah 6:8",
  "proverbs 16:9",
  "1 john 4:19",
];

const ESV_PASSAGE_RESPONSE_SCHEMA = z.object({
  canonical: z.string().optional(),
  passages: z.array(z.string().min(1)).min(1),
});

export const selectDailyPassageReference = (date: Date, siteTimezone: string): string => {
  const index = getDayOfYearInTimeZone(date, siteTimezone) % DAILY_PASSAGE_REFERENCES.length;
  return DAILY_PASSAGE_REFERENCES[index] ?? "john 3:16";
};

const fetchVerseOfDay = async (siteTimezone: string) => {
  const reference = selectDailyPassageReference(new Date(), siteTimezone);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const url =
      `https://api.esv.org/v3/passage/text/?q=${encodeURIComponent(reference)}` +
      "&include-passage-references=false" +
      "&include-verse-numbers=false" +
      "&include-first-verse-numbers=false" +
      "&include-footnotes=false" +
      "&include-footnote-body=false" +
      "&include-headings=false" +
      "&include-short-copyright=false" +
      "&include-copyright=false";
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        Authorization: `Token ${config.esvApiKey}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error("Invalid or unauthorized ESV API key");
      }
      throw new Error(`Request failed (${response.status})`);
    }

    const parsed = ESV_PASSAGE_RESPONSE_SCHEMA.parse(await response.json());
    const firstPassage = parsed.passages[0]?.replace(/\s+/g, " ").trim() ?? "";
    if (!firstPassage) {
      throw new Error("No verse returned from ESV provider");
    }

    return {
      reference: parsed.canonical?.trim() || reference,
      text: firstPassage,
    };
  } finally {
    clearTimeout(timeout);
  }
};

const readActiveConfig = (
  services: AppServices,
  instanceId: string,
): {
  config: ReturnType<typeof bibleVerseModuleConfigSchema.parse>;
} | null => {
  const instance = services.layoutRepository.findModuleInstance(instanceId, "bible-verse");
  if (!instance) {
    return null;
  }

  const parsedConfig = bibleVerseModuleConfigSchema.safeParse(instance.module.config);
  const normalizedConfig = parsedConfig.success
    ? parsedConfig.data
    : bibleVerseModuleConfigSchema.parse({});

  return {
    config: normalizedConfig,
  };
};

export const registerBibleVerseRoutes = (app: FastifyInstance, services: AppServices): void => {
  app.get("/modules/bible-verse/:instanceId/today", async (request, reply) => {
    const params = bibleVerseModuleParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: params.error.message });
    }

    const activeConfig = readActiveConfig(services, params.data.instanceId);
    if (!activeConfig) {
      return reply.code(404).send({ message: "Bible verse module instance not found" });
    }

    const siteTimeConfig = services.settingsRepository.getSiteTimeConfig();
    reply.header("cache-control", "no-store");
    const generatedAt = new Date().toISOString();
    const basePayload = {
      generatedAt,
      verse: null,
      reference: null,
      sourceLabel: "api.esv.org (ESV)",
      warning: null,
    };

    if (!config.esvApiKey) {
      return reply.send(
        bibleVerseModuleResponseSchema.parse({
          ...basePayload,
          warning: "ESV API key is not configured on the server.",
        }),
      );
    }

    try {
      const verse = await fetchVerseOfDay(siteTimeConfig.siteTimezone);
      const cleanedText = verse.text.replace(/\s+/g, " ").trim();
      const reference = verse.reference;

      return reply.send(
        bibleVerseModuleResponseSchema.parse({
          generatedAt,
          verse: cleanedText,
          reference,
          sourceLabel: "api.esv.org (ESV)",
          warning: null,
        }),
      );
    } catch (error) {
      request.log.warn(
        {
          err: error,
          instanceId: params.data.instanceId,
        },
        "Failed to load bible verse of the day",
      );

      return reply.send(
        bibleVerseModuleResponseSchema.parse({
          ...basePayload,
          warning: "Verse provider is currently unavailable.",
        }),
      );
    }
  });
};
