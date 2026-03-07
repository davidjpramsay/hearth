# Data Sources

Hearth modules can be data-free, polled, streaming, or composite.

## 1) UI-only / local state

Use SDK runtime component + local React state only.

Example:

- `apps/web/src/modules/sdk/welcome.module.tsx`

## 2) REST poll

Use `useModuleQuery(...)`:

- polling interval
- cache
- stale-while-revalidate behaviour
- unified loading/error state

Example:

- `apps/web/src/modules/sdk/server-status.module.tsx`
- endpoint: `/api/modules/server-status`

## 3) Streaming (SSE)

Use `useModuleStream(...)` with topic subscriptions.

Server endpoint:

- `/api/modules/stream?topic=<topic>`

Server event bus:

- `apps/server/src/modules/event-bus.ts`

Adapters publish topics via `eventBus.publish(topic, payload)`.

## 4) Composite

Combine multiple hooks in one module:

- one polled endpoint + one stream topic
- or multiple REST endpoints

Tip: keep one normalization layer inside the module so the UI consumes a single stable shape.

## Adapter boundary (important)

External/local integrations belong in server adapters (`apps/server/src/modules/adapters`) so:

- secrets never ship to browsers
- CORS/auth remain controlled server-side
- UI receives normalized data contracts
