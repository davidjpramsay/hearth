# Historical Migration Notes

Runtime module migration is complete.

Current state:

- `apps/web/src/modules/sdk` is the only active runtime module path.
- `packages/core` no longer carries module source files or discovery stubs.
- Old module implementations are intentionally absent from the repo; use git history if you need to inspect them.

The remaining compatibility code in Hearth is data-shape/bootstrap support, not runtime module legacy. It currently exists only where old installs may still need it:

- settings/layout normalization
- legacy photo folder-path data
- older SQLite/data-dir bootstrap paths

## If you touch an old compatibility path

Only keep it if it still protects real persisted data or live deployments.

1. Confirm the path is for persisted data/bootstrap migration, not old runtime module wiring.
2. Add or keep a regression test around the migrated shape.
3. Remove the helper once the repo no longer needs to read or normalize that older shape.

## Active SDK module examples

- `clock` -> `apps/web/src/modules/sdk/clock.module.tsx`
- `weather` -> `apps/web/src/modules/sdk/weather.module.tsx`
- `bible-verse` -> `apps/web/src/modules/sdk/bible-verse.module.tsx`
- `welcome` -> `apps/web/src/modules/sdk/welcome.module.tsx`
- `calendar` -> `apps/web/src/modules/sdk/calendar.module.tsx`
- `photos` -> `apps/web/src/modules/sdk/photos.module.tsx`
- `chores` -> `apps/web/src/modules/sdk/chores.module.tsx`
- `count-down` -> `apps/web/src/modules/sdk/count-down.module.tsx`
- `kobo-reader` -> `apps/web/src/modules/sdk/kobo-reader.module.tsx`

## Final regression checks

- module visible in admin palette when placement is not internal
- settings panel persists values
- dashboard render works in display mode
- no layout save/load regressions
