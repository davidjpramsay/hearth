import { buildThemePaletteEntriesForTheme, type ThemeId } from "../theme/theme";

interface ThemePreviewStripProps {
  themeId: ThemeId;
  className?: string;
}

export const ThemePreviewStrip = ({ themeId, className = "" }: ThemePreviewStripProps) => {
  const palette = buildThemePaletteEntriesForTheme(themeId).slice(0, 6);

  return (
    <div className={`flex items-center gap-1.5 ${className}`.trim()}>
      {palette.map((entry) => (
        <span
          key={`${themeId}-${entry.slot}`}
          aria-hidden="true"
          title={entry.slot}
          className="h-3 w-6 rounded-full border border-white/10 shadow-[0_0_0_1px_rgba(2,6,23,0.18)_inset]"
          style={{
            backgroundColor: entry.hex,
          }}
        />
      ))}
    </div>
  );
};
