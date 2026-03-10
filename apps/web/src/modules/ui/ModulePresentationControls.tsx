import {
  MODULE_PRESENTATION_SCALE_MAX,
  MODULE_PRESENTATION_SCALE_MIN,
  MODULE_PRESENTATION_SCALE_STEP,
  clampModulePresentationScale,
  type ModulePresentationSettings,
} from "@hearth/shared";

const scaleFieldMeta = [
  {
    key: "headingScale",
    label: "Heading size",
  },
  {
    key: "primaryScale",
    label: "Primary size",
  },
  {
    key: "supportingScale",
    label: "Supporting size",
  },
] as const satisfies ReadonlyArray<{
  key: keyof ModulePresentationSettings;
  label: string;
}>;

const formatScaleLabel = (value: number): string => `${Math.round(value * 100)}%`;

export const scaleRoleRem = (baseRem: number, scale: number): string =>
  `${(baseRem * clampModulePresentationScale(scale, 1)).toFixed(3).replace(/\.?0+$/, "")}rem`;

interface ModulePresentationControlsProps {
  value: ModulePresentationSettings;
  onChange: (next: ModulePresentationSettings) => void;
}

export const ModulePresentationControls = ({
  value,
  onChange,
}: ModulePresentationControlsProps) => {
  const updateScale = (
    key: keyof ModulePresentationSettings,
    nextValue: string,
  ): void => {
    onChange({
      ...value,
      [key]: clampModulePresentationScale(Number.parseFloat(nextValue), value[key]),
    });
  };

  return (
    <div className="space-y-3 rounded border border-slate-700/80 bg-slate-950/40 p-3">
      <div>
        <p className="font-medium text-slate-100">Role sizing</p>
        <p className="text-xs text-slate-400">
          100% keeps the current default sizing for text, icons, emoji, and small visuals.
        </p>
      </div>

      {scaleFieldMeta.map((field) => (
        <label key={field.key} className="block space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <span>{field.label}</span>
            <span className="text-xs text-slate-400">
              {formatScaleLabel(value[field.key])}
            </span>
          </div>
          <input
            className="w-full accent-cyan-400"
            type="range"
            min={MODULE_PRESENTATION_SCALE_MIN}
            max={MODULE_PRESENTATION_SCALE_MAX}
            step={MODULE_PRESENTATION_SCALE_STEP}
            value={value[field.key]}
            onChange={(event) => updateScale(field.key, event.target.value)}
          />
        </label>
      ))}

      <p className="text-xs text-slate-500">
        Roles stay the same across modules, but each module only maps the elements it uses.
      </p>
    </div>
  );
};
