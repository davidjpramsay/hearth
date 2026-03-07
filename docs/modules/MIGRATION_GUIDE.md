# Migration Guide: Legacy -> SDK

This project is now SDK-first.

## Legacy module today

Legacy modules live in:

- `packages/core/src/modules/*.tsx`

Legacy contract:

- `@hearth/shared` `ModuleDefinition`
- fields: `id`, `displayName`, `defaultSize`, `configSchema`, `DashboardTile`, `SettingsPanel`

## Migration strategy

Migrate one module at a time.

1. Build SDK equivalent in `apps/web/src/modules/sdk/<name>.module.tsx`.
2. Keep the same id when replacing a legacy module so stored layouts continue to resolve.
3. Validate layout/editor/display behaviour.
4. When ready, retire the legacy export from `packages/core/src/modules/index.ts` or leave it as reference-only code.

## Suggested migration order

1. Simple UI modules (`welcome`, `clock`)
2. REST modules (`weather`, `bible-verse`)
3. Complex stateful modules (`photos`, `calendar`, `chores`)

Current migrated examples in this repo:

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
