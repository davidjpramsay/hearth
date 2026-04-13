---
title: "Choose an install path"
description: "Pick the install path that matches how you want to use Hearth: local development, Docker, Synology, or a native Linux / Raspberry Pi install."
---

Pick the install path that matches how you want to use Hearth: local development, Docker, Synology, or a native Linux / Raspberry Pi install.

For development on your own machine, use the local pnpm workflow. That gives you the Vite web app, the Fastify server, and the shared package watchers together.

For a normal home install on a Linux box, mini PC, or Raspberry Pi, the easiest production path is Docker Compose with the published image. That avoids local source builds on the target machine.

For Synology, use the checked-in Synology compose file and env example. That is the supported NAS path and keeps updates simple.

If you prefer a native Linux install instead of Docker, use Node, pnpm, and a system service. That is workable, but Docker is the easier default for most people.

## Key Points

- Choose local pnpm only if you are developing or debugging Hearth itself.
- Choose Docker Compose for the simplest production install on most systems.
- Choose the Synology compose path if you are using Container Manager.
- Choose native Linux only if you deliberately want to manage Node and the service yourself.

### Local development

```bash
cp .env.example .env
pnpm install
pnpm dev

# before pushing changes
pnpm verify
```
