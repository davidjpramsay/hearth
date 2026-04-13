---
title: "Check your changes"
description: "Use the root scripts so builds and tests run in the right order."
---

Use the root scripts so builds and tests run in the right order.

The root `test` script builds shared packages first, then runs package tests in sequence.

The root `verify` script is the main local and CI check.

Avoid `pnpm -r test` because workspace order can cause false failures.

The set-logic editor has helper tests and browser smoke tests.

The graph editor reducer also has undo/redo tests.

### Supported verification commands

```bash
pnpm test
pnpm verify
```
