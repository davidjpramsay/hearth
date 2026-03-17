# Synology Deployment

Synology is now treated as an image-based deployment target. The normal flow is:

1. keep only the compose file and `.env` on the NAS
2. let Container Manager pull the published image from GitHub Container Registry
3. update by pulling a new image, not by rebuilding from source on the NAS

For the broader deployment overview, see `docs/DEPLOYMENT.md`.

## Recommended Defaults

Use these values unless you already have a different Synology Docker layout:

- Project name: `hearth`
- Container name: `hearth`
- Project folder: `/volume1/docker/hearth/project`
- Persistent data path: `/volume1/docker/hearth/data`
- Default image: `ghcr.io/davidjpramsay/hearth:latest`

## Files To Use

You only need:

- `.env.synology.example`
- `docker-compose.synology.yml`

The full repo does not need to live on the NAS for normal image-based installs.

## Recommended Folder Layout

```text
/volume1/docker/hearth/project
/volume1/docker/hearth/data
```

Use:

- `/volume1/docker/hearth/project` for `docker-compose.synology.yml` and `.env`
- `/volume1/docker/hearth/data` for persistent app data

## `.env` For Synology

In `/volume1/docker/hearth/project`, create:

```text
.env
```

Start from `.env.synology.example` and set at least:

```env
ADMIN_PASSWORD=change-me
DEFAULT_SITE_TIMEZONE=Australia/Perth
```

Optional image pinning:

```env
HEARTH_IMAGE=ghcr.io/davidjpramsay/hearth:v0.1.0
```

Leave `HEARTH_IMAGE` on `latest` if you want the newest published mainline image.

`DEFAULT_SITE_TIMEZONE` is recommended for container installs so site-local modules
use the correct calendar day before the admin UI has saved a household timezone into
the database.

Optional Kobo Reader support:

```env
KOBO_READER_APP_DB_PATH=/external/calibreweb/app.db
KOBO_READER_LIBRARY_DB_PATH=/external/books/metadata.db
KOBO_READER_LIBRARY_ROOT=/external/books
```

These values only matter if you want the `Kobo Reader` module.

## Container Manager Steps

### 1. Create folders on the NAS

In File Station, create:

```text
/volume1/docker/hearth/project
/volume1/docker/hearth/data
```

### 2. Put the deployment files on the NAS

Copy these files into:

```text
/volume1/docker/hearth/project
```

- `docker-compose.synology.yml`
- `.env`

If you want the `Kobo Reader` module, make sure these folders already exist on the NAS:

- `/volume1/docker/calibreweb`
- `/volume1/media/Books`

### 3. Install Container Manager

If it is not already installed:

1. Open Package Center.
2. Install `Container Manager`.

### 4. Create the project in Container Manager

In DSM:

1. Open `Container Manager`.
2. Go to `Project` or `Projects`.
3. Click `Create`.
4. Create the project from `docker-compose.synology.yml`.
5. Set project name to `hearth`.
6. Use `/volume1/docker/hearth/project` as the project folder.
7. Start the project.

If DSM asks for the environment file separately, use:

```text
/volume1/docker/hearth/project/.env
```

### 5. Wait for the image pull

Container Manager will pull the published image instead of building from source.

That means:

- no pnpm install on the NAS
- no TypeScript build on the NAS
- much faster installs and updates

### 6. Open Hearth

Open:

```text
http://<your-synology-lan-ip>:3000/admin
```

Sign in with the `ADMIN_PASSWORD` value from `.env`.

## Verify Persistent Data

After startup, check that these exist under:

```text
/volume1/docker/hearth/data
```

- `hearth.db`
- `.jwt-secret`
- `.calendar-key`
- `backups/`

For local photos, place them under:

```text
/volume1/docker/hearth/data/photos
```

## Optional Kobo Reader Mounts

The Synology compose file now includes active read-only mounts for Kobo Reader:

```text
/volume1/docker/calibreweb -> /external/calibreweb
/volume1/media/Books -> /external/books
```

These are used to read:

- Calibre-Web Kobo sync state from `app.db`
- Calibre library metadata from `metadata.db`
- book covers from the Calibre library folders

If you do not use Calibre-Web / Kobo sync, you can remove those mounts and the
`KOBO_READER_*` env vars from your Synology deployment.

## Updating A Synology Install

Normal updates no longer require syncing source code to the NAS.

Use:

- `docs/SYNOLOGY_UPDATE.md` for the exact update flow

The normal update is now:

1. publish a new image from GitHub
2. run `docker compose -f docker-compose.synology.yml pull`
3. run `docker compose -f docker-compose.synology.yml up -d`

If you renamed the compose file to `docker-compose.yml` inside the Synology project
folder, you can omit `-f docker-compose.synology.yml`.

## One-Time Migration From An Older Source-Build Install

If your current Synology project was created from an older source-build compose file, you need one one-time migration to switch it to image-based updates.

Use one of these approaches:

1. Edit the existing project so it uses the new `docker-compose.synology.yml` with `image: ghcr.io/davidjpramsay/hearth:latest`.
2. Or recreate the `hearth` project once using the new image-based compose file while keeping the same persistent data path:

```text
/volume1/docker/hearth/data
```

Because the database and secrets live in `/volume1/docker/hearth/data`, recreating the project does not wipe your app data as long as the data volume path stays the same.

After that one-time migration, future updates are pull/redeploy only.

## If Image Pulls Fail

Check:

- the NAS has internet access to `ghcr.io`
- the image package is public, or you have configured registry credentials
- the project folder and `.env` file are readable by Container Manager
- `/volume1/docker/hearth/data` exists and is writable

For maintainer-side publishing details, see `docs/IMAGE_PUBLISHING.md`.
