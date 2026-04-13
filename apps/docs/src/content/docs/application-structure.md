---
title: "How Hearth is built"
description: "The repo has shared packages, a server, a web app, and the module SDK."
---

The repo has shared packages, a server, a web app, and the module SDK.

packages/shared contains schemas, contracts, and shared time helpers.

packages/module-sdk contains the SDK used by built-in and future modules.

apps/server owns persistence, admin routes, provider calls, and display resolution.

apps/web owns the display runtime, admin pages, and built-in modules.

The set-logic editor is split into smaller parts so it is easier to test and maintain.

## Key Points

- `apps/web/src/modules/sdk` holds built-in SDK modules.
- `apps/web/src/runtime/display-time.ts` is the synced household time source for site-local modules.
- `apps/server/src/routes` and `apps/server/src/services` contain module-facing APIs and backend logic.
- `apps/web/src/components/admin/set-logic-editor` contains the extracted set-logic editor internals.
