# Module Style Guide

## Layout and frame

Use `apps/web/src/modules/ui/ModuleFrame.tsx` for new SDK modules:

- consistent title bar
- consistent loading/error/empty presentation
- status/updated indicator

## Settings UX

- Keep settings panel simple and explicit.
- Use clear labels and sensible defaults.
- Clamp numeric values in schema and input handlers.
- Use one shared `presentation` block for module-level sizing.
- Prefer the shared `ModulePresentationControls` UI over custom per-element font inputs.

## Presentation roles

Every active SDK module should map visible module content into these roles:

- `heading`: labels, section headings, member names, day names
- `primary`: the module's main value/content, plus small hero visuals tied to it
- `supporting`: secondary metadata, helper text, warnings, empty states, legend dots

Small non-text elements can use the same roles when they track the same visual importance:

- weather emoji -> `primary`
- calendar legend dots -> `supporting`

Avoid one-off controls like `timeFontSizeRem` or `eventTitleFontSize`. If a module needs tweakable sizing, route it through `presentation.headingScale`, `presentation.primaryScale`, or `presentation.supportingScale`.

## Data handling

- Use `useModuleQuery` for polling.
- Use `useModuleStream` for SSE.
- Keep display components resilient to null/partial data.

## Performance

- Prefer small polling intervals only when needed.
- Avoid expensive re-renders (memoize formatted values when possible).
- Keep module render trees shallow for low-power devices.

## Naming

- Module IDs must be kebab-case (`server-status`, `hello-world`).
- Display names should be user-friendly.
- Keep module versions explicit in `manifest.version`.

## Example references

- UI-only: `apps/web/src/modules/sdk/welcome.module.tsx`
- Local time: `apps/web/src/modules/sdk/clock.module.tsx`
- REST + status frame: `apps/web/src/modules/sdk/server-status.module.tsx`
- Role-sized layouts: `apps/web/src/modules/sdk/weather.module.tsx`
- Role-sized calendar lists/grids: `apps/web/src/modules/sdk/calendar.module.tsx`
