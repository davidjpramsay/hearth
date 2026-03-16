# Adding a Module

## Fast path (recommended)

Run:

```bash
pnpm create-module
```

It prompts for:

- module name
- display name
- module type (`ui-only`, `rest-poll`, `streaming`, `composite`)
- whether to include a server adapter

Generated files:

- `apps/web/src/modules/sdk/<module-id>.module.tsx`
- `apps/web/src/modules/sdk/<module-id>.README.md`
- optional: `apps/server/src/modules/adapters/<module-id>.ts`
- optional adapter registration update in `apps/server/src/modules/adapters/index.ts`

## Auto-discovery

Web SDK modules are discovered automatically by:

- `apps/web/src/registry/module-registry.ts`
- `import.meta.glob("../modules/sdk/**/*.module.{ts,tsx}")`

No manual registry edits needed for web modules.

## Manual path

1. Create SDK module file under `apps/web/src/modules/sdk`.
2. Define `settingsSchema` with the smallest plain `z.object(...)` that matches the module's real configuration.
3. Export default `defineModule({...})`.
4. Add `admin.SettingsPanel` if configurable.
5. Keep typography/layout choices inside the module unless there is a specific, defensible reason to expose a setting.
6. If server-backed, add adapter in `apps/server/src/modules/adapters`.
7. Register adapter in `apps/server/src/modules/adapters/index.ts`.
8. Run `pnpm -r build`.

## Verify

- `pnpm --filter @hearth/web build`
- `pnpm --filter @hearth/server build`
- `pnpm --filter @hearth/web test`
- open `/admin` and confirm module appears in palette
