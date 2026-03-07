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
2. Export default `defineModule({...})`.
3. Add `admin.SettingsPanel` if configurable.
4. If server-backed, add adapter in `apps/server/src/modules/adapters`.
5. Register adapter in `apps/server/src/modules/adapters/index.ts`.
6. Run `pnpm -r build`.

## Verify

- `pnpm --filter @hearth/web build`
- `pnpm --filter @hearth/server build`
- open `/admin` and confirm module appears in palette
