# Hearth

Hearth is a self-hosted family wall display.

Run it on a TV, tablet, Raspberry Pi, mini PC, or kiosk browser to show things like:

- Photos
- Calendar
- Clock and weather
- Chores
- School planner
- Bible verse
- Custom layouts for each screen

Use the admin app to build layouts, manage screens, and choose what each display shows.

## Start Here

Pick the path that matches what you want to do:

- Change Hearth itself: use local `pnpm`
- Run Hearth at home on Linux, a mini PC, or Raspberry Pi: use Docker Compose
- Run Hearth on a Synology NAS: use the Synology files
- Run Hearth without Docker: use the native Linux install

Public docs site:

- [https://davidjpramsay.github.io/hearth/](https://davidjpramsay.github.io/hearth/)

Demo video:

- Coming soon. The docs site is ready for it, but the final recording has not been added yet.

## What You Get

- Fullscreen display at `/`
- Admin app at `/admin/login`
- Per-screen layout routing
- Photo, calendar, chores, weather, clock, Bible verse, and School planner modules
- SQLite storage with automatic backups

## Install For Development

Use this only if you are changing Hearth itself.

1. Copy the env file.

```bash
cp .env.example .env
```

2. Install dependencies.

```bash
pnpm install
```

3. Start development mode.

```bash
pnpm dev
```

URLs:

- API server: `http://localhost:3000`
- Web dev app: `http://localhost:5173`

Before pushing changes:

```bash
pnpm verify
```

## Install With Docker Compose

Use this for most home installs.

Before you start:

- Docker and Docker Compose must already be installed.
- This machine should stay on while Hearth is running.
- Your screens must be able to reach this machine on your local network.

1. Copy the env file.

```bash
cp .env.example .env
```

2. Edit `.env` and set at least:

- `ADMIN_PASSWORD`
- `TZ`
- `DEFAULT_SITE_TIMEZONE`

3. Start Hearth.

```bash
docker compose up -d
```

4. Open Hearth in a browser.

- Runtime: `http://<your-host>:3000`
- Admin login: `http://<your-host>:3000/admin/login`

5. After you sign in:

- Open `Settings`
- Set the household timezone
- Open `/` once on each display device so it registers
- Go back to `Settings` and name each display
- Build your first layout in `Layouts`
- Assign that layout to a screen

Update later with:

```bash
docker compose pull
docker compose up -d
```

## Install On Synology

Use this if you are running Hearth through Synology Container Manager.

Before you start:

- Synology Container Manager must already be working.
- You need a persistent folder for Hearth data.

1. Copy the Synology env file.

```bash
cp .env.synology.example .env.synology
```

2. Edit `.env.synology` and set:

- `ADMIN_PASSWORD`
- `TZ`
- `DEFAULT_SITE_TIMEZONE`

3. Start Hearth.

```bash
docker compose -f docker-compose.synology.yml --env-file .env.synology up -d
```

4. Open Hearth at:

- `http://<your-synology-host>:3000`

5. Keep the data volume persistent:

- `/volume1/docker/hearth/data:/app/data`

6. After you sign in:

- Open `Settings`
- Set the household timezone
- Open `/` once on each display device so it registers
- Go back to `Settings` and name each display
- Build your first layout in `Layouts`
- Assign that layout to a screen

Update later with:

```bash
docker compose -f docker-compose.synology.yml --env-file .env.synology pull
docker compose -f docker-compose.synology.yml --env-file .env.synology up -d
docker compose -f docker-compose.synology.yml --env-file .env.synology ps
```

For the full Synology path, use:

- [Synology Deployment](docs/SYNOLOGY_DEPLOYMENT.md)
- [Synology Update Routine](docs/SYNOLOGY_UPDATE.md)

## Install Natively On Linux Or Raspberry Pi

Use this only if you deliberately do not want Docker.

Before you start:

- Install Node
- Install pnpm
- Install git
- Make sure other devices on your LAN can reach this machine if it will host displays

1. Copy the env file.

```bash
cp .env.example .env
```

2. Set at least:

- `ADMIN_PASSWORD`
- `TZ`
- `DEFAULT_SITE_TIMEZONE`

3. Install and build Hearth.

```bash
pnpm install
pnpm build
```

4. Start Hearth.

```bash
pnpm start
```

5. If other devices on your LAN need to reach this machine, set:

- `HOST=0.0.0.0`

6. Keep it running with `systemd` or another process manager.

7. After you sign in:

- Open `Settings`
- Set the household timezone
- Open `/` once on each display device so it registers
- Go back to `Settings` and name each display
- Build your first layout in `Layouts`
- Assign that layout to a screen

## First Run Checklist

After any install:

1. Open `/admin/login`
2. Sign in with `ADMIN_PASSWORD`
3. Open `Settings`
4. Set the household timezone
5. Open `/` once on each display device
6. Return to `Settings` and assign each display to a layout or set
7. Build your layouts in `Layouts`

## Public Docs

- Public docs site: [https://davidjpramsay.github.io/hearth/](https://davidjpramsay.github.io/hearth/)
- App docs mirror: [docs/APP_DOCS.md](docs/APP_DOCS.md)
- Deployment guide: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- Synology deployment: [docs/SYNOLOGY_DEPLOYMENT.md](docs/SYNOLOGY_DEPLOYMENT.md)

## Deployment Options

Supported paths:

- Local development with `pnpm`
- Docker Compose using `docker-compose.yml`
- Synology using `docker-compose.synology.yml`
- Native Linux / Raspberry Pi with Node + pnpm

Useful deployment docs:

- [Deployment Guide](docs/DEPLOYMENT.md)
- [Synology Deployment](docs/SYNOLOGY_DEPLOYMENT.md)
- [Synology Update Routine](docs/SYNOLOGY_UPDATE.md)
- [Image Publishing](docs/IMAGE_PUBLISHING.md)

## Developer Notes

- `apps/server`: API + SQLite + backend logic
- `apps/web`: admin app + display app
- `packages/shared`: shared schemas and contracts
- `packages/module-sdk`: SDK for modules

Create a new module scaffold:

```bash
pnpm create-module
```

Check changes before pushing:

```bash
pnpm verify
```

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

- Display routing is per-screen and server-managed from Admin > Settings.
- Displays register automatically after they open `/` once, then can be renamed and managed remotely.
- Each device has two routing modes:
  - `Layout Set`: follow one specific set and that set's logic graph
  - `Single Layout`: pin one specific layout (no set logic)
- Each device also has its own theme selection in Admin > Settings.
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
- Device changes made in Admin > Settings are pushed to open displays through SSE and applied on the next layout resolve.
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
- Use `pnpm verify` for the supported manual/CI verification path.
- `pnpm test` is still available for package-only checks; it rebuilds shared workspace dependencies first so package tests do not race missing `dist/` artifacts.

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
