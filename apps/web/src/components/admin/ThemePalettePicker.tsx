import { THEME_COLOR_SLOTS, type ThemeColorSlot } from "@hearth/shared";
import { getThemePaletteColorVar, getThemePaletteForegroundVar } from "../../theme/theme";

interface ThemePalettePickerProps {
  value: ThemeColorSlot;
  onChange: (slot: ThemeColorSlot) => void;
  disabled?: boolean;
  compact?: boolean;
}

export const ThemePalettePicker = ({
  value,
  onChange,
  disabled = false,
  compact = false,
}: ThemePalettePickerProps) => (
  <div className={`flex flex-wrap gap-2 ${compact ? "max-w-[18rem]" : ""}`}>
    {THEME_COLOR_SLOTS.map((slot) => {
      const selected = slot === value;

      return (
        <button
          key={slot}
          type="button"
          disabled={disabled}
          title={slot}
          aria-label={slot}
          aria-pressed={selected}
          onClick={() => onChange(slot)}
          className={`rounded-full border transition ${compact ? "h-8 w-8" : "h-10 w-10"} ${
            selected
              ? "border-cyan-300 ring-2 ring-cyan-300/40"
              : "border-slate-600 hover:border-slate-300"
          } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
          style={{
            backgroundColor: getThemePaletteColorVar(slot),
            color: getThemePaletteForegroundVar(slot),
          }}
        >
          <span className="sr-only">{slot}</span>
          {selected ? "•" : ""}
        </button>
      );
    })}
  </div>
);
