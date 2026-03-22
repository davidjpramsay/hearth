import { useEffect, useRef } from "react";

type WakeLockRequestApi = Pick<WakeLock, "request">;

interface ReleaseListenerEntry {
  sentinel: WakeLockSentinel;
  listener: EventListener;
}

const getWakeLockApi = (): WakeLockRequestApi | null => {
  if (typeof navigator === "undefined") {
    return null;
  }

  const wakeLock = (navigator as Navigator & Partial<{ wakeLock: WakeLockRequestApi }>).wakeLock;
  return typeof wakeLock?.request === "function" ? wakeLock : null;
};

export const useScreenWakeLock = (enabled: boolean): void => {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const requestInFlightRef = useRef<Promise<void> | null>(null);
  const releaseListenerRef = useRef<ReleaseListenerEntry | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    const wakeLockApi = getWakeLockApi();
    if (!wakeLockApi) {
      return;
    }

    let isDisposed = false;

    const clearReleaseListener = () => {
      const entry = releaseListenerRef.current;
      if (!entry) {
        return;
      }

      entry.sentinel.removeEventListener("release", entry.listener);
      releaseListenerRef.current = null;
    };

    const releaseWakeLock = async () => {
      const sentinel = wakeLockRef.current;
      wakeLockRef.current = null;
      clearReleaseListener();
      if (!sentinel) {
        return;
      }

      try {
        if (!sentinel.released) {
          await sentinel.release();
        }
      } catch {
        // Ignore release failures from browsers that already dropped the lock.
      }
    };

    const requestWakeLock = (): Promise<void> => {
      if (
        isDisposed ||
        document.visibilityState !== "visible" ||
        (wakeLockRef.current && !wakeLockRef.current.released)
      ) {
        return Promise.resolve();
      }

      if (requestInFlightRef.current) {
        return requestInFlightRef.current;
      }

      const requestPromise = wakeLockApi
        .request("screen")
        .then(async (sentinel) => {
          if (isDisposed) {
            try {
              if (!sentinel.released) {
                await sentinel.release();
              }
            } catch {
              // Ignore release failures during teardown.
            }
            return;
          }

          clearReleaseListener();

          const handleRelease: EventListener = () => {
            sentinel.removeEventListener("release", handleRelease);
            if (releaseListenerRef.current?.sentinel === sentinel) {
              releaseListenerRef.current = null;
            }
            if (wakeLockRef.current === sentinel) {
              wakeLockRef.current = null;
            }
          };

          sentinel.addEventListener("release", handleRelease);
          releaseListenerRef.current = {
            sentinel,
            listener: handleRelease,
          };
          wakeLockRef.current = sentinel;
        })
        .catch(() => {
          // Ignore unsupported/runtime-denied wake-lock requests.
        })
        .finally(() => {
          requestInFlightRef.current = null;
        });

      requestInFlightRef.current = requestPromise;
      return requestPromise;
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void requestWakeLock();
      }
    };

    const handlePageShow = () => {
      void requestWakeLock();
    };

    void requestWakeLock();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      isDisposed = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
      void releaseWakeLock();
    };
  }, [enabled]);
};
