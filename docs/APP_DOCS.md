<!-- This file is generated from docs/content/app-docs.json. Do not edit it directly. -->

# Hearth App Docs

This is the public documentation surface for Hearth. It explains what the system does, how to run it, how displays behave, and how to build new SDK modules without reintroducing timing and caching regressions.

## Highlights

- Display runtime plus admin UI in one web app
- Astro-based public docs site deployed to GitHub Pages
- Synced household time for site-local behavior
- SDK-first module architecture
- Single supported verification path with pnpm verify

## Sections

- [What Hearth does](#overview)
- [Choose an install path](#install)
- [How the application is organised](#application-structure)
- [Use the admin app](#admin)
- [Install on common systems](#deploy)
- [Build modules](#build-sdk-modules)
- [Write time-safe modules](#time)
- [Test and verify changes](#quality-checks)

## What Hearth does

_Platform_

Hearth is a household display system for dashboards, layouts, photo-driven rotation, chores, calendars, planner boards, weather, and site-local time-aware modules.

A display opens the dashboard, checks in with the server, receives the active layout or set, and then renders SDK modules inside the grid.

The server is the source of truth for household timezone, display routing, module APIs, saved settings, and cached provider data.

The web app contains both the display runtime and the admin experience, so most work happens in one frontend package with server-backed routes where secrets or integrations are involved.

- Display clients use synced server time instead of trusting the Pi clock directly.
- Layouts can be selected directly or through set logic and time/photo-based routing.
- Modules are SDK-first and auto-discovered from the web app.

## Choose an install path

_Quick Start_

Pick the install path that matches how you want to use Hearth: local development, Docker, Synology, or a native Linux / Raspberry Pi install.

For development on your own machine, use the local pnpm workflow. That gives you the Vite web app, the Fastify server, and the shared package watchers together.

For a normal home install on a Linux box, mini PC, or Raspberry Pi, the easiest production path is Docker Compose with the published image. That avoids local source builds on the target machine.

For Synology, use the checked-in Synology compose file and env example. That is the supported NAS path and keeps updates simple.

If you prefer a native Linux install instead of Docker, use Node, pnpm, and a system service. That is workable, but Docker is the easier default for most people.

- Choose local pnpm only if you are developing or debugging Hearth itself.
- Choose Docker Compose for the simplest production install on most systems.
- Choose the Synology compose path if you are using Container Manager.
- Choose native Linux only if you deliberately want to manage Node and the service yourself.

### Local development

```bash
cp .env.example .env
pnpm install
pnpm dev

# before pushing changes
pnpm verify
```

## How the application is organised

_Architecture_

The repo is split into shared contracts, the module SDK, the server, and the web app that powers both admin and displays.

packages/shared contains schemas, display contracts, time utilities, and shared module types.

packages/module-sdk contains defineModule and the SDK contract used by built-in and future modules.

apps/server owns authenticated admin routes, module data endpoints, persistence, provider integrations, and display resolution.

apps/web owns the dashboard runtime, admin pages, module implementations, and synced display-time behavior.

The set-logic editor is split into a reducer, pure graph helpers, React Flow node components, inspector UI, and canvas shell so graph rules are testable without being buried inside one render file.

- `apps/web/src/modules/sdk` holds built-in SDK modules.
- `apps/web/src/runtime/display-time.ts` is the synced household time source for site-local modules.
- `apps/server/src/routes` and `apps/server/src/services` contain module-facing APIs and backend logic.
- `apps/web/src/components/admin/set-logic-editor` contains the extracted set-logic editor internals.

## Use the admin app

_Usage_

The admin flow is centred on Layouts, Settings, Children, Chores, and School. Displays appear after they open the dashboard once.

Use Layouts to build grid-based pages, attach SDK modules, and configure photo/set logic.

Use Settings to manage connected displays, household timezone, saved calendar feeds, and runtime/device details.

Use Children to manage the shared child roster that feeds both chores and school planning.

Use Chores to manage payouts, schedules, and household task behavior for those children.

Use School to manage reusable day plans, assign them to repeat weekdays, and edit their timetables.

- Admin login lives at `/admin/login`.
- The dashboard display runtime lives at `/`.
- Saved calendar feeds are global and can be referenced by calendar modules by ID.
- Settings autosaves low-risk edits such as household timezone, calendar feed edits, and per-display theme/routing changes.
- School day plans are global, each weekday can only belong to one plan, and the School module renders the plan that matches today's household weekday.
- The main admin pages now share the same section framing and tighter helper copy, so Settings, Children, Chores, and School read as one system instead of separate generations of UI.
- Settings now includes an operational health panel with display check-in summaries, stale-device detection, calendar cache warmth, and backup status.
- That same panel now surfaces database size and last-modified time, so storage state is visible without shell access.
- The layout set-logic editor supports undo/redo, draft recovery, and starter actions for first-time graph setup.
- Displays and snapshot-backed modules now show softer `Offline` or `Cached` badges when they are serving last-good data.
- The main display modules now use shared skeleton loading states instead of plain `Loading ...` copy while data warms up.
- Theme colours now come from curated 12-slot palettes, including the newer Forest and Ember presets.

## Install on common systems

_Deployment_

Use the shortest path that fits your target machine. Most production installs should use the published container image.

Docker host: copy `.env.example` to `.env`, review the timezone and password values, then start `docker compose.yml`. This is the easiest general-purpose production install.

Synology: copy `.env.synology.example` to your real env file, use `docker-compose.synology.yml`, and keep the `/volume1/docker/hearth/data` volume persistent. That is the supported NAS path.

Native Linux or Raspberry Pi: install Node and pnpm, copy `.env.example` to `.env`, run `pnpm install`, `pnpm build`, and `pnpm start`, then keep it alive with `systemd` or another service manager.

After the server starts, open `/admin/login`, sign in, set the household timezone, then load `/` on each display device once so it appears in Settings.

Set both the deployment timezone env vars and the household timezone in admin so a fresh container does not fall back to UTC.

- Default runtime URL is `http://<host>:3000`.
- Use `HOST=0.0.0.0` if devices on your LAN need to reach a native install.
- Do not expose Hearth directly to the public internet.
- Use `pnpm verify` before publishing or building a release image.

### Docker or Synology update flow

```bash
pnpm verify

# Docker host
docker compose pull
docker compose up -d

# Synology
docker compose -f docker-compose.synology.yml pull
docker compose -f docker-compose.synology.yml up -d
docker compose -f docker-compose.synology.yml ps
```

## Build modules

_SDK_

Hearth is SDK-first. New modules should be added as web SDK modules unless there is a strong reason to keep them outside that path.

Use the generator for the fast path, or add a module file manually under apps/web/src/modules/sdk.

Modules declare a manifest, settings schema, optional data schema, runtime component, and optional admin settings panel.

If a module needs secrets or provider calls, move those concerns to the server and consume a server route from the module.

Use the shared module data hooks instead of hand-rolled fetch effects so polling, cache reuse, focus refresh, visibility refresh, and SSE invalidation follow one path.

- Auto-discovery is handled by the web registry.
- Use `useModuleQuery` for polling, cache, and invalidation-aware refreshes.
- Use `useModuleStream` for direct SSE topic subscriptions when a module truly needs streaming state.
- Keep provider secrets and private feed URLs server-side.
- Block-style modules should store theme palette slots, not raw hex colours.

### Scaffold a new module

```bash
pnpm create-module
```

## Write time-safe modules

_Hardening_

Any module that depends on household-local time, midnight rollover, or `today` must use the synced display-time utilities instead of raw browser time.

Set `manifest.timeMode` intentionally: `device-local`, `site-local`, or `source-local`.

For `site-local` modules, read time and timezone from `apps/web/src/runtime/display-time.ts`, react to display-time updates, and schedule a dedicated rollover refresh at the next site-local day boundary.

If a module caches snapshots locally and its content is day-scoped, validate the snapshot against the current household date before reusing it.

When cached data is reused after a connectivity failure, prefer a soft stale badge over a hard blocking error.

- Good references: clock, chores, calendar, bible-verse, homeschool-planner.
- Do not trust raw `new Date()` for household-day grouping on displays.
- Use timezone-aware helpers from `@hearth/shared` for day comparisons.
- The School planner runtime uses synced household time for day selection and its current-time indicator.

### Site-local module pattern

```ts
const siteTimeZone = getDisplaySiteTimeZone();
const now = getDisplayNow();
const siteDate = toCalendarDateInTimeZone(now, siteTimeZone);
const delayMs = getMillisecondsUntilNextCalendarDateInTimeZone(now, siteTimeZone);

const removeListener = addDisplayTimeContextListener(() => {
  // re-evaluate when synced time or timezone changes
});
```

## Test and verify changes

_Quality_

Use the root scripts rather than ad hoc workspace commands so dependency builds and tests run in the supported order.

The root `test` script prepares shared package artifacts first and then runs package tests sequentially.

The root `verify` script is the canonical local and CI verification path.

Avoid relying on `pnpm -r test` as a repo health signal because workspace build ordering can create false negatives.

Set-logic graph rules now have pure helper coverage plus browser smoke tests for connection and persistence regressions.

The graph editor reducer also has dedicated undo/redo coverage.

### Supported verification commands

```bash
pnpm test
pnpm verify
```
