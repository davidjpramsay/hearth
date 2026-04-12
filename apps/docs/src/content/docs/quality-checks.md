---
title: "Test and verify changes"
description: "Use the root scripts rather than ad hoc workspace commands so dependency builds and tests run in the supported order."
---

Use the root scripts rather than ad hoc workspace commands so dependency builds and tests run in the supported order.

The root `test` script prepares shared package artifacts first and then runs package tests sequentially.

The root `verify` script is the canonical local and CI verification path.

Avoid relying on `pnpm -r test` as a repo health signal because workspace build ordering can create false negatives.

Set-logic graph rules now have pure helper coverage plus browser smoke tests for connection and persistence regressions.

### Supported verification commands

```bash
pnpm test
pnpm verify
```
