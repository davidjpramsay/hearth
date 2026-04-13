<!-- This file is generated from docs/content/app-docs.json. Do not edit it directly. -->

# Hearth App Docs

Hearth is a family wall display app. These docs show how to install it, run it, and build modules.

## Highlights

- Display and admin in one app
- Public docs on GitHub Pages
- Synced household time
- SDK modules
- Check changes with pnpm verify

## Sections

- [What Hearth does](#overview)
- [Choose an install path](#install)
- [How Hearth is built](#application-structure)
- [Use the admin](#admin)
- [Install on your system](#deploy)
- [Build modules](#build-sdk-modules)
- [Build time-safe modules](#time)
- [Check your changes](#quality-checks)

## What Hearth does

_Platform_

Hearth runs a family dashboard on a wall display or kiosk screen.

Each display opens the dashboard, checks in with the server, and loads the active layout or set.

The server stores the household timezone, display routing, settings, and cached data.

The web app includes both the display view and the admin tools.

- Displays use synced server time.
- Layouts can switch by set logic, time, or photo rules.
- Modules are SDK-first and auto-discovered.

## Choose an install path

_Quick Start_

Pick the install path that matches your setup.

Use local pnpm if you are developing Hearth.

Use Docker Compose for most production installs on Linux, mini PCs, and Raspberry Pi devices.

Use the Synology compose files if you are running on a Synology NAS.

Use a native Linux install only if you do not want Docker.

- Local pnpm: for development
- Docker Compose: best default for production
- Synology: best for Container Manager
- Native Linux: for non-Docker installs

### Local development

```bash
cp .env.example .env
pnpm install
pnpm dev

# before pushing changes
pnpm verify
```

## How Hearth is built

_Architecture_

The repo has shared packages, a server, a web app, and the module SDK.

packages/shared contains schemas, contracts, and shared time helpers.

packages/module-sdk contains the SDK used by built-in and future modules.

apps/server owns persistence, admin routes, provider calls, and display resolution.

apps/web owns the display runtime, admin pages, and built-in modules.

The set-logic editor is split into smaller parts so it is easier to test and maintain.

- `apps/web/src/modules/sdk` holds built-in SDK modules.
- `apps/web/src/runtime/display-time.ts` is the synced household time source for site-local modules.
- `apps/server/src/routes` and `apps/server/src/services` contain module-facing APIs and backend logic.
- `apps/web/src/components/admin/set-logic-editor` contains the extracted set-logic editor internals.

## Use the admin

_Usage_

Most setup happens in Layouts, Settings, Children, Chores, and School.

Use Layouts to build pages and set up logic.

Use Settings to manage displays, timezone, calendar feeds, and runtime details.

Use Children to manage the shared child list.

Use Chores to manage tasks and payouts.

Use School to manage day plans and timetables.

- Admin login lives at `/admin/login`.
- The dashboard display runtime lives at `/`.
- Saved calendar feeds are shared by all calendar modules.
- Settings autosaves low-risk edits.
- Each weekday can belong to only one School plan.
- Settings shows display health, backups, and database status.
- The set-logic editor supports undo, redo, and draft recovery.
- Displays can show `Offline` or `Cached` instead of hard errors.
- Main modules now use shared loading skeletons.
- Theme colours come from curated 12-slot palettes.

## Install on your system

_Deployment_

Use the simplest path for your machine. Most installs should use the published container image.

Docker: copy `.env.example` to `.env`, set the password and timezone, then start Docker Compose.

Synology: use `.env.synology.example` and `docker-compose.synology.yml`, and keep the data volume persistent.

Native Linux or Raspberry Pi: install Node and pnpm, then run `pnpm install`, `pnpm build`, and `pnpm start`.

After startup, open `/admin/login`, set the household timezone, and open `/` once on each display device.

Set the deployment timezone and the household timezone so a fresh install does not fall back to UTC.

- Default runtime URL is `http://<host>:3000`.
- Set `HOST=0.0.0.0` if devices on your LAN need to reach a native install.
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

Most new modules should be added as web SDK modules.

Use the generator for the fastest start, or add a module file under apps/web/src/modules/sdk.

Each module defines a manifest, settings schema, runtime component, and optional admin panel.

If a module needs secrets or provider calls, move that work to the server.

Use the shared data hooks instead of writing custom fetch effects.

- The web registry auto-discovers modules.
- Use `useModuleQuery` for polling, cache, and refreshes.
- Use `useModuleStream` only when a module truly needs streaming state.
- Keep provider secrets and private feed URLs server-side.
- Block-style modules should store theme palette slots, not raw hex colours.

### Scaffold a new module

```bash
pnpm create-module
```

## Build time-safe modules

_Hardening_

If a module depends on household time or `today`, use synced display time instead of browser time.

Set `manifest.timeMode` intentionally: `device-local`, `site-local`, or `source-local`.

For `site-local` modules, read time and timezone from `apps/web/src/runtime/display-time.ts` and refresh at the next site-local day boundary.

If a module reuses cached data, check that the cache still matches the current household date.

If cached data is shown after a failure, prefer a soft stale badge over a hard error.

- Good references: clock, chores, calendar, bible verse, and School planner.
- Do not trust raw `new Date()` for household-day logic on displays.
- Use timezone-aware helpers from `@hearth/shared` for day comparisons.
- The School planner uses synced household time for day selection and its current-time line.

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

## Check your changes

_Quality_

Use the root scripts so builds and tests run in the right order.

The root `test` script builds shared packages first, then runs package tests in sequence.

The root `verify` script is the main local and CI check.

Avoid `pnpm -r test` because workspace order can cause false failures.

The set-logic editor has helper tests and browser smoke tests.

The graph editor reducer also has undo/redo tests.

### Supported verification commands

```bash
pnpm test
pnpm verify
```
