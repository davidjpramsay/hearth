# Module Style Guide

## Layout and frame

Use `apps/web/src/modules/ui/ModuleFrame.tsx` for new SDK modules:

- consistent title bar
- consistent loading/error/empty presentation
- status/updated indicator

For modules with richer internal layouts, prefer the shared visual primitives in `apps/web/src/index.css`:

- `.module-panel-shell` for the main inner surface
- `.module-panel-card` for inset cards and stat blocks
- `.module-panel-chip` for compact labels
- `.module-panel-progress` for progress rails
- `.module-copy-label` for compact uppercase labels and chips
- `.module-copy-meta` for helper text, timestamps, and supporting metadata
- `.module-copy-body` for normal readable copy
- `.module-copy-title` for headings and emphasized values
- `.module-copy-hero` for standout values like clocks and temperatures

Use typography roles for structure, then utility classes only for emphasis and state:

- color utilities for hierarchy and state
- prefer choosing the correct semantic role over stacking font-weight or tracking overrides on top of it
- avoid ad hoc `font-display uppercase tracking-*` stacks in module content

## Visual philosophy

- Design for calm legibility first. The information should read clearly before any decorative layer is noticed.
- Keep visual depth subtle. Use one restrained glow or gradient wash, not multiple competing effects.
- Avoid novelty badges and status chrome unless they add information the module would otherwise lose.
- Reuse the same surface, chip, card, and progress patterns across modules so the dashboard feels like one system.
- Let imagery and data carry personality. Structure, spacing, and text treatment should stay stable.

## Theme compatibility

- Build module surfaces from the shared theme tokens in `apps/web/src/index.css`, not hard-coded palette values.
- If a module needs an accent, derive it from theme tokens such as `--color-text-accent-rgb` or the status token RGB values.
- Avoid hard-coded Tailwind hue utilities and arbitrary `rgba(...)`/hex shadows for display chrome. If a module needs info, warning, success, or error emphasis, route it through the shared theme-mapped utilities in `apps/web/src/index.css` or inline CSS variables.
- Keep accent overlays low contrast so Nord, Solarized, Monokai, and the default theme all remain readable.
- Favor neutral cards and text tokens for secondary information. Accent color should highlight, not repaint the whole tile.

## Settings UX

- Keep settings panel simple and explicit.
- Use clear labels and sensible defaults.
- Clamp numeric values in schema and input handlers.
- Keep typography decisions in the module unless there is a concrete product need for a user-facing size control.
- Avoid generic global sizing sliders that try to remap every text role in a module.

## Typography

- Use a fixed, intentional hierarchy inside each module instead of exposing generic font controls.
- Prefer the shared module copy roles in `apps/web/src/index.css` over inline `fontSize` styles.
- Keep each piece of text in one of five roles: `label`, `meta`, `body`, `title`, or `hero`.
- In active runtime modules, avoid per-module `font-medium`, `font-semibold`, `uppercase`, or `tracking-*` overrides on `module-copy-*` classes unless the text is in the wrong role entirely.
- If a module needs a user-facing size option, tie it to a specific content need and make the layout impact obvious.
- Avoid one-off font fields unless the module genuinely needs that exact setting.

## Data handling

- Use `useModuleQuery` for polling.
- Use `useModuleStream` for SSE.
- Keep display components resilient to null/partial data.

## Time handling

- If a module is day-sensitive or shows household time, set `manifest.timeMode` and implement the runtime to match it.
- `site-local` modules must use `apps/web/src/runtime/display-time.ts` instead of trusting the Pi/browser clock directly.
- For site-day logic, compare calendar dates with `toCalendarDateInTimeZone(...)`, not device-local midnight math.
- If content changes at midnight, schedule a dedicated rollover refresh with `getMillisecondsUntilNextCalendarDateInTimeZone(...)` rather than waiting for the normal poll interval.
- If server time sync or site timezone changes, re-evaluate immediately through `addDisplayTimeContextListener(...)`.
- If you persist local snapshots for day-scoped content, reject snapshots from the wrong site day rather than showing stale "yesterday" content.

## Performance

- Prefer small polling intervals only when needed.
- Avoid expensive re-renders (memoize formatted values when possible).
- Keep module render trees shallow for low-power devices.

## Naming

- Module IDs must be kebab-case (`server-status`, `count-down`).
- Display names should be user-friendly.
- Keep module versions explicit in `manifest.version`.

## Example references

- UI-only: `apps/web/src/modules/sdk/welcome.module.tsx`
- Local time: `apps/web/src/modules/sdk/clock.module.tsx`
- REST + status frame: `apps/web/src/modules/sdk/server-status.module.tsx`
- Dense data layout: `apps/web/src/modules/sdk/weather.module.tsx`
- Shared panel language: `apps/web/src/modules/sdk/kobo-reader.module.tsx`
- Calendar lists/grids: `apps/web/src/modules/sdk/calendar.module.tsx`
