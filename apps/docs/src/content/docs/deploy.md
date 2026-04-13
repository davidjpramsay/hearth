---
title: "Install on your system"
description: "Use the simplest path for your machine. Most installs should use the published container image."
---

Use the simplest path for your machine. Most installs should use the published container image.

Docker: copy `.env.example` to `.env`, set the password and timezone, then start Docker Compose.

Synology: use `.env.synology.example` and `docker-compose.synology.yml`, and keep the data volume persistent.

Native Linux or Raspberry Pi: install Node and pnpm, then run `pnpm install`, `pnpm build`, and `pnpm start`.

After startup, open `/admin/login`, set the household timezone, and open `/` once on each display device.

Set the deployment timezone and the household timezone so a fresh install does not fall back to UTC.

## Key Points

- Default runtime URL is `http://<host>:3000`.
- Set `HOST=0.0.0.0` if devices on your LAN need to reach a native install.
- Do not expose Hearth directly to the public internet.
- Use `pnpm verify` before publishing or building a release image.

### Docker or Synology update flow

```bash
pnpm verify

# Docker host
docker compose pull
docker compose up -d

# Synology
docker compose -f docker-compose.synology.yml pull
docker compose -f docker-compose.synology.yml up -d
docker compose -f docker-compose.synology.yml ps
```
