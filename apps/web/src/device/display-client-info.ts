import {
  displayDeviceInfoSchema,
  type DisplayDeviceFormFactor,
  type DisplayDeviceInfo,
} from "@hearth/shared";

interface NavigatorWithHints extends Navigator {
  standalone?: boolean;
  userAgentData?: {
    brands?: Array<{
      brand?: string;
      version?: string;
    }>;
    mobile?: boolean;
    platform?: string;
  };
}

const collapseWhitespace = (value: string | null | undefined): string | null => {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
};

const getUserAgent = (navigatorValue: Navigator): string =>
  typeof navigatorValue.userAgent === "string" ? navigatorValue.userAgent : "";

const isIpadOs = (navigatorValue: Navigator, userAgent: string): boolean =>
  /iPad/i.test(userAgent) ||
  (navigatorValue.platform === "MacIntel" && navigatorValue.maxTouchPoints > 1);

const inferPlatform = (navigatorValue: NavigatorWithHints, userAgent: string): string | null => {
  const hintedPlatform = collapseWhitespace(navigatorValue.userAgentData?.platform);
  if (hintedPlatform) {
    return hintedPlatform;
  }

  if (isIpadOs(navigatorValue, userAgent)) {
    return "iPadOS";
  }
  if (/iPhone|iPod/i.test(userAgent)) {
    return "iOS";
  }
  if (/Android/i.test(userAgent)) {
    return "Android";
  }
  if (/Windows/i.test(userAgent)) {
    return "Windows";
  }
  if (/Mac OS X|Macintosh/i.test(userAgent)) {
    return "macOS";
  }
  if (/Linux/i.test(userAgent)) {
    return "Linux";
  }

  return null;
};

const inferBrowser = (navigatorValue: NavigatorWithHints, userAgent: string): string | null => {
  const brands = navigatorValue.userAgentData?.brands ?? [];
  const normalizedBrands = brands
    .map((entry) => collapseWhitespace(entry.brand)?.toLowerCase() ?? null)
    .filter((entry): entry is string => entry !== null);

  if (normalizedBrands.some((entry) => entry.includes("edge"))) {
    return "Edge";
  }
  if (normalizedBrands.some((entry) => entry.includes("opera"))) {
    return "Opera";
  }
  if (normalizedBrands.some((entry) => entry.includes("chrome"))) {
    return "Chrome";
  }
  if (normalizedBrands.some((entry) => entry.includes("firefox"))) {
    return "Firefox";
  }
  if (normalizedBrands.some((entry) => entry.includes("safari"))) {
    return "Safari";
  }

  if (/FxiOS|Firefox\//i.test(userAgent)) {
    return "Firefox";
  }
  if (/EdgiOS|Edg\//i.test(userAgent)) {
    return "Edge";
  }
  if (/OPRiOS|OPR\//i.test(userAgent)) {
    return "Opera";
  }
  if (/CriOS|Chrome\//i.test(userAgent)) {
    return "Chrome";
  }
  if (/Safari\//i.test(userAgent) && /Version\//i.test(userAgent)) {
    return "Safari";
  }

  return null;
};

const inferFormFactor = (
  navigatorValue: NavigatorWithHints,
  userAgent: string,
): DisplayDeviceFormFactor => {
  if (isIpadOs(navigatorValue, userAgent) || /Tablet/i.test(userAgent)) {
    return "tablet";
  }
  if (/iPhone|iPod/i.test(userAgent)) {
    return "phone";
  }
  if (/Android/i.test(userAgent)) {
    return /Mobile/i.test(userAgent) || navigatorValue.userAgentData?.mobile ? "phone" : "tablet";
  }
  if (/Windows|Macintosh|Mac OS X|Linux|X11/i.test(userAgent)) {
    return "desktop";
  }

  return "other";
};

const inferLabel = (
  platform: string | null,
  formFactor: DisplayDeviceFormFactor,
  navigatorValue: NavigatorWithHints,
  userAgent: string,
): string | null => {
  if (isIpadOs(navigatorValue, userAgent)) {
    return "iPad";
  }
  if (/iPhone/i.test(userAgent)) {
    return "iPhone";
  }
  if (/Android/i.test(userAgent)) {
    return formFactor === "tablet" ? "Android Tablet" : "Android Phone";
  }
  if (platform === "macOS") {
    return "Mac";
  }
  if (platform === "Windows") {
    return "Windows PC";
  }
  if (platform === "Linux") {
    return "Linux PC";
  }
  if (formFactor === "tablet") {
    return "Tablet";
  }
  if (formFactor === "phone") {
    return "Phone";
  }
  if (formFactor === "desktop") {
    return "Desktop";
  }

  return null;
};

const getStandaloneState = (navigatorValue: NavigatorWithHints): boolean => {
  const mediaStandalone =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;
  return mediaStandalone || navigatorValue.standalone === true;
};

export const getDisplayClientInfo = (): DisplayDeviceInfo | null => {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return null;
  }

  const navigatorValue = navigator as NavigatorWithHints;
  const userAgent = getUserAgent(navigatorValue);
  const platform = inferPlatform(navigatorValue, userAgent);
  const browser = inferBrowser(navigatorValue, userAgent);
  const formFactor = inferFormFactor(navigatorValue, userAgent);
  const label = inferLabel(platform, formFactor, navigatorValue, userAgent);

  return displayDeviceInfoSchema.parse({
    label,
    platform,
    browser,
    formFactor,
    viewportWidth: Math.max(1, Math.round(window.innerWidth)),
    viewportHeight: Math.max(1, Math.round(window.innerHeight)),
    pixelRatio:
      typeof window.devicePixelRatio === "number" && Number.isFinite(window.devicePixelRatio)
        ? Math.max(1, Math.min(8, Number(window.devicePixelRatio.toFixed(2))))
        : null,
    standalone: getStandaloneState(navigatorValue),
  });
};
