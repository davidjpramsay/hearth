---
title: "Choose an install path"
description: "Pick the install path that matches your setup."
---

Pick the install path that matches your setup.

Use local pnpm if you are developing Hearth.

Use Docker Compose for most production installs on Linux, mini PCs, and Raspberry Pi devices.

Use the Synology compose files if you are running on a Synology NAS.

Use a native Linux install only if you do not want Docker.

## Key Points

- Local pnpm: for development
- Docker Compose: best default for production
- Synology: best for Container Manager
- Native Linux: for non-Docker installs

### Local development

```bash
cp .env.example .env
pnpm install
pnpm dev

# before pushing changes
pnpm verify
```
