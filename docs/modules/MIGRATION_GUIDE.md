# Migration Guide: Legacy -> SDK

This project is now SDK-first.

Current runtime status:

- `apps/web/src/modules/sdk` is the only active module registration path.
- `packages/core/src/modules/index.ts` is intentionally empty, so `@hearth/core` stays registry/layout-only.
- Legacy module source files have been removed from this repo; use git history if you need to inspect old implementations.
- Compatibility code still exists in a few non-module areas for old data/layout formats:
  - settings/layout normalization
  - legacy photo folder-path handling
  - older SQLite/database bootstrap paths

## Legacy module today

Legacy module UI no longer lives in the codebase. The active contract is the SDK contract under `apps/web/src/modules/sdk`.

## Migration strategy

Migrate one module at a time.

1. Build SDK equivalent in `apps/web/src/modules/sdk/<name>.module.tsx`.
2. Keep the same id when replacing a legacy module so stored layouts continue to resolve.
3. Validate layout/editor/display behaviour.
4. Leave `packages/core/src/modules/index.ts` empty so runtime stays SDK-only.
5. Remove any leftover compatibility helpers once stored data no longer depends on them.

## Suggested migration order

1. Simple UI modules (`welcome`, `clock`)
2. REST modules (`weather`, `bible-verse`)
3. Complex stateful modules (`photos`, `calendar`, `chores`)

Current SDK module examples in this repo:

- `clock` -> `apps/web/src/modules/sdk/clock.module.tsx`
- `weather` -> `apps/web/src/modules/sdk/weather.module.tsx`
- `bible-verse` -> `apps/web/src/modules/sdk/bible-verse.module.tsx`
- `welcome` -> `apps/web/src/modules/sdk/welcome.module.tsx`
- `calendar` -> `apps/web/src/modules/sdk/calendar.module.tsx`
- `photos` -> `apps/web/src/modules/sdk/photos.module.tsx`
- `chores` -> `apps/web/src/modules/sdk/chores.module.tsx`
- `count-down` -> `apps/web/src/modules/sdk/count-down.module.tsx` (SDK-native; no legacy predecessor)

## Regression checks

After each migrated module:

- module visible in admin palette
- settings panel persists values
- dashboard render works in display mode
- no layout save/load regressions
