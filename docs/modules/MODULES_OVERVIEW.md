# Modules Overview

Hearth runtime is SDK-first:

- SDK modules (`@hearth/module-sdk`) are auto-discovered from `apps/web/src/modules/sdk`.
- `packages/core` only provides shared layout/registry helpers.
- No legacy module adapter or discovery shim remains in the runtime registration path.

## Current Built-In SDK Modules

- `clock`
- `calendar`
- `photos`
- `chores`
- `homeschool-planner`
- `weather`
- `bible-verse`
- `welcome`
- `count-down`
- `kobo-reader`
- `server-status`
- `local-warnings` (internal placement; not shown in the normal picker)

## Architecture Layers

1. Module SDK (`packages/module-sdk`)

- `defineModule(...)`
- typed manifest + schemas + runtime hooks
- runtime validation helpers (`validateSettings`, `validateData`)

2. Web registry abstraction (`apps/web/src/registry`)

- `UnifiedModuleRegistry` with:
  - `listModules()`
  - `getModule(id)`
  - `createInstance()`
  - `renderModuleInstance()`
- primary runtime path for SDK module registration and rendering

3. Standard data layer (`apps/web/src/modules/data`)

- `useModuleQuery(...)` for polling + cache + SWR
- `useModuleStream(...)` for SSE topic subscriptions
- `apps/web/src/runtime/display-time.ts` for synced household time / timezone on display clients

4. Module UI shell (`apps/web/src/modules/ui/ModuleFrame.tsx`)

- title bar
- status indicator
- last-updated timestamp
- loading/error/empty presentation

5. Server adapter layer (`apps/server/src/modules`)

- adapter contract (`types.ts`)
- event bus (`event-bus.ts`)
- adapter lifecycle and route registration (`service.ts`)
- routes mounted under `/api/modules/<adapter-id>`

6. Generator

- `pnpm create-module`
- scaffolds web module + optional server adapter + module README

## Photos Collection Model

- Parent photo library root is `DATA_DIR/photos`.
- Admin-defined photo collections can map to one or more subfolders under that root.
- In set-driven display, select-photo action collection (then rule/set fallbacks) is passed to Photos runtime; in single-layout mode Photos uses module settings.
- Playback/orientation state remains isolated per screen session and resolved source key.

## Runtime Flow

1. Web bootstraps `moduleRegistry` from `apps/web/src/registry/module-registry.ts`.
2. SDK modules are auto-discovered with `import.meta.glob("../modules/sdk/**/*.module.{ts,tsx}")`.
3. Admin/layout pages use one unified registry API.
4. Server adapters expose module APIs under `/api/modules/<id>` and optional stream topics.

## Example Modules

- SDK UI-only: `apps/web/src/modules/sdk/welcome.module.tsx`
- SDK local-data clock: `apps/web/src/modules/sdk/clock.module.tsx`
- SDK configurable countdown: `apps/web/src/modules/sdk/count-down.module.tsx`
- SDK REST-backed: `apps/web/src/modules/sdk/server-status.module.tsx`
- site-local rollover-safe modules:
  - `apps/web/src/modules/sdk/clock.module.tsx`
  - `apps/web/src/modules/sdk/chores.module.tsx`
  - `apps/web/src/modules/sdk/calendar.module.tsx`
  - `apps/web/src/modules/sdk/bible-verse.module.tsx`
  - `apps/web/src/modules/sdk/homeschool-planner.module.tsx`
- Server adapters:
  - `apps/server/src/modules/adapters/server-status.ts`
  - `apps/server/src/modules/adapters/kobo-reader.ts`

## Why this design

- SDK-first runtime with typed manifests/schemas
- Single source of truth for live module UI
- Clear server/client boundary for integrations and secrets
- Shared, theme-driven module surfaces keep the dashboard visually coherent across themes and module types
- AI-friendly scaffolding and strongly typed contracts
