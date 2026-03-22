# Hearth

Hearth is a self-hosted family dashboard for a wall display or kiosk browser.

It is built to run on low-power hardware (Raspberry Pi / mini PCs) and provides:

- Visual layout editor (`/admin`)
- Devices admin for per-display theme + routing assignment
- Fullscreen display dashboard (`/`)
- Modular tiles (Photos, Calendar, Clock, Chores, Weather, Bible verse, Welcome, Count Down, Kobo Reader)
- SQLite persistence
- Live layout updates via SSE
- Automatic encrypted calendar-source storage in the database
- Automatic rolling SQLite backups
- Chores weekly tracking with configurable payday boundaries

## Monorepo Structure

- `apps/server`: Fastify API + SQLite + module backends
- `apps/web`: React admin + display app
- `packages/shared`: shared contracts (Zod schemas + TS types)
- `packages/core`: shared layout + registry helpers used by web/server
- `packages/module-sdk`: typed SDK for runtime modules

## Documentation

- [Deployment Guide](docs/DEPLOYMENT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Performance Guide](docs/PERFORMANCE.md)
- [Roadmap](docs/ROADMAP.md)
- [Synology Checklist](docs/SYNOLOGY_CHECKLIST.md)
- [Synology Deployment](docs/SYNOLOGY_DEPLOYMENT.md)
- [Synology Update Routine](docs/SYNOLOGY_UPDATE.md)
- [Image Publishing](docs/IMAGE_PUBLISHING.md)
- [Modules Overview](docs/modules/MODULES_OVERVIEW.md)
- [Module Contract](docs/modules/MODULE_CONTRACT.md)
- [Adding a Module](docs/modules/ADDING_A_MODULE.md)
- [Data Sources](docs/modules/DATA_SOURCES.md)
- [Historical Migration Notes](docs/modules/MIGRATION_GUIDE.md)
- [Layout Logic Customization](docs/modules/LAYOUT_LOGIC_CUSTOMIZATION.md)
- [Module Security](docs/modules/SECURITY.md)
- [Module Style Guide](docs/modules/STYLE_GUIDE.md)

## Building Modules

Hearth runtime is SDK-first.

- Active modules are auto-discovered from `apps/web/src/modules/sdk/*`.
- `packages/core` no longer carries runtime module implementations or discovery stubs; it stays focused on shared layout/registry helpers.
- The web registry resolves module listing/rendering locally in the web app.
- Server integrations are handled by adapters in `apps/server/src/modules/adapters/*`.

Create a new module scaffold:

```bash
pnpm create-module
```

Then verify:

```bash
pnpm -r build
pnpm --filter @hearth/web test
pnpm --filter @hearth/server test
pnpm --filter @hearth/module-sdk test
pnpm test:e2e
```

Browser smoke coverage uses Playwright and boots a clean local Hearth server against a disposable
`.tmp/e2e-data` directory. On a fresh machine, install the browser once with:

```bash
pnpm exec playwright install chromium
```

## Recent Changelog

- March 19, 2026: hardened admin 401 recovery so expired/invalid stored tokens are cleared and redirected back to `/admin/login`, and reset display bootstrap state on device updates so deleted displays do not resurrect stale routing on re-checkin.
- March 19, 2026: added shared build-update detection so admin pages now show a reload prompt when a newer bundle is deployed, while the dashboard display path still auto-reloads itself.
- March 19, 2026: added Playwright browser smoke coverage for admin login/logout, first-run display registration, and admin layout creation against a clean local test server.
- March 19, 2026: removed the last dead `@hearth/core` discovery/module stub path and the unused `hello-world` demo adapter; remaining compatibility code is now limited to real data/bootstrap migrations rather than runtime module legacy.
- March 19, 2026: workspace build scripts now clear `dist/` before recompiling so deleted files do not linger in deploy artifacts.
- March 18, 2026: unified active module typography around shared `module-copy-*` roles (`label`, `meta`, `body`, `title`, `hero`) and removed the retired legacy module sources from `packages/core/src/modules/*`.
- March 10, 2026: all active SDK modules now share a minimal `presentation` settings block (`heading`, `primary`, `supporting`) for clean per-module sizing, and the old clock-specific time/date font-size controls were removed.
- March 9, 2026: Layout Sets now use a visual action-node graph with draggable layout nodes and `Photo Orientation` nodes, backed by persisted `logicBlocks` that compile into the runtime `logicGraph`; the old primitive free-form canvas path is removed.
- March 8, 2026: photo image responses now send long-lived immutable cache headers, allowing cache-capable kiosk browsers to reuse already-loaded images on repeat views instead of refetching them each time.
- March 6, 2026: added SDK `count-down` module with date/time countdown modes, completion pulse effect, and resilient empty-event fallback rendering.
- March 6, 2026: Bible Verse module now centers short verses and uses one-way looped slow-scroll for long verses with fixed heading/footer.
- March 5, 2026: set-driven display now publishes effective cycle context so Photos modules follow set rule timers in `Layout Set` mode and use module slide interval in `Single Layout` mode.
- March 5, 2026: calendar module event cards now use stronger full-color fills in list/week/month views, with updated header labeling (`Upcoming` for list/week, current month name for month view).
- March 2, 2026: Bible Verse module switched to `api.esv.org` (ESV provider) with server-side API key support.
- March 2, 2026: migrated the initial built-in modules to SDK-backed live modules with runtime registration moved fully into the web app.
- March 2, 2026: added a future-proof module platform with `@hearth/module-sdk`, typed manifests/schemas, lifecycle hooks, and runtime validators.
- March 2, 2026: introduced the unified web module registry and SDK auto-discovery.
- March 2, 2026: added standard module data hooks (`useModuleQuery`, `useModuleStream`) and reusable SDK `ModuleFrame` UI shell.
- March 2, 2026: introduced server module adapter layer (`apps/server/src/modules`) with REST + SSE support for server-backed modules.
- March 2, 2026: added module scaffolding generator (`pnpm create-module`) and baseline tests for SDK validation, registry listing, and adapter response validation.
- March 1, 2026: migrated auto layout rotation to a single shared cycle clock (`autoCycleSeconds`) so all auto targets rotate consistently, including layouts without Photos modules.
- March 1, 2026: extracted shared grid/quantization logic into `apps/web/src/layout/grid-math.ts` and wired both dashboard + layout editor to it to reduce layout drift regressions.
- March 1, 2026: prevented no-photo/placeholder frames from emitting orientation events (avoids false portrait/landscape switches).
- March 1, 2026: hardened layout editor autosave to ignore stale save responses (prevents newer edits being overwritten by slower network responses).
- March 1, 2026: improved runtime robustness with safer SSE event fan-out and stricter photo path containment checks.

## Quick Start

1. Install:

```bash
pnpm install
```

2. Run in dev mode:

```bash
cp .env.example .env
pnpm dev
```

- API (dev backend): `http://localhost:3000`
- Web dev server (dev-only): `http://localhost:5173`

3. Production build:

```bash
cp .env.example .env
pnpm build
pnpm start
```

- Installed/runtime URL: `http://<your-server-LAN-IP>:3000`
- In install/runtime mode, `5173` is not used.
- On a brand-new install, set `ADMIN_PASSWORD` before first start so the server can initialize the stored admin password hash securely.

## Deployment Options

Hearth can be deployed in multiple ways:

- Native Node on Linux / mini PC / Raspberry Pi class hardware
- Generic Docker or `docker compose`
- Published container images from GitHub Container Registry
- Synology Container Manager
- Other Docker-based platforms such as Portainer, Unraid, or CasaOS using the image-based compose setup

Use:

- `.env.example` + `docker-compose.yml` for normal Docker deployments that pull the published image
- `.env.example` + `docker-compose.build.yml` for advanced source-build container deployments
- `.env.synology.example` + `docker-compose.synology.yml` for Synology
- [Deployment Guide](docs/DEPLOYMENT.md) for the full overview
- [Synology Deployment](docs/SYNOLOGY_DEPLOYMENT.md) if Synology is your target
- [Synology Update Routine](docs/SYNOLOGY_UPDATE.md) for repeat deploys after the first install
- [Image Publishing](docs/IMAGE_PUBLISHING.md) for the GitHub Actions release workflow

## Kobo Reader Setup

The `Kobo Reader` module reads Calibre-Web Kobo sync data from the Calibre-Web
`app.db` file and joins it to the Calibre library `metadata.db` + cover files.

- Mount the Calibre-Web config folder read-only into the Hearth container.
- Mount the Calibre library folder read-only into the Hearth container.
- Set `KOBO_READER_APP_DB_PATH`, `KOBO_READER_LIBRARY_DB_PATH`, and `KOBO_READER_LIBRARY_ROOT` to the in-container paths.
- Synology example mounts are included in `docker-compose.synology.yml`.

## Container Releases

Hearth now supports an image-first deployment workflow.

- GitHub Actions publishes `ghcr.io/davidjpramsay/hearth:latest` from `main`
- version tags such as `v0.1.0` publish versioned container tags
- Synology and generic Docker installs can pull new versions without rebuilding from source
- local development remains source-based with `pnpm dev`, `pnpm build`, and `pnpm start`

## Access + Ports

- `3000`:
  - runtime server (`pnpm start`, Docker)
  - serves the built web app + API from one process
  - native/default bind is `127.0.0.1`, so local `pnpm start` stays on the same machine unless you opt in
  - Docker compose files still set `HOST=0.0.0.0` for LAN/kiosk deployments
- `5173`:
  - Vite web dev server only (`pnpm dev`)
  - not used for installed/runtime deployments
- To allow LAN devices to reach a native install, set `HOST=0.0.0.0`.
- To keep a Docker install localhost-only, publish `127.0.0.1:3000:3000` instead of `3000:3000`.
- Do not expose port `3000` directly to the internet. Hearth's display routes are intentionally unauthenticated for kiosk screens.

## Fullscreen / Kiosk Setup (Best Practice)

Hearth now ships as a PWA (`manifest + service worker + Apple web-app meta tags`), so it can run without browser chrome when launched as an installed app.

Recommended setup by device:

- iPad (Safari):
  - Open Hearth in Safari.
  - Share -> `Add to Home Screen`.
  - Launch from the new Home Screen icon (not from a Safari tab).
  - Result: standalone fullscreen with safe-area handling.
  - If you want the iPad screen to stay on indefinitely, use iPad kiosk settings such as Guided Access / Auto-Lock rather than relying on the web app.
- Android (Chrome):
  - Menu -> `Install app` (or `Add to Home screen`).
  - Launch from the installed app icon for standalone fullscreen.
- Desktop Chrome / Edge:
  - Install as app from the address bar (`Install`) or menu.
  - For hard kiosk mode, launch browser with `--kiosk <url>`.
- Firefox:
  - PWA install support is limited.
  - Use browser fullscreen (`F11`) or OS/device kiosk mode.

Notes:

- For non-local networks, serve Hearth over HTTPS for reliable install behavior.
- iPad standalone mode only applies when launched from Home Screen, not from an open browser tab.

## Display + Layout Modes

- Display routing is per-screen and server-managed from Admin > Devices.
- Devices register automatically after they open `/` once, then can be renamed and managed remotely.
- Each device has two routing modes:
  - `Layout Set`: follow one specific set and that set's logic graph
  - `Single Layout`: pin one specific layout (no set logic)
- Each device also has its own theme selection in Admin > Devices.
- The display surface no longer exposes a local settings cog for routing/theme changes.
- Set mode behavior:
  - each set runs its configured logic/cycle rules
  - action-node graph connections and node positions are persisted in `logicBlocks`, so the saved graph arrangement is retained
  - photo orientation can influence rule branches, but does not force set selection
  - the active set rule timer (`cycleSeconds`) controls layout dwell time and overrides Photos module slide interval while that layout is active
  - photo collection selection in set mode resolves as:
    - select-photo action collection (per set)
    - rule override (`photoCollectionId` on the selected display rule, legacy fallback)
    - `/photos` library root (default)
- Single-layout mode behavior:
  - set logic is bypassed
  - Photos module slide rotation uses the module's own `Slide interval (seconds)` setting
- In Admin > Layouts, each set includes a compact runtime status indicator and test-path simulation based on the same logic used by display runtime.
- Photo collections:
  - managed in Admin > Layouts > Photo Collections
  - each collection can include multiple folders
  - folders are resolved under the parent library root: `DATA_DIR/photos/<folder>`
- Device changes made in Admin > Devices are pushed to open displays through SSE and applied on the next layout resolve.
- Photos playback sequencing is scoped per device/session:
  - devices do not advance each other's "next photo" state, even with the same folder/shuffle settings
  - on one device, sequence continuity is preserved across layout/set switches
- Layout switching is currently instant (fade transitions are disabled by default).

## Default App Seed

On a brand-new database, Hearth seeds two starter layouts:

- `16:9 Standard Landscape` (active)
- `16:9 Standard Portrait`

Default layout-set routing starts with one ready-to-use set:

- `set-1` (`16:9 Family Set`) uses one `Photo Orientation` action node graph:
  - select next photo from `/photos`
  - if portrait -> `16:9 Standard Portrait` for 20s
  - otherwise -> `16:9 Standard Landscape` for 20s
- Additional sets and logic can be created in Admin.

Note: this seed is only used when the database has no layouts yet (fresh install/reset).

Privacy default:

- Calendar modules start with `calendars: []` (no preloaded personal/public feed links).
- No personal URLs are embedded in repository defaults.

## Chores Week Model

- Chore schedules are not retrospective: recurring chores start on/after their explicit `startsOn` date, and one-off chores only appear on their scheduled date.
- Weekly payout/completion windows use a configurable `paydayDayOfWeek` setting.
- Chores day/week boundaries use a configurable household `siteTimezone`, so hosted servers do not change what counts as "today".
- Default payday is Saturday (`6`), so the default week runs Sunday -> Saturday.
- Completion tracker is week-scoped and resets to a new week after payday midnight.

## Module Time Model

- `device-local`: modules that should follow the current screen/browser clock, such as `clock` and `count-down`.
- `site-local`: modules that should follow the household calendar day, currently `chores` and `bible-verse`, using the shared `siteTimezone` setting.
- `source-local`: modules that should follow the upstream data source timezone, such as `weather` and `calendar`.

Current admin control:

- The household timezone is currently edited from Admin -> Chores, but it applies to all site-local modules, not just chores.

## Environment Variables

- `DATA_DIR` (default: `~/.hearth`, or existing `./data` if already present)
- `DB_PATH` (default: `DATA_DIR/hearth.db`)
- `HOST` (default: `127.0.0.1` for native/server runs; Docker compose files set `0.0.0.0`)
- `PORT` (default: `3000`)
- `CORS_ORIGINS` (optional CSV allowlist, e.g. `https://dashboard.local,https://admin.local`)
- `BACKUP_DIR` (default: `DATA_DIR/backups`)
- `BACKUP_INTERVAL_MINUTES` (default: `360`)
- `BACKUP_RETENTION_DAYS` (default: `30`)
- `DEFAULT_SITE_TIMEZONE` (optional IANA timezone fallback, e.g. `Australia/Perth`, used when the database has not stored a household timezone yet)
- `JWT_SECRET` (optional override; if omitted, generated and stored in `DATA_DIR/.jwt-secret`)
- `CALENDAR_ENCRYPTION_KEY` (optional override; if omitted, generated and stored in `DATA_DIR/.calendar-key`)
- `ADMIN_PASSWORD` (required on first startup until an admin password hash has been initialized)
- `ESV_API_KEY` (required for Bible Verse module data; create from [api.esv.org](https://api.esv.org/))

Local env loading for `pnpm dev` / `pnpm start`:

- Server reads `.env` automatically from the workspace root (and nearby fallbacks).
- If present, `.env.local` loads after `.env` and overrides file-based values on that machine.
- Existing shell/container environment variables always take precedence over `.env` and `.env.local`.

## Data Safety Defaults

- Layouts, settings, chores, and module configs are stored in SQLite at `DATA_DIR/hearth.db`.
- Calendar source URLs are encrypted before layout configs are saved to the database.
- Existing plaintext calendar sources are automatically migrated to encrypted format on startup.
- Calendar events API responses expose only a stable source id and safe source label (not raw URL).
- Automatic rolling backups are written to `DATA_DIR/backups` with retention cleanup.
- Server secrets are generated automatically when missing and stored in `DATA_DIR`:
  - `.jwt-secret`
  - `.calendar-key`
- CORS is deny-by-default; set `CORS_ORIGINS` when cross-origin access is needed.

## Docker

```bash
# Set required env vars for first boot
cat > .env <<'EOF'
ADMIN_PASSWORD=change-me
ESV_API_KEY=your_api_key_here
# Optional but recommended for containers before the admin UI has saved a household timezone.
DEFAULT_SITE_TIMEZONE=Your/Timezone
EOF
docker compose pull
docker compose up -d
```

Suggested volume mounts:

- `./data:/app/data`
- optional Kobo Reader mounts:
  - `/path/to/calibreweb-config:/external/calibreweb:ro`
  - `/path/to/calibre-library:/external/books:ro`

If you enable Kobo Reader in Docker, set these env vars to the in-container paths:

- `KOBO_READER_APP_DB_PATH=/external/calibreweb/app.db`
- `KOBO_READER_LIBRARY_DB_PATH=/external/books/metadata.db`
- `KOBO_READER_LIBRARY_ROOT=/external/books`

For a local source-build container install instead of the published image:

```bash
docker compose -f docker-compose.build.yml up --build -d
```

Recommended for collection-based setups:

- store photo folders under `./data/photos` (maps to `DATA_DIR/photos` in container)
- define collections using subfolders like `family`, `events/2026`, `kids/school`
- legacy `folderPath` values like `/photos/family` are still mapped inside `DATA_DIR/photos`

## Development Notes

- Source of truth for contracts is `packages/shared/src/*.ts`.
- Generated artifacts belong in `dist/` only.
- If you add or change schemas, run `pnpm build` before pushing.

## Current Module Set

- `clock`
- `calendar`
- `photos`
- `chores`
- `weather`
- `bible-verse`
- `welcome`
- `count-down`

## Future Features Roadmap (Recommended Order)

1. Touchscreen support end-to-end
   - Make all admin interactions and display controls touch-friendly.
   - Validate drag, resize, scroll, and tap targets on kiosk touch hardware.

2. Theming system
   - Add theme tokens (colors, typography, spacing, module surfaces) with a clean theme selector.
   - Ensure themes are lightweight and do not increase render cost on low hardware.

3. Transition tuning and presets
   - Keep improving layout transitions for smoothness on low-power devices.
   - Add optional transition presets and a simple on/off control if needed.

4. Device management polish
   - Add richer device diagnostics such as online/offline visibility and last-resolve status.
   - Add bulk device actions and faster multi-screen reassignment workflows.
