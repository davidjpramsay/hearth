import { useEffect, useState } from "react";

export const APP_BUILD_CHECK_EVENT = "hearth:check-for-update";

const BUILD_ASSET_POLL_MS = 60_000;

interface BuildAssetSignature {
  scriptSrc: string | null;
  stylesheetHref: string | null;
}

const normalizeAssetUrl = (value: string | null): string | null => {
  if (!value || typeof window === "undefined") {
    return null;
  }

  try {
    const url = new URL(value, window.location.href);
    return `${url.pathname}${url.search}`;
  } catch {
    return value;
  }
};

const readBuildAssetSignature = (root: ParentNode): BuildAssetSignature => ({
  scriptSrc: normalizeAssetUrl(
    root.querySelector<HTMLScriptElement>('script[type="module"][src]')?.getAttribute("src") ??
      null,
  ),
  stylesheetHref: normalizeAssetUrl(
    root.querySelector<HTMLLinkElement>('link[rel="stylesheet"][href]')?.getAttribute("href") ??
      null,
  ),
});

const areSameBuildAssetSignature = (
  left: BuildAssetSignature,
  right: BuildAssetSignature,
): boolean => left.scriptSrc === right.scriptSrc && left.stylesheetHref === right.stylesheetHref;

const hasComparableAssets = (signature: BuildAssetSignature): boolean =>
  Boolean(signature.scriptSrc || signature.stylesheetHref);

const fetchLatestBuildSignature = async (): Promise<BuildAssetSignature | null> => {
  if (typeof DOMParser === "undefined") {
    return null;
  }

  const response = await fetch("/", {
    cache: "no-store",
    headers: {
      "x-hearth-build-check": "1",
    },
  });
  if (!response.ok) {
    return null;
  }

  const html = await response.text();
  const parsedDocument = new DOMParser().parseFromString(html, "text/html");
  return readBuildAssetSignature(parsedDocument);
};

export const useBuildUpdateMonitor = (mode: "prompt" | "reload"): boolean => {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    const activeSignature = readBuildAssetSignature(document);
    if (!hasComparableAssets(activeSignature)) {
      return;
    }

    let isDisposed = false;

    const runCheck = async () => {
      if (updateAvailable) {
        return;
      }

      try {
        const latestSignature = await fetchLatestBuildSignature();
        if (
          isDisposed ||
          !latestSignature ||
          !hasComparableAssets(latestSignature) ||
          areSameBuildAssetSignature(activeSignature, latestSignature)
        ) {
          return;
        }

        if (mode === "reload") {
          window.location.reload();
          return;
        }

        setUpdateAvailable(true);
      } catch {
        // Ignore build-check failures and retry on the next interval.
      }
    };

    const interval = window.setInterval(() => {
      void runCheck();
    }, BUILD_ASSET_POLL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void runCheck();
      }
    };

    const handleManualCheck = () => {
      void runCheck();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener(APP_BUILD_CHECK_EVENT, handleManualCheck);

    return () => {
      isDisposed = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener(APP_BUILD_CHECK_EVENT, handleManualCheck);
    };
  }, [mode, updateAvailable]);

  return updateAvailable;
};
