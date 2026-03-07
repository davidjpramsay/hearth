import { ChangeEvent, useEffect, useState } from "react";
import {
  THEME_OPTIONS,
  applyTheme,
  getActiveThemeId,
  subscribeToThemeChanges,
  type ThemeId,
} from "../theme/theme";

interface ThemePickerProps {
  className?: string;
  label?: string;
}

export const ThemePicker = ({
  className = "min-w-[180px]",
  label = "Theme",
}: ThemePickerProps) => {
  const [activeThemeId, setActiveThemeId] = useState<ThemeId>(() => getActiveThemeId());

  useEffect(() => subscribeToThemeChanges(setActiveThemeId), []);

  const onThemeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextThemeId = applyTheme(event.target.value);
    setActiveThemeId(nextThemeId);
  };

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </label>
      <select
        value={activeThemeId}
        onChange={onThemeChange}
        aria-label="Theme"
        className="h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm font-semibold text-slate-100 outline-none transition focus:border-cyan-500"
      >
        {THEME_OPTIONS.map((theme) => (
          <option key={theme.id} value={theme.id}>
            {theme.label}
          </option>
        ))}
      </select>
    </div>
  );
};
