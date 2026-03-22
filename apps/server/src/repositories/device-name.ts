export const MAX_DEVICE_NAME_LENGTH = 80;

export class DuplicateDeviceNameError extends Error {
  constructor(message = "Device name must be unique") {
    super(message);
    this.name = "DuplicateDeviceNameError";
  }
}

export const normalizeDeviceName = (value: string): string => value.trim().toLowerCase();
const normalizeGeneratedDeviceLabel = (value: string | null | undefined): string | null => {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized.slice(0, MAX_DEVICE_NAME_LENGTH) : null;
};

const formatDeviceCode = (deviceId: string): string => {
  const compact = deviceId
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  if (compact.length >= 8) {
    return `${compact.slice(0, 4)}-${compact.slice(4, 8)}`;
  }

  if (compact.length > 0) {
    return compact.slice(0, 8);
  }

  return "DEVICE";
};

export const buildDefaultDeviceName = (deviceId: string, preferredLabel?: string | null): string =>
  normalizeGeneratedDeviceLabel(preferredLabel) ??
  `Display ${formatDeviceCode(deviceId)}`.slice(0, MAX_DEVICE_NAME_LENGTH);

export const toUniqueDeviceName = (baseName: string, usedNames: Set<string>): string => {
  const trimmedBase = baseName.trim();
  const normalizedBase = trimmedBase.length > 0 ? trimmedBase : "Display";
  const cappedBase = normalizedBase.slice(0, MAX_DEVICE_NAME_LENGTH);

  let candidate = cappedBase;
  let suffixCounter = 2;

  while (usedNames.has(normalizeDeviceName(candidate))) {
    const suffix = ` (${suffixCounter})`;
    const maxBaseLength = Math.max(1, MAX_DEVICE_NAME_LENGTH - suffix.length);
    candidate = `${cappedBase.slice(0, maxBaseLength).trimEnd()}${suffix}`;
    suffixCounter += 1;
  }

  return candidate;
};
