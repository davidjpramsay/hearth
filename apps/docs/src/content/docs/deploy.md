---
title: "Install step by step"
description: "Follow the steps for your system. Most home installs should use Docker or Synology."
---

Follow the steps for your system. Most home installs should use Docker or Synology.

Docker Compose: copy `.env.example` to `.env`, then set `ADMIN_PASSWORD`, `TZ`, and `DEFAULT_SITE_TIMEZONE`.

Start Hearth with `docker compose up -d`.

Open `http://<your-host>:3000/admin/login` and sign in with `ADMIN_PASSWORD`.

Open `Settings`, set the household timezone, then open `/` once on each display so it registers.

Go back to `Settings`, name each display, and assign a layout or set.

On Synology, use `.env.synology` and `docker-compose.synology.yml` instead of the standard files.

For native Linux or Raspberry Pi, install Node, pnpm, and git first, then run `pnpm install`, `pnpm build`, and `pnpm start`.

## Key Points

- Default runtime URL: `http://<host>:3000`
- Admin login: `http://<host>:3000/admin/login`
- Set `HOST=0.0.0.0` if other devices on your LAN need to reach a native install.
- Do not expose Hearth directly to the public internet.

### Docker install

```bash
cp .env.example .env
# edit .env and set ADMIN_PASSWORD, TZ, DEFAULT_SITE_TIMEZONE

docker compose up -d

# later updates
docker compose pull
docker compose up -d
```
