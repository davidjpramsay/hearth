---
title: "Build modules"
description: "Hearth is SDK-first. New modules should be added as web SDK modules unless there is a strong reason to keep them outside that path."
---

Hearth is SDK-first. New modules should be added as web SDK modules unless there is a strong reason to keep them outside that path.

Use the generator for the fast path, or add a module file manually under apps/web/src/modules/sdk.

Modules declare a manifest, settings schema, optional data schema, runtime component, and optional admin settings panel.

If a module needs secrets or provider calls, move those concerns to the server and consume a server route from the module.

Use the shared module data hooks instead of hand-rolled fetch effects so polling, cache reuse, focus refresh, visibility refresh, and SSE invalidation follow one path.

## Key Points

- Auto-discovery is handled by the web registry.
- Use `useModuleQuery` for polling, cache, and invalidation-aware refreshes.
- Use `useModuleStream` for direct SSE topic subscriptions when a module truly needs streaming state.
- Keep provider secrets and private feed URLs server-side.

### Scaffold a new module

```bash
pnpm create-module
```
