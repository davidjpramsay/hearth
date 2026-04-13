---
title: "Build modules"
description: "Most new modules should be added as web SDK modules."
---

Most new modules should be added as web SDK modules.

Use the generator for the fastest start.

Each module defines a manifest, settings schema, runtime component, and optional admin panel.

If a module needs secrets or provider calls, move that work to the server.

Use the shared data hooks instead of writing your own fetch effects.

## Key Points

- The web registry auto-discovers modules.
- Use `useModuleQuery` for polling, cache, and refreshes.
- Keep provider secrets and private feed URLs on the server.
- Block-style modules should store theme palette slots, not raw hex colours.

### Create a new module

```bash
pnpm create-module
```
