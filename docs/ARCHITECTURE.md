# Architecture

## Runtime Model

Hearth has two runtime surfaces:

- `Admin` (`/admin`): authenticated layout and module configuration
- `Display` (`/`): kiosk rendering of the active layout

The display surface is intentionally read-only and light-weight.

## Package Boundaries

### `packages/shared`

Shared API and module contracts using Zod.

- Request/response schemas
- Layout schemas
- Module config schemas
- Shared TypeScript types

Rule: **schema changes start here first**.

### `packages/core`

Shared layout and registry helpers.

- Shared layout helpers used by web/server
- No runtime module UI lives here

### `apps/server`

Fastify backend and persistence.

- SQLite repositories
- Auth and admin APIs
- Module backend endpoints (calendar, photos, weather, chores, bible verse)
- SSE broadcast endpoint (`/api/events/layouts`) for layout, chores, and device updates

### `apps/web`

React frontend with two routes:

- Admin pages (`/admin/*`)
- Dashboard display (`/`)

## Data Flow

### Display

1. Browser loads `/`
2. Uses a stable device id persisted in browser storage
3. Reports photo orientation, device id, and current bootstrap state to `/api/display/screen-profile/report`
4. Server registers or looks up that device, applies server-managed theme/routing, and resolves a layout for that specific display
5. Browser applies the resolved theme and renders module tiles from registry
6. Subscribes to `/api/events/layouts` (SSE)
7. Re-resolves layout on `layout-updated`, `display-device-updated`, resize, photo orientation changes, and auto-cycle ticks
8. Publishes active display context (`set` vs `layout`) including active cycle seconds and resolved photo collection id

### Admin

1. Admin auth token from `/api/auth/login`
2. CRUD layout/module config via `/api/layouts*`
3. Manage per-device theme/routing via `/api/display/devices*`
4. On save/activate/update, server publishes SSE updates
5. Display clients re-render automatically

## Layout Switching

Current behavior:

- Per-screen routing is server-managed through a persisted device record:
  - `targetSelection.kind = "set"` to follow a layout set
  - `targetSelection.kind = "layout"` to pin one layout directly
- Existing `targetSelection = null` records are treated as a compatibility fallback and resolve through the first available set before the layout fallback chain.
- Per-screen theme is also server-managed on that same device record.
- In set mode:
  - admin authoring is stored as `logicBlocks` (currently a `photo-router` block graph with layout nodes, connections, and node positions)
  - the server resolves sequence from the compiled set `logicGraph`
  - photo orientation influences `if-portrait` / `if-landscape` conditions
  - cycle time advances in round-robin order per screen session
  - the selected rule's `cycleSeconds` is treated as the effective slide interval for Photos modules in that active layout
  - the selected photo collection is resolved by precedence:
    - select-photo action collection (`photoActionCollectionId` on the set)
    - rule action override (`photoCollectionId`)
    - `/photos` library root (default)
- In single-layout mode:
  - set logic is bypassed and the selected layout is returned directly
  - Photos modules use their own configured slide interval
- Set mapping is stored in `settings.screen_profile_layouts` and references **unique layout names**.
- Device overrides are stored in the `devices` table and keyed by stable device id.
- Admin set editor includes a compact runtime status check and test-path simulation using the same compiled graph the display runtime executes.
- `switchMode` is normalized to `auto` for compatibility; manual mode is no longer used.
- Global `active` layout is still maintained as fallback if a routing target is missing.
- Display layout swaps are currently immediate (no fade animation pipeline).

## PWA + Fullscreen Surface

- Web app ships with a manifest + service worker via Vite PWA plugin.
- iPad fullscreen behavior is supported through Safari `Add to Home Screen` standalone launch.
- Display and admin shells apply safe-area padding (`env(safe-area-inset-*)`) for edge-safe rendering.

## Chores Domain Model

- Chores are defined once and scheduled by type (`daily`, `weekly`, `specific-days`, `one-off`).
- Completion records are stored per `(chore_id, completion_date)`.
- Recurring chores are **not retrospective**:
  - they only appear from their explicit `startsOn` date onward.
- The dashboard chores tile is single-day:
  - it renders today's chores only and does not expose a multi-day preview setting.
- Chores use a configurable household `siteTimezone` for "today", week boundaries, and payout windows.
- Weekly summaries are computed against a configurable `paydayDayOfWeek` setting:
  - `weekStart = payday + 1`
  - `weekEnd = payday`
  - default payday is Saturday (`6`), so default week is Sunday -> Saturday.

## Module Time Semantics

- `device-local` modules read the display/browser clock directly:
  - `clock`
  - `count-down`
- `site-local` modules use the shared household `siteTimezone` stored in settings:
  - `chores`
  - `bible-verse`
- `local-warnings` is an internal SDK module:
  - it powers the automatic full-screen warning layout and is not shown in the normal module picker
- `source-local` modules follow the upstream data source timezone semantics:
  - `weather` uses the provider/location timezone
  - `calendar` preserves feed/all-day date semantics from the source

## Default Bootstrap State

When no layouts exist, app bootstrap seeds:

- `16:9 Standard Landscape` (active)
- `16:9 Standard Portrait`

And seeds one ready-to-use routing set:

- `set-1` (`16:9 Family Set`) with a `Photo Orientation` action node graph:
  - select next photo
  - portrait -> `16:9 Standard Portrait`
  - fallback -> `16:9 Standard Landscape`
- Portrait starter layout includes `count-down` and `bible-verse` tiles alongside clock/weather/photos/calendar/chores.
- Additional sets and logic are created in Admin as needed.

No personal calendar URLs are included in seeded module settings.
This bootstrap path only runs on fresh databases with zero layouts.

## Persistence

Primary tables:

- `layouts`
- `layout_versions`
- `settings`
- `devices`
- `module_state`
- `module_configs`
- `members`
- `chores`
- `chore_completions`

Notable constraints:

- One active layout at a time (`idx_layout_active`)
- Layout names unique case-insensitively (`idx_layout_name_unique_nocase`)

### Data At Rest Defaults

- Default data directory is `~/.hearth` for new installs.
- If an existing legacy `./data` DB exists, it is reused.
- `DEFAULT_SITE_TIMEZONE` can provide a deployment-level fallback for site-local modules until the household timezone is saved in settings.
- Calendar source URLs in layout configs are encrypted before storage.
- Existing plaintext calendar URLs are migrated to encrypted format on startup.
- Secrets are generated automatically when not provided:
  - `DATA_DIR/.jwt-secret`
  - `DATA_DIR/.calendar-key`
- Rolling DB backups are written to `DATA_DIR/backups`.

## Code Organization Rules

- Keep request parsing/validation at route boundaries.
- Keep DB logic in repository classes.
- Keep external API/cache logic in services.
- Keep `packages/shared/src` TypeScript-only (generated outputs in `dist/` only).
- Avoid cross-layer imports from web -> server.

## Build + Release

- `pnpm build` compiles all workspaces
- Production server serves `apps/web/dist` when present
- Container image runs server + bundled web static assets

## Network + Ports

- Runtime/install mode (`pnpm start`, Docker):
  - single server on port `3000`
  - default bind host is `0.0.0.0` (`HOST` env), so LAN access is `http://<server-lan-ip>:3000`
- Dev mode (`pnpm dev`):
  - API still runs on `3000`
  - Vite web dev server runs on `5173` (dev-only)
- Port `5173` is never required for production/installed deployments.
