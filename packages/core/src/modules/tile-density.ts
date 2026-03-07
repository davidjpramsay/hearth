import { useCallback, useEffect, useState, type RefCallback } from "react";

export type TileDensity = "xs" | "sm" | "md" | "lg";

export interface TileDensityMetrics {
  width: number;
  height: number;
  shortSide: number;
  area: number;
  density: TileDensity;
}

const EMPTY_METRICS: TileDensityMetrics = {
  width: 0,
  height: 0,
  shortSide: 0,
  area: 0,
  density: "lg",
};

const classifyTileDensity = (width: number, height: number): TileDensity => {
  const shortSide = Math.min(width, height);
  const area = width * height;

  if (shortSide < 150 || area < 24_000) {
    return "xs";
  }

  if (shortSide < 220 || area < 50_000) {
    return "sm";
  }

  if (shortSide < 300 || area < 95_000) {
    return "md";
  }

  return "lg";
};

const readMetrics = (node: HTMLElement): TileDensityMetrics => {
  const bounds = node.getBoundingClientRect();
  const width = Math.max(0, Math.round(bounds.width));
  const height = Math.max(0, Math.round(bounds.height));
  const shortSide = Math.min(width, height);
  const area = width * height;

  return {
    width,
    height,
    shortSide,
    area,
    density: classifyTileDensity(width, height),
  };
};

export const useTileDensity = <T extends HTMLElement>(): {
  ref: RefCallback<T>;
  metrics: TileDensityMetrics;
} => {
  const [node, setNode] = useState<T | null>(null);
  const [metrics, setMetrics] = useState<TileDensityMetrics>(EMPTY_METRICS);

  const ref = useCallback<RefCallback<T>>((nextNode) => {
    setNode(nextNode);
  }, []);

  useEffect(() => {
    if (!node) {
      setMetrics(EMPTY_METRICS);
      return;
    }

    const updateMetrics = () => {
      setMetrics((previous) => {
        const next = readMetrics(node);
        if (
          previous.width === next.width &&
          previous.height === next.height &&
          previous.density === next.density
        ) {
          return previous;
        }

        return next;
      });
    };

    updateMetrics();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => {
        updateMetrics();
      });
      observer.observe(node);
      return () => {
        observer.disconnect();
      };
    }

    const onResize = () => {
      updateMetrics();
    };

    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [node]);

  return {
    ref,
    metrics,
  };
};
