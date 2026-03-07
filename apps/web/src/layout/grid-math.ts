import {
  photosModuleConfigSchema,
  type GridItem,
  type ModuleInstance,
} from "@hearth/shared";

const TARGET_SHORT_SIDE_CELLS = 20;
const GRID_SEARCH_ROW_PADDING = 48;
const GRID_SEARCH_COL_PADDING = 12;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const collides = (left: GridItem, right: GridItem): boolean =>
  left.x < right.x + right.w &&
  left.x + left.w > right.x &&
  left.y < right.y + right.h &&
  left.y + left.h > right.y;

const findOpenSlot = (
  width: number,
  height: number,
  placed: GridItem[],
  cols: number,
  rows: number,
): { x: number; y: number } | null => {
  const maxY = rows - height;
  const maxX = cols - width;

  if (maxY < 0 || maxX < 0) {
    return null;
  }

  for (let y = 0; y <= maxY; y += 1) {
    for (let x = 0; x <= maxX; x += 1) {
      const candidate: GridItem = { i: "__probe__", x, y, w: width, h: height };
      if (!placed.some((item) => collides(candidate, item))) {
        return { x, y };
      }
    }
  }

  return null;
};

const isPortraitFullHeightSplitCompatible = (cols: number, rows: number): boolean => {
  if (rows % 4 !== 0) {
    return false;
  }

  // Enforces: (cols - (3/4 * rows)) is an even integer.
  const leftoverTimes4 = 4 * cols - 3 * rows;
  return leftoverTimes4 >= 0 && leftoverTimes4 % 8 === 0;
};

export interface AdaptiveGridMetrics {
  cols: number;
  rows: number;
  rowHeight: number;
}

export const getAdaptiveGridMetrics = (
  width: number,
  height: number,
): AdaptiveGridMetrics => {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const ratio = safeWidth / safeHeight;
  const isLandscape = ratio >= 1;
  const desiredRows = isLandscape ? TARGET_SHORT_SIDE_CELLS : TARGET_SHORT_SIDE_CELLS / ratio;
  const minRows = Math.max(4, Math.floor(desiredRows - GRID_SEARCH_ROW_PADDING));
  const maxRows = Math.max(minRows, Math.ceil(desiredRows + GRID_SEARCH_ROW_PADDING));
  const enforcePortraitSplit = ratio >= 0.75;

  const pickCandidate = (enforceSplitRule: boolean): { cols: number; rows: number } | null => {
    let best: { cols: number; rows: number } | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let rows = minRows; rows <= maxRows; rows += 1) {
      const approximateCols = ratio * rows;
      const roundedCols = Math.round(approximateCols);

      for (let delta = -GRID_SEARCH_COL_PADDING; delta <= GRID_SEARCH_COL_PADDING; delta += 1) {
        const cols = roundedCols + delta;

        if (cols < 4) {
          continue;
        }

        if (isLandscape && cols < rows) {
          continue;
        }

        if (!isLandscape && cols > rows) {
          continue;
        }

        if (enforceSplitRule && !isPortraitFullHeightSplitCompatible(cols, rows)) {
          continue;
        }

        const ratioError = Math.abs(cols / rows - ratio);
        const shortSideError = Math.abs(Math.min(cols, rows) - TARGET_SHORT_SIDE_CELLS);
        const colsError = Math.abs(cols - approximateCols);
        const score = ratioError * 400 + shortSideError * 5 + colsError * 0.5;

        if (score < bestScore) {
          bestScore = score;
          best = { cols, rows };
        }
      }
    }

    return best;
  };

  const candidate =
    pickCandidate(enforcePortraitSplit) ??
    pickCandidate(false) ?? {
      cols: Math.max(4, Math.round(ratio * Math.max(4, Math.round(desiredRows)))),
      rows: Math.max(4, Math.round(desiredRows)),
    };
  const rowHeight = Math.max(1, Math.min(safeWidth / candidate.cols, safeHeight / candidate.rows));

  return { cols: candidate.cols, rows: candidate.rows, rowHeight };
};

export interface PhotoLayoutLock {
  aspectRatio: number;
  minW: number;
  minH: number;
}

export const getPhotoLayoutLock = (
  moduleInstance: ModuleInstance | undefined,
): PhotoLayoutLock | null => {
  if (!moduleInstance || moduleInstance.moduleId !== "photos") {
    return null;
  }

  const parsedConfig = photosModuleConfigSchema.safeParse(moduleInstance.config);
  const normalizedConfig = parsedConfig.success
    ? parsedConfig.data
    : photosModuleConfigSchema.parse({});

  if (normalizedConfig.layoutOrientation === "portrait") {
    return {
      aspectRatio: 3 / 4,
      minW: 3,
      minH: 4,
    };
  }

  return {
    aspectRatio: 4 / 3,
    minW: 4,
    minH: 3,
  };
};

const quantizePhotoSize = (input: {
  desiredW: number;
  desiredH: number;
  maxCols: number;
  maxRows: number;
  lock: PhotoLayoutLock;
}): { w: number; h: number } => {
  const minW = clamp(input.lock.minW, 1, input.maxCols);
  const minH = clamp(input.lock.minH, 1, input.maxRows);
  const desiredW = clamp(Math.round(input.desiredW), minW, input.maxCols);
  const desiredH = clamp(Math.round(input.desiredH), minH, input.maxRows);
  const desiredArea = Math.max(1, desiredW * desiredH);
  const ratio = input.lock.aspectRatio;
  const candidates = new Map<string, { w: number; h: number }>();

  const addCandidate = (w: number, h: number) => {
    if (!Number.isFinite(w) || !Number.isFinite(h)) {
      return;
    }

    const nextW = Math.round(w);
    const nextH = Math.round(h);

    if (nextW < minW || nextW > input.maxCols || nextH < minH || nextH > input.maxRows) {
      return;
    }

    candidates.set(`${nextW}x${nextH}`, { w: nextW, h: nextH });
  };

  for (let w = minW; w <= input.maxCols; w += 1) {
    const idealHeight = w / ratio;
    addCandidate(w, Math.floor(idealHeight));
    addCandidate(w, Math.round(idealHeight));
    addCandidate(w, Math.ceil(idealHeight));
  }

  for (let h = minH; h <= input.maxRows; h += 1) {
    const idealWidth = h * ratio;
    addCandidate(Math.floor(idealWidth), h);
    addCandidate(Math.round(idealWidth), h);
    addCandidate(Math.ceil(idealWidth), h);
  }

  addCandidate(desiredW, desiredH);

  let bestCandidate: { w: number; h: number } | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  let bestRatioError = Number.POSITIVE_INFINITY;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates.values()) {
    const ratioError = Math.abs(candidate.w / candidate.h - ratio);
    const distance = Math.abs(candidate.w - desiredW) + Math.abs(candidate.h - desiredH);
    const areaError = Math.abs(candidate.w * candidate.h - desiredArea) / desiredArea;
    const score = ratioError * 50 + distance + areaError * 2;

    if (
      score < bestScore ||
      (score === bestScore &&
        (ratioError < bestRatioError ||
          (ratioError === bestRatioError && distance < bestDistance)))
    ) {
      bestCandidate = candidate;
      bestScore = score;
      bestRatioError = ratioError;
      bestDistance = distance;
    }
  }

  if (bestCandidate) {
    return bestCandidate;
  }

  return { w: desiredW, h: desiredH };
};

export const inferLayoutRows = (input: { rows?: number; items: GridItem[] }): number => {
  if (Number.isFinite(input.rows) && Number(input.rows) > 0) {
    return Math.max(4, Math.round(Number(input.rows)));
  }

  const usedRows = input.items.reduce((maxRows, item) => Math.max(maxRows, item.y + item.h), 0);
  return Math.max(4, usedRows || TARGET_SHORT_SIDE_CELLS);
};

export const sanitizeGridItems = (input: {
  items: GridItem[];
  modules: ModuleInstance[];
  targetCols: number;
  targetRows: number;
  sourceCols: number;
  sourceRows: number;
}): GridItem[] => {
  const modulesById = new Map(input.modules.map((module) => [module.id, module]));
  const xScale = input.sourceCols > 0 ? input.targetCols / input.sourceCols : 1;
  const yScale = input.sourceRows > 0 ? input.targetRows / input.sourceRows : 1;
  const prepared = input.items
    .map((item) => {
      let nextWidth = clamp(
        Math.round(Math.max(1, item.w) * xScale),
        1,
        input.targetCols,
      );
      let nextHeight = clamp(
        Math.round(Math.max(1, item.h) * yScale),
        1,
        input.targetRows,
      );
      const lock = getPhotoLayoutLock(modulesById.get(item.i));

      if (lock !== null) {
        const quantized = quantizePhotoSize({
          desiredW: nextWidth,
          desiredH: nextHeight,
          maxCols: input.targetCols,
          maxRows: input.targetRows,
          lock,
        });
        nextWidth = quantized.w;
        nextHeight = quantized.h;
      }

      const maxX = input.targetCols - nextWidth;
      const maxY = input.targetRows - nextHeight;

      return {
        i: item.i,
        x: clamp(Math.round(item.x * xScale), 0, Math.max(0, maxX)),
        y: clamp(Math.round(item.y * yScale), 0, Math.max(0, maxY)),
        w: nextWidth,
        h: nextHeight,
      } satisfies GridItem;
    })
    .sort((left, right) => left.y - right.y || left.x - right.x);

  const placed: GridItem[] = [];
  for (const item of prepared) {
    const maxY = input.targetRows - item.h;
    const candidate = { ...item };

    while (candidate.y <= maxY && placed.some((placedItem) => collides(candidate, placedItem))) {
      candidate.y += 1;
    }

    if (candidate.y > maxY || placed.some((placedItem) => collides(candidate, placedItem))) {
      const openSlot = findOpenSlot(
        candidate.w,
        candidate.h,
        placed,
        input.targetCols,
        input.targetRows,
      );

      if (openSlot) {
        candidate.x = openSlot.x;
        candidate.y = openSlot.y;
      } else {
        candidate.x = 0;
        candidate.y = Math.max(0, maxY);
      }
    }

    placed.push(candidate);
  }

  return placed;
};
