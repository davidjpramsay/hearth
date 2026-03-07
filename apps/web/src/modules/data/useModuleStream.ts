import { useEffect, useMemo, useState } from "react";

interface ModuleStreamEnvelope {
  topic?: string;
  payload?: unknown;
}

interface UseModuleStreamOptions<TData> {
  topic: string;
  enabled?: boolean;
  url?: string;
  parse?: (payload: unknown) => TData;
}

export interface UseModuleStreamResult<TData> {
  data: TData | null;
  error: string | null;
  connected: boolean;
  lastUpdatedMs: number | null;
}

export const useModuleStream = <TData = unknown>(
  options: UseModuleStreamOptions<TData>,
): UseModuleStreamResult<TData> => {
  const {
    enabled = true,
    topic,
    parse = (value: unknown) => value as TData,
    url = "/api/modules/stream",
  } = options;

  const [data, setData] = useState<TData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastUpdatedMs, setLastUpdatedMs] = useState<number | null>(null);

  const streamUrl = useMemo(() => {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}topic=${encodeURIComponent(topic)}`;
  }, [topic, url]);

  useEffect(() => {
    if (!enabled) {
      setConnected(false);
      return;
    }

    const eventSource = new EventSource(streamUrl);

    eventSource.onopen = () => {
      setConnected(true);
      setError(null);
    };

    eventSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as ModuleStreamEnvelope;
        const payload = Object.prototype.hasOwnProperty.call(parsed, "payload")
          ? parsed.payload
          : parsed;
        const next = parse(payload);
        setData(next);
        setLastUpdatedMs(Date.now());
        setError(null);
      } catch (streamError) {
        setError(streamError instanceof Error ? streamError.message : "Invalid stream payload");
      }
    };

    eventSource.onerror = () => {
      setConnected(false);
      setError("Stream connection interrupted");
    };

    return () => {
      eventSource.close();
      setConnected(false);
    };
  }, [enabled, parse, streamUrl]);

  return {
    data,
    error,
    connected,
    lastUpdatedMs,
  };
};
