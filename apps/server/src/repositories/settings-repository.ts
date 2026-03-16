import type Database from "better-sqlite3";
import {
  choresPayoutConfigSchema,
  createLayoutSetLogicGraphFromBranches,
  deriveLayoutSetAuthoringFromLogicGraph,
  getRuntimeTimeZone,
  getLayoutSetLogicBranches,
  normalizeScreenProfileLayoutsConfig,
  photoCollectionsConfigSchema,
  screenProfileLayoutsSchema,
  siteTimeConfigSchema,
  toAutoLayoutTargetsFromLogicGraph,
  DEFAULT_LANDSCAPE_LAYOUT_LOGIC_CONDITION_TYPE,
  DEFAULT_LAYOUT_LOGIC_ACTION_TYPE,
  DEFAULT_LAYOUT_LOGIC_PHOTO_ACTION_TYPE,
  DEFAULT_PORTRAIT_LAYOUT_LOGIC_CONDITION_TYPE,
  type AutoLayoutTarget,
  type ChoresPayoutConfig,
  type PhotoCollectionsConfig,
  type SiteTimeConfig,
  type ScreenProfileLayouts,
} from "@hearth/shared";
import { z } from "zod";

const ADMIN_PASSWORD_KEY = "admin_password_hash";
const CHORES_PAYOUT_CONFIG_KEY = "chores_payout_config";
const SITE_TIME_CONFIG_KEY = "site_time_config";
const SCREEN_PROFILE_LAYOUTS_KEY = "screen_profile_layouts";
const PHOTO_COLLECTIONS_KEY = "photo_collections";
const DEFAULT_TARGET_CYCLE_SECONDS = 20;
const DEFAULT_PHOTO_ACTION_TYPE = DEFAULT_LAYOUT_LOGIC_PHOTO_ACTION_TYPE;
const DEFAULT_SET_ID = "set-1";
const DEFAULT_SET_NAME = "Layout set 1";
const LEGACY_SET_ID_TO_NEUTRAL_ID: Record<string, string> = {
  widescreen: "set-1",
  standard: "set-2",
  tall: "set-3",
};
const LEGACY_SET_NAMES = new Set(["Widescreen set", "Standard set", "Tall set"]);

const legacyScreenProfileLayoutNamesSchema = z.object({
  portraitLayoutName: z.string().trim().min(1).max(80).nullable().optional(),
  landscapeLayoutName: z.string().trim().min(1).max(80).nullable().optional(),
  ultrawideLayoutName: z.string().trim().min(1).max(80).nullable().optional(),
  photoPortraitLayoutName: z.string().trim().min(1).max(80).nullable().optional(),
  photoLandscapeLayoutName: z.string().trim().min(1).max(80).nullable().optional(),
});

const legacyScreenProfileLayoutsSchema = z.object({
  portraitLayoutId: z.number().int().positive().nullable().optional(),
  landscapeLayoutId: z.number().int().positive().nullable().optional(),
  ultrawideLayoutId: z.number().int().positive().nullable().optional(),
  photoPortraitLayoutId: z.number().int().positive().nullable().optional(),
  photoLandscapeLayoutId: z.number().int().positive().nullable().optional(),
});

const clampCycleSeconds = (value: number): number =>
  Math.max(3, Math.min(3600, Math.round(value)));

const toRule = (
  layoutName: string,
  trigger: AutoLayoutTarget["trigger"],
  cycleSeconds = DEFAULT_TARGET_CYCLE_SECONDS,
): AutoLayoutTarget => ({
  layoutName,
  trigger,
  cycleSeconds: clampCycleSeconds(cycleSeconds),
  actionType: DEFAULT_LAYOUT_LOGIC_ACTION_TYPE,
  actionParams: {},
  conditionType:
    trigger === "portrait-photo"
      ? DEFAULT_PORTRAIT_LAYOUT_LOGIC_CONDITION_TYPE
      : trigger === "landscape-photo"
        ? DEFAULT_LANDSCAPE_LAYOUT_LOGIC_CONDITION_TYPE
        : null,
  conditionParams: {},
});

export class SettingsRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly options: { defaultSiteTimeZone?: string | null } = {},
  ) {}

  private getDefaultSiteTimeZone(): string {
    const configuredTimeZone = this.options.defaultSiteTimeZone?.trim() ?? "";
    const parsedConfiguredTimeZone = siteTimeConfigSchema.shape.siteTimezone.safeParse(
      configuredTimeZone,
    );
    if (parsedConfiguredTimeZone.success) {
      return parsedConfiguredTimeZone.data;
    }

    return getRuntimeTimeZone();
  }

  private toNeutralSetId(
    setId: string,
    fallbackIndex: number,
    usedIds: Set<string>,
  ): string {
    const legacyMapped = LEGACY_SET_ID_TO_NEUTRAL_ID[setId];
    const slug = setId
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const baseId = (legacyMapped ?? (slug.length > 0 ? slug : `set-${fallbackIndex}`)).slice(
      0,
      80,
    );

    if (!usedIds.has(baseId)) {
      usedIds.add(baseId);
      return baseId;
    }

    let suffix = 2;
    while (suffix < 1000) {
      const candidate = `${baseId}-${suffix}`.slice(0, 80);
      if (!usedIds.has(candidate)) {
        usedIds.add(candidate);
        return candidate;
      }
      suffix += 1;
    }

    const fallbackId = `set-${Date.now().toString(36)}`.slice(0, 80);
    usedIds.add(fallbackId);
    return fallbackId;
  }

  private resolveSetName(currentName: string, fallbackIndex: number): string {
    const trimmed = currentName.trim();
    if (
      trimmed.length > 0 &&
      trimmed !== "Layout set" &&
      !LEGACY_SET_NAMES.has(trimmed)
    ) {
      return trimmed.slice(0, 80);
    }

    return `Layout set ${Math.max(1, fallbackIndex)}`.slice(0, 80);
  }

  private listLayoutNames(): Set<string> {
    const rows = this.db
      .prepare<[], { name: string }>("SELECT name FROM layouts")
      .all();
    return new Set(rows.map((row) => row.name));
  }

  private getPreferredLayoutName(): string | null {
    const row = this.db
      .prepare<[], { name: string }>(
        "SELECT name FROM layouts ORDER BY active DESC, id ASC LIMIT 1",
      )
      .get();
    return row?.name ?? null;
  }

  private areLayoutsEqual(left: ScreenProfileLayouts, right: ScreenProfileLayouts): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  private normalizeScreenProfileLayouts(input: ScreenProfileLayouts): ScreenProfileLayouts {
    return normalizeScreenProfileLayoutsConfig({
      input,
      knownLayoutNames: this.listLayoutNames(),
      fallbackStaticLayoutName: this.getPreferredLayoutName(),
      resolveSetId: ({ sourceSetId, index, usedSetIds }) =>
        this.toNeutralSetId(sourceSetId, index, usedSetIds),
      resolveSetName: ({ sourceName, index }) =>
        this.resolveSetName(sourceName, index),
      defaultSetId: DEFAULT_SET_ID,
      defaultSetName: DEFAULT_SET_NAME,
      defaultPhotoActionType: DEFAULT_PHOTO_ACTION_TYPE,
    });
  }

  private toFamilyRoutingFromLegacyNames(input: {
    portraitLayoutName?: string | null;
    landscapeLayoutName?: string | null;
    ultrawideLayoutName?: string | null;
    photoPortraitLayoutName?: string | null;
    photoLandscapeLayoutName?: string | null;
  }): ScreenProfileLayouts {
    const toLegacySet = (
      setIndex: number,
      staticLayoutName: string | null,
      photoPortraitLayoutName: string | null,
      photoLandscapeLayoutName: string | null,
    ) => {
      const logicGraph = createLayoutSetLogicGraphFromBranches({
        alwaysRules: staticLayoutName ? [toRule(staticLayoutName, "always")] : [],
        portraitRules: photoPortraitLayoutName
          ? [toRule(photoPortraitLayoutName, "portrait-photo")]
          : [],
        landscapeRules: photoLandscapeLayoutName
          ? [toRule(photoLandscapeLayoutName, "landscape-photo")]
          : [],
      });
      const autoLayoutTargets = toAutoLayoutTargetsFromLogicGraph(logicGraph);
      const branches = getLayoutSetLogicBranches(logicGraph);
      const logicBlocks = deriveLayoutSetAuthoringFromLogicGraph({
        logicGraph,
        photoActionType: DEFAULT_PHOTO_ACTION_TYPE,
        photoActionCollectionId: null,
      });

      return {
        name: `Layout set ${setIndex}`,
        staticLayoutName,
        defaultPhotoCollectionId: null,
        photoActionCollectionId: null,
        photoActionType: DEFAULT_PHOTO_ACTION_TYPE,
        logicBlocks,
        logicGraph,
        logicNodePositions: {},
        logicEdgeOverrides: {},
        logicDisconnectedEdgeIds: [],
        autoLayoutTargets,
        portraitPhotoLayoutName:
          branches.portraitRules[0]?.layoutName ??
          branches.alwaysRules[0]?.layoutName ??
          null,
        landscapePhotoLayoutName:
          branches.landscapeRules[0]?.layoutName ??
          branches.alwaysRules[0]?.layoutName ??
          null,
        portraitPhotoLayoutNames: [
          ...branches.alwaysRules,
          ...branches.portraitRules,
        ].map((rule) => rule.layoutName),
        landscapePhotoLayoutNames: [
          ...branches.alwaysRules,
          ...branches.landscapeRules,
        ].map((rule) => rule.layoutName),
      };
    };

    const candidateSets = [
      {
        setIndex: 1,
        staticLayoutName: input.ultrawideLayoutName ?? input.landscapeLayoutName ?? null,
      },
      {
        setIndex: 2,
        staticLayoutName: input.landscapeLayoutName ?? input.portraitLayoutName ?? null,
      },
      {
        setIndex: 3,
        staticLayoutName: input.portraitLayoutName ?? input.landscapeLayoutName ?? null,
      },
    ] as const;
    const families: ScreenProfileLayouts["families"] = {};

    for (const candidate of candidateSets) {
      const hasAnyLayout =
        candidate.staticLayoutName ||
        input.photoPortraitLayoutName ||
        input.photoLandscapeLayoutName;
      if (!hasAnyLayout) {
        continue;
      }

      const setId = `set-${candidate.setIndex}`;
      families[setId] = toLegacySet(
        candidate.setIndex,
        candidate.staticLayoutName,
        input.photoPortraitLayoutName ?? null,
        input.photoLandscapeLayoutName ?? null,
      );
    }

    if (Object.keys(families).length === 0) {
      families[DEFAULT_SET_ID] = toLegacySet(1, null, null, null);
    }

    return screenProfileLayoutsSchema.parse({
      switchMode: "auto",
      families,
    });
  }

  private getLayoutNameById(id: number | null | undefined): string | null {
    if (!id) {
      return null;
    }

    const row = this.db
      .prepare<{ id: number }, { name: string }>("SELECT name FROM layouts WHERE id = @id")
      .get({ id });

    return row?.name ?? null;
  }

  private getValue(key: string): string | null {
    const row = this.db
      .prepare<{ key: string }, { value: string }>(
        "SELECT value FROM settings WHERE key = @key",
      )
      .get({ key });

    return row?.value ?? null;
  }

  private setValue(key: string, value: string): void {
    this.db
      .prepare(
        `
        INSERT INTO settings (key, value, updated_at)
        VALUES (@key, @value, CURRENT_TIMESTAMP)
        ON CONFLICT(key)
        DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
        `,
      )
      .run({ key, value });
  }

  private getLegacySiteTimezoneFromChoresConfig(): string | null {
    const rawValue = this.getValue(CHORES_PAYOUT_CONFIG_KEY);
    if (!rawValue) {
      return null;
    }

    try {
      const parsedValue = JSON.parse(rawValue);
      const rawTimezone =
        typeof parsedValue?.siteTimezone === "string" ? parsedValue.siteTimezone : null;
      if (!rawTimezone) {
        return null;
      }

      const parsedTimezone = siteTimeConfigSchema.shape.siteTimezone.safeParse(rawTimezone);
      return parsedTimezone.success ? parsedTimezone.data : null;
    } catch {
      return null;
    }
  }

  getAdminPasswordHash(): string | null {
    return this.getValue(ADMIN_PASSWORD_KEY);
  }

  setAdminPasswordHash(hash: string): void {
    this.setValue(ADMIN_PASSWORD_KEY, hash);
  }

  getSiteTimeConfig(): SiteTimeConfig {
    const fallbackTimezone =
      this.getLegacySiteTimezoneFromChoresConfig() ?? this.getDefaultSiteTimeZone();
    const rawValue = this.getValue(SITE_TIME_CONFIG_KEY);
    if (!rawValue) {
      return siteTimeConfigSchema.parse({
        siteTimezone: fallbackTimezone,
      });
    }

    try {
      const parsedValue = JSON.parse(rawValue);
      return siteTimeConfigSchema.parse({
        ...parsedValue,
        siteTimezone:
          typeof parsedValue?.siteTimezone === "string"
            ? parsedValue.siteTimezone
            : fallbackTimezone,
      });
    } catch {
      return siteTimeConfigSchema.parse({
        siteTimezone: fallbackTimezone,
      });
    }
  }

  setSiteTimeConfig(config: SiteTimeConfig): void {
    this.setValue(
      SITE_TIME_CONFIG_KEY,
      JSON.stringify(
        siteTimeConfigSchema.parse({
          ...config,
          siteTimezone: config.siteTimezone || this.getDefaultSiteTimeZone(),
        }),
      ),
    );
  }

  getChoresPayoutConfig(): ChoresPayoutConfig {
    const defaultTimeZone = this.getSiteTimeConfig().siteTimezone;
    const rawValue = this.getValue(CHORES_PAYOUT_CONFIG_KEY);
    if (!rawValue) {
      return choresPayoutConfigSchema.parse({
        siteTimezone: defaultTimeZone,
      });
    }

    try {
      const parsedValue = JSON.parse(rawValue);
      return choresPayoutConfigSchema.parse({
        ...parsedValue,
        siteTimezone: defaultTimeZone,
      });
    } catch {
      return choresPayoutConfigSchema.parse({
        siteTimezone: defaultTimeZone,
      });
    }
  }

  setChoresPayoutConfig(config: ChoresPayoutConfig): void {
    const siteTimezone = siteTimeConfigSchema.shape.siteTimezone.parse(
      config.siteTimezone || this.getDefaultSiteTimeZone(),
    );
    this.setSiteTimeConfig({
      siteTimezone,
    });
    this.setValue(
      CHORES_PAYOUT_CONFIG_KEY,
      JSON.stringify(
        choresPayoutConfigSchema.parse({
          ...config,
          siteTimezone,
        }),
      ),
    );
  }

  getScreenProfileLayouts(): ScreenProfileLayouts {
    const rawValue = this.getValue(SCREEN_PROFILE_LAYOUTS_KEY);
    if (!rawValue) {
      return this.normalizeScreenProfileLayouts(screenProfileLayoutsSchema.parse({}));
    }

    try {
      const parsedJson = JSON.parse(rawValue);
      const current = screenProfileLayoutsSchema.safeParse(parsedJson);
      if (current.success) {
        const normalizedCurrent = this.normalizeScreenProfileLayouts(current.data);
        if (!this.areLayoutsEqual(current.data, normalizedCurrent)) {
          this.setValue(
            SCREEN_PROFILE_LAYOUTS_KEY,
            JSON.stringify(screenProfileLayoutsSchema.parse(normalizedCurrent)),
          );
        }
        return normalizedCurrent;
      }

      const legacyNames = legacyScreenProfileLayoutNamesSchema.safeParse(parsedJson);
      if (legacyNames.success) {
        const converted = this.toFamilyRoutingFromLegacyNames(legacyNames.data);
        this.setScreenProfileLayouts(converted);
        return this.normalizeScreenProfileLayouts(converted);
      }

      const legacy = legacyScreenProfileLayoutsSchema.safeParse(parsedJson);
      if (legacy.success) {
        const converted = this.toFamilyRoutingFromLegacyNames({
          portraitLayoutName: this.getLayoutNameById(legacy.data.portraitLayoutId ?? null),
          landscapeLayoutName: this.getLayoutNameById(legacy.data.landscapeLayoutId ?? null),
          ultrawideLayoutName: this.getLayoutNameById(legacy.data.ultrawideLayoutId ?? null),
          photoPortraitLayoutName: this.getLayoutNameById(
            legacy.data.photoPortraitLayoutId ?? null,
          ),
          photoLandscapeLayoutName: this.getLayoutNameById(
            legacy.data.photoLandscapeLayoutId ?? null,
          ),
        });

        this.setScreenProfileLayouts(converted);
        return this.normalizeScreenProfileLayouts(converted);
      }

      return this.normalizeScreenProfileLayouts(screenProfileLayoutsSchema.parse({}));
    } catch {
      return this.normalizeScreenProfileLayouts(screenProfileLayoutsSchema.parse({}));
    }
  }

  setScreenProfileLayouts(config: ScreenProfileLayouts): void {
    const normalizedConfig = this.normalizeScreenProfileLayouts(config);
    this.setValue(
      SCREEN_PROFILE_LAYOUTS_KEY,
      JSON.stringify(screenProfileLayoutsSchema.parse(normalizedConfig)),
    );
  }

  getPhotoCollections(): PhotoCollectionsConfig {
    const rawValue = this.getValue(PHOTO_COLLECTIONS_KEY);
    if (!rawValue) {
      return photoCollectionsConfigSchema.parse({});
    }

    try {
      return photoCollectionsConfigSchema.parse(JSON.parse(rawValue));
    } catch {
      return photoCollectionsConfigSchema.parse({});
    }
  }

  setPhotoCollections(config: PhotoCollectionsConfig): void {
    this.setValue(
      PHOTO_COLLECTIONS_KEY,
      JSON.stringify(photoCollectionsConfigSchema.parse(config)),
    );
  }
}
