---
title: "Install on common systems"
description: "Use the shortest path that fits your target machine. Most production installs should use the published container image."
---

Use the shortest path that fits your target machine. Most production installs should use the published container image.

Docker host: copy `.env.example` to `.env`, review the timezone and password values, then start `docker compose.yml`. This is the easiest general-purpose production install.

Synology: copy `.env.synology.example` to your real env file, use `docker-compose.synology.yml`, and keep the `/volume1/docker/hearth/data` volume persistent. That is the supported NAS path.

Native Linux or Raspberry Pi: install Node and pnpm, copy `.env.example` to `.env`, run `pnpm install`, `pnpm build`, and `pnpm start`, then keep it alive with `systemd` or another service manager.

After the server starts, open `/admin/login`, sign in, set the household timezone, then load `/` on each display device once so it appears in Settings.

Set both the deployment timezone env vars and the household timezone in admin so a fresh container does not fall back to UTC.

## Key Points

- Default runtime URL is `http://<host>:3000`.
- Use `HOST=0.0.0.0` if devices on your LAN need to reach a native install.
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
