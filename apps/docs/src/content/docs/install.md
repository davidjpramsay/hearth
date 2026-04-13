---
title: "Choose your install path"
description: "Pick the path that matches how you want to run Hearth."
---

Pick the path that matches how you want to run Hearth.

If you just want to run Hearth at home, use Docker Compose or Synology.

If you are changing the code, use local pnpm development.

Only use the native Linux install if you do not want Docker.

## Key Points

- Local pnpm: for development
- Docker Compose: best default for most installs
- Synology: best for Synology Container Manager
- Native Linux: only if you do not want Docker

### Local development

```bash
cp .env.example .env
pnpm install
pnpm dev

# before pushing changes
pnpm verify
```
