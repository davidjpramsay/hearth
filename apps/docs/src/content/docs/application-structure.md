---
title: "How the application is organised"
description: "The repo is split into shared contracts, the module SDK, the server, and the web app that powers both admin and displays."
---

The repo is split into shared contracts, the module SDK, the server, and the web app that powers both admin and displays.

packages/shared contains schemas, display contracts, time utilities, and shared module types.

packages/module-sdk contains defineModule and the SDK contract used by built-in and future modules.

apps/server owns authenticated admin routes, module data endpoints, persistence, provider integrations, and display resolution.

apps/web owns the dashboard runtime, admin pages, module implementations, and synced display-time behavior.

The set-logic editor is split into a reducer, pure graph helpers, React Flow node components, inspector UI, and canvas shell so graph rules are testable without being buried inside one render file.

## Key Points

- `apps/web/src/modules/sdk` holds built-in SDK modules.
- `apps/web/src/runtime/display-time.ts` is the synced household time source for site-local modules.
- `apps/server/src/routes` and `apps/server/src/services` contain module-facing APIs and backend logic.
- `apps/web/src/components/admin/set-logic-editor` contains the extracted set-logic editor internals.
