# Deployment

Hearth is not Synology-specific. The project now supports an image-first deployment workflow for normal installs, while keeping source-based development and advanced source-build installs available.

## Common Requirements

Every deployment mode needs:

- a persistent writable data directory
- port `3000` reachable on your LAN
- `ADMIN_PASSWORD` set for the first startup
- optional `ESV_API_KEY` if you want the Bible Verse module to load live data

Persistent data contains:

- `hearth.db`
- `.jwt-secret`
- `.calendar-key`
- `backups/`
- `photos/`

Photos should live under:

```text
DATA_DIR/photos
```

## Deployment Options

### 1. Native Node

Use this when you want Hearth to run directly on a Linux box, mini PC, Raspberry Pi, or similar host without Docker.

Requirements:

- Node 20+
- pnpm 9+

Basic flow:

1. Copy `.env.example` to `.env`.
2. Set a real `ADMIN_PASSWORD`.
3. Run `pnpm install`.
4. Run `pnpm build`.
5. Run `pnpm start`.

### 2. Generic Docker / Docker Compose

This is the recommended Docker path for most users.

Files to use:

- `.env.example`
- `docker-compose.yml`

The default compose file pulls the published image:

```text
ghcr.io/davidjpramsay/hearth:latest
```

Basic flow:

1. Copy `.env.example` to `.env`.
2. Set a real `ADMIN_PASSWORD`.
3. Review the `./data:/app/data` volume in `docker-compose.yml`.
4. If you want Kobo Reader, also set `KOBO_READER_*` in `.env` and add the two optional read-only mounts in `docker-compose.yml`.
5. Run `docker compose pull`.
6. Run `docker compose up -d`.

If you want to pin a release instead of using `latest`, set:

```env
HEARTH_IMAGE=ghcr.io/davidjpramsay/hearth:v0.1.0
```

### 3. Generic Docker Source Build

Use this only when you intentionally want Docker to build from local source instead of pulling a published image.

Files to use:

- `.env.example`
- `docker-compose.build.yml`

Basic flow:

1. Copy `.env.example` to `.env`.
2. Set a real `ADMIN_PASSWORD`.
3. Review the `./data:/app/data` volume in `docker-compose.build.yml`.
4. If you want Kobo Reader, also set `KOBO_READER_*` in `.env` and add the two optional read-only mounts in `docker-compose.build.yml`.
5. Run `docker compose -f docker-compose.build.yml up --build -d`.

This is mainly for advanced users, local container debugging, or custom forks.

### 4. Synology Container Manager

Use this when the target host is a Synology NAS.

Files to use:

- `.env.synology.example`
- `docker-compose.synology.yml`
- `docs/SYNOLOGY_DEPLOYMENT.md`

The Synology compose file also pulls the published image by default.

### 5. Reverse Proxy / HTTPS

This is optional and can sit in front of the native or Docker deployments.

Use it when:

- you want HTTPS
- you want a friendly local hostname
- you want external access

## First Startup Checklist

On the first successful startup:

- sign in at `http://<host-lan-ip>:3000/admin`
- confirm login works with `ADMIN_PASSWORD`
- confirm the database file exists
- confirm `.jwt-secret` and `.calendar-key` exist
- confirm the `backups/` folder exists

After the first successful startup:

- the admin password hash is stored in the database
- changing `ADMIN_PASSWORD` does not rotate the existing admin password automatically
- you can remove `ADMIN_PASSWORD` from the runtime env if you do not want to keep it there

## Updates

Update behavior depends on the deployment mode:

- image-based Docker and Synology installs: `docker compose pull && docker compose up -d`
- source-build Docker installs: `docker compose -f docker-compose.build.yml up --build -d`
- native Node installs: pull the new source, rebuild, and restart the process

## Which Option To Pick

- choose `Native Node` if you want the fewest moving parts on a dedicated host
- choose `Generic Docker / Docker Compose` if you want the easiest day-2 updates on any Docker system
- choose `Synology Container Manager` if your target host is a Synology NAS and you want DSM-native project management
- choose `Generic Docker Source Build` only if you deliberately want containers built from your local source tree
