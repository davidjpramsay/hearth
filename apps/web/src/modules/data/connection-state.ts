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
} => {
  const connectionIssue = input.error ? isConnectivityError(input.error) : false;

  return {
    blockingError:
      input.error && (!connectionIssue || !input.hasSnapshot) ? input.error : null,
    showDisconnected: !input.isOnline || (connectionIssue && input.hasSnapshot),
  };
};
