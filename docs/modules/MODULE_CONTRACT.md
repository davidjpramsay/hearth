# Module Contract

The SDK contract is defined in `packages/module-sdk`.

## Minimal module

```tsx
import { z } from "zod";
import { defineModule } from "@hearth/module-sdk";

export default defineModule({
  manifest: {
    id: "example-widget",
    name: "Example widget",
    version: "1.0.0",
    defaultSize: { w: 4, h: 3 },
  },
  settingsSchema: z.object({
    title: z.string().default("Example"),
  }),
  runtime: {
    Component: ({ settings }) => <div>{settings.title}</div>,
  },
});
```

## SDK Types

- `ModuleManifest`
  - `id` (kebab-case, unique)
  - `name`
  - `version`
  - optional: `description`, `icon`, `categories`, `permissions`, `dataSources`
- `ModuleContext`
- `ModuleRuntime<TSettings, TData>`
- `ModuleDefinition<TSettingsSchema, TDataSchema>`
- `ModuleInstance<TSettings, TData>`
- `ModuleSettings<T>`
- `ModuleData<T>`

## Runtime hooks

Optional hooks in `runtime`:

- `onInit(context)`
- `onDispose(context)`
- `getInitialData(context)`
- `refresh(context, previousData)`
- `subscribe(context, emit)`

## Validation helpers

- `validateSettings(moduleDef, unknownInput)`
- `validateData(moduleDef, unknownInput)`

These ensure settings/data are schema-safe at runtime.

## Layout Logic SDK

`@hearth/module-sdk` also exports `createLayoutLogicRegistry(...)` for custom
layout logic actions and conditions.

Definitions support schema-driven parameters:

- `paramsSchema`: Zod schema for persisted params.
- `paramFields`: inspector controls (`text`, `number`, `boolean`, `select`).

This lets third-party actions/conditions define typed params that are validated
before runtime execution.

Built-in layout-logic ids are defined in `@hearth/shared`
(`packages/shared/src/layout-logic-registry.ts`) so web inspector options and
server runtime behavior stay aligned.

## Admin settings UI

SDK modules can provide admin settings UI through `admin.SettingsPanel`.

Real examples:

- `apps/web/src/modules/sdk/welcome.module.tsx`
- `apps/web/src/modules/sdk/clock.module.tsx`
- `apps/web/src/modules/sdk/server-status.module.tsx`
- `apps/web/src/modules/sdk/weather.module.tsx`
- `apps/web/src/modules/sdk/calendar.module.tsx`
