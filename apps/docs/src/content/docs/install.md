---
title: "Install and run locally"
description: "Use the monorepo root commands. The root scripts already build shared packages first."
---

Use the monorepo root commands. The root scripts already build shared packages first.

Install dependencies once with pnpm.

For day-to-day development, use the root dev command so shared, server, and web watchers stay in sync.

Use the root verify command before pushing so formatting, builds, package tests, and Playwright all run in the supported order.

### Local development

```bash
pnpm install
pnpm dev

# before pushing
pnpm verify
```
