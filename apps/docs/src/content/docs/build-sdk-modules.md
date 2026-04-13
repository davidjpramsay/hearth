---
title: "Build modules"
description: "Most new modules should be added as web SDK modules."
---

Most new modules should be added as web SDK modules.

Use the generator for the fastest start, or add a module file under apps/web/src/modules/sdk.

Each module defines a manifest, settings schema, runtime component, and optional admin panel.

If a module needs secrets or provider calls, move that work to the server.

Use the shared data hooks instead of writing custom fetch effects.

## Key Points

- The web registry auto-discovers modules.
- Use `useModuleQuery` for polling, cache, and refreshes.
- Use `useModuleStream` only when a module truly needs streaming state.
- Keep provider secrets and private feed URLs server-side.
- Block-style modules should store theme palette slots, not raw hex colours.

### Scaffold a new module

```bash
pnpm create-module
```
