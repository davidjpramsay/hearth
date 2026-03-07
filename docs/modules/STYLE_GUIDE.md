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
