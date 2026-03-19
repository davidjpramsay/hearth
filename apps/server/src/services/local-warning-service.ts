import { parseLocalWarningConditionParams, type LocalWarningConditionParams } from "@hearth/shared";

const DEFAULT_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_WARNING_POINT_RADIUS_KM = 40;
const FETCH_TIMEOUT_MS = 15_000;

interface PointCoordinate {
  latitude: number;
  longitude: number;
}

interface WarningCircle {
  center: PointCoordinate;
  radiusKm: number;
}

interface EmergencyWaWarningRecord {
  id: string;
  headline: string;
  categoryLabel: string | null;
  alertLevel: string | null;
  severity: string | null;
  urgency: string | null;
  eventLabel: string | null;
  areaLabels: string[];
  detailUrl: string | null;
  expiresAtMs: number | null;
  searchText: string;
  points: PointCoordinate[];
  polygons: PointCoordinate[][];
  circles: WarningCircle[];
}

export interface LocalWarningMatch {
  id: string;
  serviceKind: "emergency-wa";
  serviceLabel: string;
  categoryLabel: string | null;
  alertLevel: string | null;
  headline: string;
  severity: string | null;
  urgency: string | null;
  eventLabel: string | null;
  areaLabels: string[];
  detailUrl: string | null;
}

interface LocalWarningServiceOptions {
  emergencyWaCapAuUrl?: string;
  refreshIntervalMs?: number;
  now?: () => number;
  fetchText?: (url: string) => Promise<string>;
  devForceActive?: boolean;
}

const decodeXmlEntities = (value: string): string =>
  value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

const stripXmlTags = (value: string): string =>
  decodeXmlEntities(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const readXmlTag = (xml: string, tagName: string): string | null => {
  const match = new RegExp(
    `<${escapeRegex(tagName)}[^>]*>([\\s\\S]*?)<\\/${escapeRegex(tagName)}>`,
    "i",
  ).exec(xml);
  return match ? stripXmlTags(match[1]) : null;
};

const readXmlTagValues = (xml: string, tagName: string): string[] =>
  Array.from(
    xml.matchAll(
      new RegExp(`<${escapeRegex(tagName)}[^>]*>([\\s\\S]*?)<\\/${escapeRegex(tagName)}>`, "gi"),
    ),
  )
    .map((match) => stripXmlTags(match[1] ?? ""))
    .filter((value) => value.length > 0);

const readXmlBlocks = (xml: string, tagName: string): string[] =>
  Array.from(
    xml.matchAll(
      new RegExp(`<${escapeRegex(tagName)}\\b[^>]*>([\\s\\S]*?)<\\/${escapeRegex(tagName)}>`, "gi"),
    ),
  )
    .map((match) => match[1] ?? "")
    .filter((value) => value.trim().length > 0);

const toTimestampMs = (value: string | null): number | null => {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeSearchText = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const extractLocationTerms = (value: string): string[] => {
  const firstPart = value.split(",")[0]?.trim() ?? "";
  const normalized = normalizeSearchText(firstPart);
  if (!normalized || normalized.startsWith("local")) {
    return [];
  }
  return Array.from(
    new Set(
      [normalized, ...normalized.split(" ").filter((term) => term.length >= 4)].filter(
        (term) => term.length > 0,
      ),
    ),
  );
};

const trimOrNull = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
};

const toLocationLabel = (value: string | null | undefined): string =>
  trimOrNull(value) ?? "Selected location";

const normalizeAlertSignal = (...parts: Array<string | null | undefined>): string =>
  parts
    .map((part) => normalizeSearchText(part ?? ""))
    .filter((part) => part.length > 0)
    .join(" ");

export const isEscalatingLocalWarning = (warning: {
  alertLevel?: string | null;
  severity?: string | null;
  eventLabel?: string | null;
  categoryLabel?: string | null;
  headline?: string | null;
}): boolean => {
  const alertLevel = normalizeSearchText(warning.alertLevel ?? "");

  return (
    alertLevel === "watch and act" ||
    alertLevel === "emergency warning" ||
    alertLevel.endsWith(" watch and act") ||
    alertLevel.endsWith(" emergency warning")
  );
};

const summarizeAreaLabel = (value: string): string | null => {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  const sentence = normalized.split(/(?<=[.!?])\s+/)[0]?.trim() ?? normalized;
  return sentence.slice(0, 180);
};

const parseLatLonCoordinate = (value: string): PointCoordinate | null => {
  const [latitudeRaw, longitudeRaw] = value.split(",");
  const latitude = Number.parseFloat(latitudeRaw ?? "");
  const longitude = Number.parseFloat(longitudeRaw ?? "");
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  return { latitude, longitude };
};

const parsePolygonCoordinates = (value: string): PointCoordinate[] => {
  const points = value
    .trim()
    .split(/\s+/)
    .map((pair) => parseLatLonCoordinate(pair))
    .filter((point): point is PointCoordinate => point !== null);

  return points.length >= 3 ? points : [];
};

const parseCircle = (value: string): WarningCircle | null => {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const [centerRaw, radiusRaw] = normalized.split(/\s+/);
  const center = parseLatLonCoordinate(centerRaw ?? "");
  const radiusKm = Number.parseFloat(radiusRaw ?? "");
  if (!center || !Number.isFinite(radiusKm)) {
    return null;
  }

  return {
    center,
    radiusKm: Math.max(0, radiusKm),
  };
};

const matchesSearchTerms = (searchText: string, terms: string[]): boolean =>
  terms.some((term) => term.length > 0 && searchText.includes(term));

const isPointInsidePolygon = (point: PointCoordinate, polygon: PointCoordinate[]): boolean => {
  let inside = false;

  for (
    let index = 0, previousIndex = polygon.length - 1;
    index < polygon.length;
    previousIndex = index, index += 1
  ) {
    const current = polygon[index]!;
    const previous = polygon[previousIndex]!;
    const intersects =
      current.latitude > point.latitude !== previous.latitude > point.latitude &&
      point.longitude <
        ((previous.longitude - current.longitude) * (point.latitude - current.latitude)) /
          (previous.latitude - current.latitude || Number.EPSILON) +
          current.longitude;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
};

const toRadians = (value: number): number => (value * Math.PI) / 180;

const distanceKm = (left: PointCoordinate, right: PointCoordinate): number => {
  const latitudeDelta = toRadians(right.latitude - left.latitude);
  const longitudeDelta = toRadians(right.longitude - left.longitude);
  const latitudeA = toRadians(left.latitude);
  const latitudeB = toRadians(right.latitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const parseEmergencyWaWarnings = (xml: string): EmergencyWaWarningRecord[] =>
  readXmlBlocks(xml, "cap:alert").flatMap((alertXml, alertIndex) => {
    const msgType = (readXmlTag(alertXml, "cap:msgType") ?? "").toLowerCase();
    if (msgType === "cancel") {
      return [];
    }

    const identifier = readXmlTag(alertXml, "cap:identifier") ?? `warning-${alertIndex}`;

    return readXmlBlocks(alertXml, "cap:info")
      .map((infoXml, infoIndex) => {
        const urgency = trimOrNull(readXmlTag(infoXml, "cap:urgency"));
        const expiresAtMs = toTimestampMs(readXmlTag(infoXml, "cap:expires"));
        if (urgency?.toLowerCase().startsWith("past")) {
          return null;
        }

        const areaBlocks = readXmlBlocks(infoXml, "cap:area");
        const areaLabels = Array.from(
          new Set(
            areaBlocks
              .map((areaXml) => summarizeAreaLabel(readXmlTag(areaXml, "cap:areaDesc") ?? ""))
              .filter((label): label is string => Boolean(label)),
          ),
        );
        const polygons = areaBlocks
          .flatMap((areaXml) => readXmlTagValues(areaXml, "cap:polygon"))
          .map((polygon) => parsePolygonCoordinates(polygon))
          .filter((polygon) => polygon.length >= 3);
        const circles = areaBlocks
          .flatMap((areaXml) => readXmlTagValues(areaXml, "cap:circle"))
          .map((circle) => parseCircle(circle))
          .filter((circle): circle is WarningCircle => circle !== null);
        const points = circles
          .filter((circle) => circle.radiusKm === 0)
          .map((circle) => circle.center);
        const alertLevel =
          areaBlocks
            .map((areaXml) => trimOrNull(readXmlTag(areaXml, "cap:alertLevel")))
            .find((value) => value !== null) ?? null;
        const eventValues = readXmlTagValues(infoXml, "cap:event");
        const eventLabel: string | null =
          eventValues.find((value) => normalizeSearchText(value) !== "weather") ??
          eventValues[0] ??
          null;
        const categoryLabel = trimOrNull(readXmlTag(infoXml, "cap:category"));
        const headline =
          trimOrNull(readXmlTag(infoXml, "cap:headline")) ??
          trimOrNull(readXmlTag(infoXml, "cap:description")) ??
          eventLabel ??
          "Emergency warning";
        const detailUrl = trimOrNull(readXmlTag(infoXml, "cap:web"));
        const severity = trimOrNull(readXmlTag(infoXml, "cap:severity"));
        const searchText = normalizeSearchText(
          [headline, categoryLabel ?? "", eventLabel ?? "", alertLevel ?? "", ...areaLabels].join(
            " ",
          ),
        );

        if (!searchText) {
          return null;
        }

        const warning: EmergencyWaWarningRecord = {
          id: `${identifier}::${infoIndex}`,
          headline,
          categoryLabel,
          alertLevel,
          severity,
          urgency,
          eventLabel,
          areaLabels,
          detailUrl,
          expiresAtMs,
          searchText,
          points,
          polygons,
          circles,
        };

        return warning;
      })
      .filter((warning): warning is EmergencyWaWarningRecord => warning !== null);
  });

const defaultFetchText = async (url: string): Promise<string> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/xml, text/xml;q=0.9, */*;q=0.1",
      },
    });

    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
};

export class LocalWarningService {
  private readonly emergencyWaCapAuUrl: string;
  private readonly refreshIntervalMs: number;
  private readonly now: () => number;
  private readonly fetchText: (url: string) => Promise<string>;
  private readonly devForceActive: boolean;

  private warnings: EmergencyWaWarningRecord[] = [];
  private refreshPromise: Promise<void> | null = null;
  private lastRefreshAttemptAtMs: number | null = null;
  private intervalHandle: NodeJS.Timeout | null = null;

  constructor(options: LocalWarningServiceOptions = {}) {
    this.emergencyWaCapAuUrl =
      options.emergencyWaCapAuUrl ?? "https://api.emergency.wa.gov.au/v1/capau";
    this.refreshIntervalMs = options.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS;
    this.now = options.now ?? (() => Date.now());
    this.fetchText = options.fetchText ?? defaultFetchText;
    this.devForceActive = options.devForceActive ?? false;
  }

  start(): void {
    if (this.intervalHandle) {
      return;
    }

    this.refreshInBackground();
    this.intervalHandle = setInterval(() => {
      this.refreshInBackground();
    }, this.refreshIntervalMs);
    this.intervalHandle.unref?.();
  }

  async stop(): Promise<void> {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }

    try {
      await this.refreshPromise;
    } catch {
      // Ignore refresh errors during shutdown.
    }
  }

  async listActiveWarnings(input: unknown): Promise<LocalWarningMatch[]> {
    const params = parseLocalWarningConditionParams(input);
    if (this.devForceActive) {
      return [this.createForcedWarningMatch(params)];
    }

    if (this.lastRefreshAttemptAtMs === null && this.refreshPromise === null) {
      try {
        await this.refreshNow();
      } catch {
        // Fall back to any cached state if live refresh fails.
      }
    } else {
      this.refreshInBackground();
    }

    return this.getMatchingWarnings(params).map((warning) => this.toLocalWarningMatch(warning));
  }

  hasActiveWarning(input: unknown): boolean {
    const params = parseLocalWarningConditionParams(input);
    if (this.devForceActive) {
      return true;
    }
    this.refreshInBackground();
    return this.getMatchingWarnings(params).length > 0;
  }

  hasEscalatingWarning(input: unknown): boolean {
    const params = parseLocalWarningConditionParams(input);
    if (this.devForceActive) {
      return true;
    }
    this.refreshInBackground();
    return this.getMatchingWarnings(params).some((warning) =>
      isEscalatingLocalWarning({
        alertLevel: warning.alertLevel,
        severity: warning.severity,
        eventLabel: warning.eventLabel,
        categoryLabel: warning.categoryLabel,
        headline: warning.headline,
      }),
    );
  }

  listCachedActiveWarnings(input: unknown): LocalWarningMatch[] {
    const params = parseLocalWarningConditionParams(input);
    if (this.devForceActive) {
      return [this.createForcedWarningMatch(params)];
    }
    this.refreshInBackground();
    return this.getMatchingWarnings(params).map((warning) => this.toLocalWarningMatch(warning));
  }

  async refreshNow(): Promise<void> {
    this.lastRefreshAttemptAtMs = this.now();
    const xml = await this.fetchText(this.emergencyWaCapAuUrl);
    this.warnings = parseEmergencyWaWarnings(xml);
  }

  private refreshInBackground(): void {
    const nowMs = this.now();
    if (
      this.refreshPromise ||
      (this.lastRefreshAttemptAtMs !== null &&
        nowMs - this.lastRefreshAttemptAtMs < this.refreshIntervalMs)
    ) {
      return;
    }

    this.refreshPromise = this.refreshNow().finally(() => {
      this.refreshPromise = null;
    });
    void this.refreshPromise.catch(() => undefined);
  }

  private getMatchingWarnings(params: LocalWarningConditionParams): EmergencyWaWarningRecord[] {
    const locationTerms = extractLocationTerms(params.locationQuery);
    const coordinates =
      typeof params.latitude === "number" && typeof params.longitude === "number"
        ? {
            latitude: params.latitude,
            longitude: params.longitude,
          }
        : null;
    return this.warnings.filter((warning) => {
      if (coordinates) {
        if (warning.polygons.some((polygon) => isPointInsidePolygon(coordinates, polygon))) {
          return true;
        }

        if (
          warning.circles.some(
            (circle) =>
              distanceKm(circle.center, coordinates) <=
              Math.max(circle.radiusKm, DEFAULT_WARNING_POINT_RADIUS_KM),
          )
        ) {
          return true;
        }

        if (
          warning.points.some(
            (point) => distanceKm(point, coordinates) <= DEFAULT_WARNING_POINT_RADIUS_KM,
          )
        ) {
          return true;
        }
      }

      return matchesSearchTerms(warning.searchText, locationTerms);
    });
  }

  private toLocalWarningMatch(warning: EmergencyWaWarningRecord): LocalWarningMatch {
    return {
      id: warning.id,
      serviceKind: "emergency-wa",
      serviceLabel: "Emergency WA",
      categoryLabel: warning.categoryLabel,
      alertLevel: warning.alertLevel,
      headline: warning.headline,
      severity: warning.severity,
      urgency: warning.urgency,
      eventLabel: warning.eventLabel,
      areaLabels: warning.areaLabels,
      detailUrl: warning.detailUrl,
    };
  }

  private createForcedWarningMatch(params: LocalWarningConditionParams): LocalWarningMatch {
    const locationLabel = toLocationLabel(params.locationQuery);
    return {
      id: `dev-force-warning:${normalizeSearchText(locationLabel) || "local-area"}`,
      serviceKind: "emergency-wa",
      serviceLabel: "Emergency WA",
      categoryLabel: "Test warning",
      alertLevel: "Watch and Act",
      headline: `Dev warning active for ${locationLabel}`,
      severity: "Moderate",
      urgency: "Immediate",
      eventLabel: "Local warning test",
      areaLabels: [locationLabel],
      detailUrl: "https://www.emergency.wa.gov.au/warnings",
    };
  }
}
