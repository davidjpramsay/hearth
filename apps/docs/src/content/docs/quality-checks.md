---
title: "Check your changes"
description: "Use the root scripts so builds and tests run in the right order."
---

Use the root scripts so builds and tests run in the right order.

The root `test` script builds shared packages first, then runs tests in order.

The root `verify` script is the main local and CI check.

Avoid `pnpm -r test` because workspace order can cause false failures.

### Commands to run

```bash
pnpm test
pnpm verify
```
