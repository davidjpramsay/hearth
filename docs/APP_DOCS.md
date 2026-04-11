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
- [Install and run locally](#install)
- [How the application is organised](#structure)
- [Use the admin app](#admin)
- [Deploy to Synology](#deploy)
- [Build modules](#modules)
- [Write time-safe modules](#time)
- [Test and verify changes](#verify)

## What Hearth does

_Platform_

Hearth is a household display system for dashboards, layouts, photo-driven rotation, chores, calendars, planner boards, weather, and site-local time-aware modules.

A display opens the dashboard, checks in with the server, receives the active layout or set, and then renders SDK modules inside the grid.

The server is the source of truth for household timezone, display routing, module APIs, saved settings, and cached provider data.

The web app contains both the display runtime and the admin experience, so most work happens in one frontend package with server-backed routes where secrets or integrations are involved.

- Display clients use synced server time instead of trusting the Pi clock directly.
- Layouts can be selected directly or through set logic and time/photo-based routing.
- Modules are SDK-first and auto-discovered from the web app.

## Install and run locally

_Quick Start_

Use the monorepo root commands. The root scripts already build shared packages first.

Install dependencies once with pnpm.

For day-to-day development, use the root dev command so shared, server, and web watchers stay in sync.

Use the root verify command before pushing so formatting, builds, package tests, and Playwright all run in the supported order.

### Local development

```bash
pnpm install
pnpm dev

# before pushing
pnpm verify
```

## How the application is organised

_Architecture_

The repo is split into shared contracts, the module SDK, the server, and the web app that powers both admin and displays.

packages/shared contains schemas, display contracts, time utilities, and shared module types.

packages/module-sdk contains defineModule and the SDK contract used by built-in and future modules.

apps/server owns authenticated admin routes, module data endpoints, persistence, provider integrations, and display resolution.

apps/web owns the dashboard runtime, admin pages, module implementations, and synced display-time behavior.

- `apps/web/src/modules/sdk` holds built-in SDK modules.
- `apps/web/src/runtime/display-time.ts` is the synced household time source for site-local modules.
- `apps/server/src/routes` and `apps/server/src/services` contain module-facing APIs and backend logic.

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
- School day plans are global, each weekday can only belong to one plan, and the School module renders the plan that matches today's household weekday.

## Deploy to Synology

_Deployment_

Production deployment currently revolves around publishing the image, pulling it on Synology, and recreating the compose service.

The Synology project uses the checked-in compose template and persistent data volume for server state.

A normal update path is publish image, pull on the NAS, recreate the container, and run a health check against the root app and server-status endpoint.

Timezone defaults should be set in the deployment environment as well as in admin settings so fresh containers do not silently fall back to UTC.

### Supported deployment check path

```bash
pnpm verify

# then on Synology
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

- Auto-discovery is handled by the web registry.
- Use `useModuleQuery` for polling and `useModuleStream` for SSE.
- Keep provider secrets and private feed URLs server-side.

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

- Good references: clock, chores, calendar, bible-verse, homeschool-planner.
- Do not trust raw `new Date()` for household-day grouping on displays.
- Use timezone-aware helpers from `@hearth/shared` for day comparisons.

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

### Supported verification commands

```bash
pnpm test
pnpm verify
```
