<!-- This file is generated from docs/content/app-docs.json. Do not edit it directly. -->

# Hearth App Docs

Hearth shows photos, calendars, chores, school plans, clocks, and more on a full-screen display. Use the admin app to build layouts and choose what each screen shows.

## Highlights

- Photos, calendar, chores, and school planner
- One admin app for all screens
- Runs on Docker, Synology, Linux, and Raspberry Pi
- Synced household time
- Local SQLite data with backups

## Sections

- [What Hearth is](#overview)
- [Choose your install path](#install)
- [How Hearth is built](#application-structure)
- [Use the admin](#admin)
- [Install step by step](#deploy)
- [Build modules](#build-sdk-modules)
- [Build time-safe modules](#time)
- [Check your changes](#quality-checks)

## What Hearth is

_Platform_

Hearth is a self-hosted dashboard for a wall display, TV, tablet, or kiosk browser.

Open Hearth on a display to show a full-screen family dashboard.

Use the admin app to build layouts, add modules, and choose what each screen shows.

Built-in modules include photos, calendar, clock, weather, chores, Bible verse, and School planner.

Each display checks in with the server so layout changes appear quickly.

- One app for the display and the admin tools.
- Different screens can show different layouts.
- Displays use synced household time.
- Layouts can switch by set logic, time, or photo rules.

## Choose your install path

_Quick Start_

Pick the path that matches how you want to run Hearth.

If you just want to run Hearth at home, use Docker Compose or Synology.

If you are changing the code, use local pnpm development.

Only use the native Linux install if you do not want Docker.

- Local pnpm: for development
- Docker Compose: best default for most installs
- Synology: best for Synology Container Manager
- Native Linux: only if you do not want Docker

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

Hearth has a server, a web app, shared packages, and a module SDK.

apps/server stores data, serves the API, and resolves what each display should show.

apps/web contains the display app and the admin pages.

packages/shared contains schemas, contracts, and time helpers.

packages/module-sdk contains the SDK used by built-in and future modules.

- `apps/web/src/modules/sdk` holds built-in modules.
- `apps/web/src/runtime/display-time.ts` is the synced household time source.
- `apps/server/src/routes` and `apps/server/src/services` hold backend logic.
- `apps/web/src/components/admin/set-logic-editor` holds the set-logic editor internals.

## Use the admin

_Usage_

Most setup happens in Layouts, Settings, Children, Chores, and School.

Open `/admin/login` to sign in.

Use Layouts to build pages and set up layout logic.

Use Settings to manage displays, timezone, calendar feeds, and system health.

Use Children to manage the shared child list.

Use Chores to manage tasks and payouts.

Use School to manage weekly plans and timetables.

- The fullscreen display runs at `/`.
- Saved calendar feeds can be reused across layouts.
- Settings autosaves simple edits.
- Each weekday can belong to only one School plan.
- Settings shows display health, backups, and database status.
- The set-logic editor supports undo, redo, and draft recovery.

## Install step by step

_Install_

Follow the steps for your system. Most home installs should use Docker or Synology.

Docker Compose: copy `.env.example` to `.env`, then set `ADMIN_PASSWORD`, `TZ`, and `DEFAULT_SITE_TIMEZONE`.

Start Hearth with `docker compose up -d`.

Open `http://<your-host>:3000/admin/login` and sign in with `ADMIN_PASSWORD`.

Open `Settings`, set the household timezone, then open `/` once on each display so it registers.

Go back to `Settings`, name each display, and assign a layout or set.

On Synology, use `.env.synology` and `docker-compose.synology.yml` instead of the standard files.

For native Linux or Raspberry Pi, install Node, pnpm, and git first, then run `pnpm install`, `pnpm build`, and `pnpm start`.

- Default runtime URL: `http://<host>:3000`
- Admin login: `http://<host>:3000/admin/login`
- Set `HOST=0.0.0.0` if other devices on your LAN need to reach a native install.
- Do not expose Hearth directly to the public internet.

### Docker install

```bash
cp .env.example .env
# edit .env and set ADMIN_PASSWORD, TZ, DEFAULT_SITE_TIMEZONE

docker compose up -d

# later updates
docker compose pull
docker compose up -d
```

## Build modules

_SDK_

Most new modules should be added as web SDK modules.

Use the generator for the fastest start.

Each module defines a manifest, settings schema, runtime component, and optional admin panel.

If a module needs secrets or provider calls, move that work to the server.

Use the shared data hooks instead of writing your own fetch effects.

- The web registry auto-discovers modules.
- Use `useModuleQuery` for polling, cache, and refreshes.
- Keep provider secrets and private feed URLs on the server.
- Block-style modules should store theme palette slots, not raw hex colours.

### Create a new module

```bash
pnpm create-module
```

## Build time-safe modules

_Hardening_

If a module depends on household time or `today`, use synced display time instead of browser time.

Set `manifest.timeMode` on purpose: `device-local`, `site-local`, or `source-local`.

For `site-local` modules, read time and timezone from `apps/web/src/runtime/display-time.ts`.

Refresh at the next site-local day boundary.

If a module uses cached data, make sure the cache still matches the current household date.

- Good references: clock, chores, calendar, Bible verse, and School planner.
- Do not trust raw `new Date()` for household-day logic.
- Use timezone-aware helpers from `@hearth/shared`.
- School planner uses synced household time for day selection and its current-time line.

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

The root `test` script builds shared packages first, then runs tests in order.

The root `verify` script is the main local and CI check.

Avoid `pnpm -r test` because workspace order can cause false failures.

### Commands to run

```bash
pnpm test
pnpm verify
```
