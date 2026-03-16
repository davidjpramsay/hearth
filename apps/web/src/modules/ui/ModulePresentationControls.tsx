import type { ModulePresentationSettings } from "@hearth/shared";

// Keep the export stable while role sizing is retired from module settings.
export const scaleRoleRem = (baseRem: number, _scale?: number): string =>
  `${baseRem.toFixed(3).replace(/\.?0+$/, "")}rem`;

interface ModulePresentationControlsProps {
  value: ModulePresentationSettings;
  onChange: (next: ModulePresentationSettings) => void;
}

export const ModulePresentationControls = ({
  value: _value,
  onChange: _onChange,
}: ModulePresentationControlsProps) => {
  return null;
};
