const LAYOUT_NAME_MAX_LENGTH = 80;

const normalizeNameKey = (value: string): string => value.trim().toLowerCase();

const clampBaseWithSuffix = (baseName: string, suffix: string): string => {
  const cleanedBase = baseName.trim();
  const allowedBaseLength = Math.max(1, LAYOUT_NAME_MAX_LENGTH - suffix.length);
  const truncatedBase = cleanedBase.slice(0, allowedBaseLength).trimEnd();
  return `${truncatedBase.length > 0 ? truncatedBase : "Layout"}${suffix}`;
};

export const buildDuplicateLayoutName = (input: {
  sourceName: string;
  existingNames: string[];
}): string => {
  const baseName = input.sourceName.trim().length > 0 ? input.sourceName : "Layout";
  const usedNames = new Set(input.existingNames.map(normalizeNameKey));

  let copyIndex = 1;
  while (copyIndex <= 1000) {
    const suffix = copyIndex === 1 ? " (copy)" : ` (copy ${copyIndex})`;
    const candidate = clampBaseWithSuffix(baseName, suffix);
    if (!usedNames.has(normalizeNameKey(candidate))) {
      return candidate;
    }
    copyIndex += 1;
  }

  const timestampSuffix = ` (${Date.now().toString(36)})`;
  return clampBaseWithSuffix(baseName, timestampSuffix);
};
