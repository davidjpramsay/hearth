// This file is generated from docs/content/app-docs.json. Do not edit it directly.
export const appDocsContent = {
  hero: {
    eyebrow: "Hearth Docs",
    headline: "Installation, operations, displays, and module development in one place.",
    summary:
      "This is the public documentation surface for Hearth. It explains what the system does, how to run it, how displays behave, and how to build new SDK modules without reintroducing timing and caching regressions.",
    highlights: [
      "Display runtime plus admin UI in one web app",
      "Astro-based public docs site deployed to GitHub Pages",
      "Synced household time for site-local behavior",
      "SDK-first module architecture",
      "Single supported verification path with pnpm verify",
    ],
  },
  sections: [
    {
      id: "docs",
      eyebrow: "Documentation",
      title: "Use the public docs site",
      summary:
        "Hearth docs are published as a static Astro site on GitHub Pages instead of being served by the runtime server.",
      body: [
        "The public docs site is for install guides, architecture, operational notes, Synology deployment, and module-development guidance.",
        "The canonical docs source is `docs/content/app-docs.json`. Generated outputs include the Markdown mirror in `docs/APP_DOCS.md` and the Astro content module used by the docs site.",
        "Keep the README short and use it as a front door that links people to the public docs site and the most important reference files.",
      ],
      bullets: [
        "Run `pnpm docs:sync` after editing the structured docs source.",
        "Use `pnpm docs:dev` for local docs authoring.",
        "GitHub Pages publishes the built static site from the repo, so the docs stay available even when Hearth itself is offline.",
      ],
      code: {
        language: "bash",
        title: "Docs authoring workflow",
        content: "pnpm docs:sync\npnpm docs:dev\n\n# before pushing\npnpm verify",
      },
    },
    {
      id: "overview",
      eyebrow: "Platform",
      title: "What Hearth does",
      summary:
        "Hearth is a household display system for dashboards, layouts, photo-driven rotation, chores, calendars, weather, and site-local time-aware modules.",
      body: [
        "A display opens the dashboard, checks in with the server, receives the active layout or set, and then renders SDK modules inside the grid.",
        "The server is the source of truth for household timezone, display routing, module APIs, saved settings, and cached provider data.",
        "The web app contains both the display runtime and the admin experience, so most work happens in one frontend package with server-backed routes where secrets or integrations are involved.",
      ],
      bullets: [
        "Display clients use synced server time instead of trusting the Pi clock directly.",
        "Layouts can be selected directly or through set logic and time/photo-based routing.",
        "Modules are SDK-first and auto-discovered from the web app.",
      ],
    },
    {
      id: "install",
      eyebrow: "Quick Start",
      title: "Install and run locally",
      summary:
        "Use the monorepo root commands. The root scripts already build shared packages first.",
      body: [
        "Install dependencies once with pnpm.",
        "For day-to-day development, use the root dev command so shared, server, and web watchers stay in sync.",
        "Use the root verify command before pushing so formatting, builds, package tests, and Playwright all run in the supported order.",
      ],
      code: {
        language: "bash",
        title: "Local development",
        content: "pnpm install\npnpm dev\n\n# before pushing\npnpm verify",
      },
    },
    {
      id: "structure",
      eyebrow: "Architecture",
      title: "How the application is organised",
      summary:
        "The repo is split into shared contracts, the module SDK, the server, and the web app that powers both admin and displays.",
      body: [
        "packages/shared contains schemas, display contracts, time utilities, and shared module types.",
        "packages/module-sdk contains defineModule and the SDK contract used by built-in and future modules.",
        "apps/server owns authenticated admin routes, module data endpoints, persistence, provider integrations, and display resolution.",
        "apps/web owns the dashboard runtime, admin pages, module implementations, and synced display-time behavior.",
      ],
      bullets: [
        "`apps/web/src/modules/sdk` holds built-in SDK modules.",
        "`apps/web/src/runtime/display-time.ts` is the synced household time source for site-local modules.",
        "`apps/server/src/routes` and `apps/server/src/services` contain module-facing APIs and backend logic.",
      ],
    },
    {
      id: "admin",
      eyebrow: "Usage",
      title: "Use the admin app",
      summary:
        "The admin flow is centred on Layouts, Settings, and Chores. Displays appear after they open the dashboard once.",
      body: [
        "Use Layouts to build grid-based pages, attach SDK modules, and configure photo/set logic.",
        "Use Settings to manage connected displays, household timezone, saved calendar feeds, and runtime/device details.",
        "Use Chores to manage members, payouts, schedules, and household task behavior.",
      ],
      bullets: [
        "Admin login lives at `/admin/login`.",
        "The dashboard display runtime lives at `/`.",
        "Saved calendar feeds are global and can be referenced by calendar modules by ID.",
      ],
    },
    {
      id: "deploy",
      eyebrow: "Deployment",
      title: "Deploy to Synology",
      summary:
        "Production deployment currently revolves around publishing the image, pulling it on Synology, and recreating the compose service.",
      body: [
        "The Synology project uses the checked-in compose template and persistent data volume for server state.",
        "A normal update path is publish image, pull on the NAS, recreate the container, and run a health check against the root app and server-status endpoint.",
        "Timezone defaults should be set in the deployment environment as well as in admin settings so fresh containers do not silently fall back to UTC.",
      ],
      code: {
        language: "bash",
        title: "Supported deployment check path",
        content:
          "pnpm verify\n\n# then on Synology\ndocker compose -f docker-compose.synology.yml pull\ndocker compose -f docker-compose.synology.yml up -d\ndocker compose -f docker-compose.synology.yml ps",
      },
    },
    {
      id: "modules",
      eyebrow: "SDK",
      title: "Build modules",
      summary:
        "Hearth is SDK-first. New modules should be added as web SDK modules unless there is a strong reason to keep them outside that path.",
      body: [
        "Use the generator for the fast path, or add a module file manually under apps/web/src/modules/sdk.",
        "Modules declare a manifest, settings schema, optional data schema, runtime component, and optional admin settings panel.",
        "If a module needs secrets or provider calls, move those concerns to the server and consume a server route from the module.",
      ],
      bullets: [
        "Auto-discovery is handled by the web registry.",
        "Use `useModuleQuery` for polling and `useModuleStream` for SSE.",
        "Keep provider secrets and private feed URLs server-side.",
      ],
      code: {
        language: "bash",
        title: "Scaffold a new module",
        content: "pnpm create-module",
      },
    },
    {
      id: "time",
      eyebrow: "Hardening",
      title: "Write time-safe modules",
      summary:
        "Any module that depends on household-local time, midnight rollover, or `today` must use the synced display-time utilities instead of raw browser time.",
      body: [
        "Set `manifest.timeMode` intentionally: `device-local`, `site-local`, or `source-local`.",
        "For `site-local` modules, read time and timezone from `apps/web/src/runtime/display-time.ts`, react to display-time updates, and schedule a dedicated rollover refresh at the next site-local day boundary.",
        "If a module caches snapshots locally and its content is day-scoped, validate the snapshot against the current household date before reusing it.",
      ],
      bullets: [
        "Good references: clock, chores, calendar, bible-verse.",
        "Do not trust raw `new Date()` for household-day grouping on displays.",
        "Use timezone-aware helpers from `@hearth/shared` for day comparisons.",
      ],
      code: {
        language: "ts",
        title: "Site-local module pattern",
        content:
          "const siteTimeZone = getDisplaySiteTimeZone();\nconst now = getDisplayNow();\nconst siteDate = toCalendarDateInTimeZone(now, siteTimeZone);\nconst delayMs = getMillisecondsUntilNextCalendarDateInTimeZone(now, siteTimeZone);\n\nconst removeListener = addDisplayTimeContextListener(() => {\n  // re-evaluate when synced time or timezone changes\n});",
      },
    },
    {
      id: "verify",
      eyebrow: "Quality",
      title: "Test and verify changes",
      summary:
        "Use the root scripts rather than ad hoc workspace commands so dependency builds and tests run in the supported order.",
      body: [
        "The root `test` script prepares shared package artifacts first and then runs package tests sequentially.",
        "The root `verify` script is the canonical local and CI verification path.",
        "Avoid relying on `pnpm -r test` as a repo health signal because workspace build ordering can create false negatives.",
      ],
      code: {
        language: "bash",
        title: "Supported verification commands",
        content: "pnpm test\npnpm verify",
      },
    },
  ],
} as const;
