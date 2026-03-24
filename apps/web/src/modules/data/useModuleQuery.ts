import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  resolveModuleConnectivityState,
  useBrowserOnlineStatus,
} from "./connection-state";

interface ModuleQueryCacheEntry<TData> {
  data: TData;
  updatedAtMs: number;
}

interface UseModuleQueryOptions<TData> {
  key: string;
  queryFn: () => Promise<TData>;
  intervalMs?: number;
  staleMs?: number;
  enabled?: boolean;
}

export interface UseModuleQueryResult<TData> {
  data: TData | null;
  loading: boolean;
  error: string | null;
  lastUpdatedMs: number | null;
  isDisconnected: boolean;
  revalidate: () => Promise<void>;
}

const queryCache = new Map<string, ModuleQueryCacheEntry<unknown>>();
const inFlightQueries = new Map<string, Promise<ModuleQueryCacheEntry<unknown>>>();

const readCachedEntry = <TData,>(key: string): ModuleQueryCacheEntry<TData> | null => {
  const cached = queryCache.get(key);
  return cached ? (cached as ModuleQueryCacheEntry<TData>) : null;
};

export const useModuleQuery = <TData,>(
  options: UseModuleQueryOptions<TData>,
): UseModuleQueryResult<TData> => {
  const { enabled = true, intervalMs = 30_000, key, queryFn, staleMs = 10_000 } = options;
  const cachedAtStart = useMemo(() => readCachedEntry<TData>(key), [key]);
  const browserOnline = useBrowserOnlineStatus();
  const [data, setData] = useState<TData | null>(cachedAtStart?.data ?? null);
  const [loading, setLoading] = useState<boolean>(enabled && !cachedAtStart);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [lastUpdatedMs, setLastUpdatedMs] = useState<number | null>(
    cachedAtStart?.updatedAtMs ?? null,
  );
  const dataRef = useRef<TData | null>(cachedAtStart?.data ?? null);
  const queryFnRef = useRef(queryFn);
  const connectivityState = useMemo(
    () =>
      resolveModuleConnectivityState({
        error: requestError,
        hasSnapshot: data !== null,
        isOnline: browserOnline,
      }),
    [browserOnline, data, requestError],
  );

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    queryFnRef.current = queryFn;
  }, [queryFn]);

  const revalidate = useCallback(async () => {
    if (!enabled) {
      return;
    }

    const currentData = dataRef.current;
    setLoading((current) => (currentData === null ? true : current));
    if (currentData === null) {
      setRequestError(null);
    }

    try {
      let requestPromise = inFlightQueries.get(key) as Promise<ModuleQueryCacheEntry<TData>> | undefined;
      if (!requestPromise) {
        requestPromise = queryFnRef.current()
          .then((next) => {
            const entry = {
              data: next,
              updatedAtMs: Date.now(),
            };
            queryCache.set(key, entry);
            return entry;
          })
          .finally(() => {
            if (inFlightQueries.get(key) === requestPromise) {
              inFlightQueries.delete(key);
            }
          });
        inFlightQueries.set(key, requestPromise as Promise<ModuleQueryCacheEntry<unknown>>);
      }

      const nextEntry = await requestPromise;
      setData(nextEntry.data);
      setLastUpdatedMs(nextEntry.updatedAtMs);
      setRequestError(null);
    } catch (requestError) {
      setRequestError(
        requestError instanceof Error ? requestError.message : "Failed to load module data",
      );
    } finally {
      setLoading(false);
    }
  }, [enabled, key]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setRequestError(null);
      return;
    }

    const cached = readCachedEntry<TData>(key);
    const now = Date.now();
    const isFresh = cached ? now - cached.updatedAtMs <= staleMs : false;

    if (cached) {
      setData(cached.data);
      setLastUpdatedMs(cached.updatedAtMs);
      setLoading(false);
    }

    if (!isFresh) {
      void revalidate();
    }

    let timer: number | null = null;
    const startTimer = () => {
      if (timer !== null) {
        return;
      }

      timer = window.setInterval(() => {
        void revalidate();
      }, Math.max(2000, intervalMs));
    };
    const stopTimer = () => {
      if (timer === null) {
        return;
      }

      window.clearInterval(timer);
      timer = null;
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void revalidate();
        startTimer();
        return;
      }

      stopTimer();
    };
    const handlePageShow = () => {
      void revalidate();
      startTimer();
    };
    const handleWindowFocus = () => {
      void revalidate();
      startTimer();
    };

    if (typeof document === "undefined" || document.visibilityState === "visible") {
      startTimer();
    }

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      stopTimer();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [enabled, intervalMs, key, revalidate, staleMs]);

  return {
    data,
    loading,
    error: connectivityState.blockingError,
    lastUpdatedMs,
    isDisconnected: connectivityState.showDisconnected,
    revalidate,
  };
};
