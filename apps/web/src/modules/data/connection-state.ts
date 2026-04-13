import { useEffect, useState } from "react";

const CONNECTION_ERROR_PATTERNS = [
  /failed to fetch/i,
  /fetch failed/i,
  /network ?error/i,
  /network request failed/i,
  /stream connection interrupted/i,
  /timed? out/i,
  /timeout/i,
  /socket hang up/i,
  /econnrefused/i,
  /enotfound/i,
  /eai_again/i,
  /internet disconnected/i,
];

const readBrowserOnlineStatus = (): boolean =>
  typeof navigator === "undefined" || typeof navigator.onLine !== "boolean"
    ? true
    : navigator.onLine;

export const useBrowserOnlineStatus = (): boolean => {
  const [isOnline, setIsOnline] = useState<boolean>(() => readBrowserOnlineStatus());

  useEffect(() => {
    const syncStatus = () => {
      setIsOnline(readBrowserOnlineStatus());
    };

    window.addEventListener("online", syncStatus);
    window.addEventListener("offline", syncStatus);

    return () => {
      window.removeEventListener("online", syncStatus);
      window.removeEventListener("offline", syncStatus);
    };
  }, []);

  return isOnline;
};

export const isConnectivityError = (error: unknown): boolean => {
  if (!readBrowserOnlineStatus()) {
    return true;
  }

  if (error instanceof Error && error.name === "AbortError") {
    return false;
  }

  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "";

  return CONNECTION_ERROR_PATTERNS.some((pattern) => pattern.test(message));
};

export const resolveModuleConnectivityState = (input: {
  error: string | null;
  hasSnapshot: boolean;
  isOnline: boolean;
}): {
  blockingError: string | null;
  showDisconnected: boolean;
  disconnectedTitle: string | null;
  disconnectedLabel: string | null;
} => {
  const connectionIssue = input.error ? isConnectivityError(input.error) : false;

  if (!input.isOnline) {
    return {
      blockingError: input.hasSnapshot ? null : "Offline. Waiting for first sync.",
      showDisconnected: input.hasSnapshot,
      disconnectedTitle: input.hasSnapshot ? "Offline. Showing cached data." : null,
      disconnectedLabel: input.hasSnapshot ? "Offline" : null,
    };
  }

  if (connectionIssue && input.hasSnapshot) {
    return {
      blockingError: null,
      showDisconnected: true,
      disconnectedTitle: "Live updates are unavailable. Showing cached data.",
      disconnectedLabel: "Cached",
    };
  }

  if (connectionIssue) {
    return {
      blockingError: "Can't reach the server yet. Waiting for first sync.",
      showDisconnected: false,
      disconnectedTitle: null,
      disconnectedLabel: null,
    };
  }

  return {
    blockingError: input.error,
    showDisconnected: false,
    disconnectedTitle: null,
    disconnectedLabel: null,
  };
};
