import { useCallback, useEffect, useMemo, useState } from "react";

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
  revalidate: () => Promise<void>;
}

const queryCache = new Map<string, ModuleQueryCacheEntry<unknown>>();

const readCachedEntry = <TData,>(key: string): ModuleQueryCacheEntry<TData> | null => {
  const cached = queryCache.get(key);
  return cached ? (cached as ModuleQueryCacheEntry<TData>) : null;
};

export const useModuleQuery = <TData,>(
  options: UseModuleQueryOptions<TData>,
): UseModuleQueryResult<TData> => {
  const { enabled = true, intervalMs = 30_000, staleMs = 10_000 } = options;
  const cachedAtStart = useMemo(() => readCachedEntry<TData>(options.key), [options.key]);
  const [data, setData] = useState<TData | null>(cachedAtStart?.data ?? null);
  const [loading, setLoading] = useState<boolean>(enabled && !cachedAtStart);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedMs, setLastUpdatedMs] = useState<number | null>(
    cachedAtStart?.updatedAtMs ?? null,
  );

  const revalidate = useCallback(async () => {
    if (!enabled) {
      return;
    }

    setLoading((current) => (data === null ? true : current));
    setError(null);

    try {
      const next = await options.queryFn();
      const updatedAtMs = Date.now();
      queryCache.set(options.key, {
        data: next,
        updatedAtMs,
      });
      setData(next);
      setLastUpdatedMs(updatedAtMs);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load module data");
    } finally {
      setLoading(false);
    }
  }, [data, enabled, options]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    const cached = readCachedEntry<TData>(options.key);
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

    const timer = window.setInterval(() => {
      void revalidate();
    }, Math.max(2000, intervalMs));

    return () => {
      window.clearInterval(timer);
    };
  }, [enabled, intervalMs, options.key, revalidate, staleMs]);

  return {
    data,
    loading,
    error,
    lastUpdatedMs,
    revalidate,
  };
};
