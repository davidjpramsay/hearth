# Synology Checklist

Minimal checklist for the image-based Synology deployment path.

For the full guide, see:

- `docs/SYNOLOGY_DEPLOYMENT.md`

## Files

Keep these in your Synology project folder:

- `docker-compose.synology.yml`
- `.env`

## Minimum Env

Set this before the first boot:

```env
ADMIN_PASSWORD=change-me
DEFAULT_SITE_TIMEZONE=Australia/Perth
```

Optional:

```env
HEARTH_IMAGE=ghcr.io/davidjpramsay/hearth:latest
ESV_API_KEY=your_api_key_here
KOBO_READER_APP_DB_PATH=/external/calibreweb/app.db
KOBO_READER_LIBRARY_DB_PATH=/external/books/metadata.db
KOBO_READER_LIBRARY_ROOT=/external/books
```

Notes:

- `HEARTH_IMAGE` can be pinned to a release tag if you do not want `latest`.
- `DEFAULT_SITE_TIMEZONE` is recommended for hosted/container installs so `chores` and other site-local modules do not fall back to the container timezone before the household timezone is saved in Admin.
- `ESV_API_KEY` is only needed if you want the Bible Verse module to load live data.
- `KOBO_READER_*` is only needed if you want the Kobo Reader module.
- After the first successful startup, you can remove `ADMIN_PASSWORD` if you do not want it stored in the runtime env.

## Required Mount

Create one persistent host folder and mount it to:

```text
/app/data
```

Recommended Synology host path:

```text
/volume1/docker/hearth/data
```

What will live there:

- `hearth.db`
- `.jwt-secret`
- `.calendar-key`
- `backups/`
- `photos/`

If you want local photos, place them under:

```text
/volume1/docker/hearth/data/photos
```

Optional Kobo Reader mounts:

```text
/volume1/docker/calibreweb -> /external/calibreweb:ro
/volume1/media/Books -> /external/books:ro
```

## Network

- expose port `3000`
- use LAN access only unless you are putting it behind HTTPS/reverse proxy
- leave `HOST=0.0.0.0`

## First Boot Checks

- container starts without restart loop
- login works with `ADMIN_PASSWORD`
- `/app/data/hearth.db` exists in the mounted folder
- `/app/data/.jwt-secret` exists
- `/app/data/.calendar-key` exists
- `/app/data/backups/` contains a backup file after startup

## Normal Updates

Use:

```bash
docker compose pull && docker compose up -d
```

On Synology with SSH access, that is typically run from:

```text
/volume1/docker/hearth/project
```
