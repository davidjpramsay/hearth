---
title: "How Hearth is built"
description: "Hearth has a server, a web app, shared packages, and a module SDK."
---

Hearth has a server, a web app, shared packages, and a module SDK.

apps/server stores data, serves the API, and resolves what each display should show.

apps/web contains the display app and the admin pages.

packages/shared contains schemas, contracts, and time helpers.

packages/module-sdk contains the SDK used by built-in and future modules.

## Key Points

- `apps/web/src/modules/sdk` holds built-in modules.
- `apps/web/src/runtime/display-time.ts` is the synced household time source.
- `apps/server/src/routes` and `apps/server/src/services` hold backend logic.
- `apps/web/src/components/admin/set-logic-editor` holds the set-logic editor internals.
