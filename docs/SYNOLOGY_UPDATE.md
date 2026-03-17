# Synology Update Routine

Use this when your Synology project is already image-based and you want to pull a newer published Hearth image.

Short answer:

- do not recreate the project
- do not resync the full repo to the NAS
- pull the new image
- restart the existing project

## Recommended Defaults

These examples assume:

- project name: `hearth`
- project folder: `/volume1/docker/hearth/project`
- compose file: `docker-compose.synology.yml`
- data folder: `/volume1/docker/hearth/data`

## Normal Update Flow

### Option A: SSH

If SSH is enabled on the Synology, use:

```bash
ssh -t -p <ssh-port> <synology-user>@<synology-ip> '
  cd /volume1/docker/hearth/project &&
  sudo /usr/local/bin/docker compose -f docker-compose.synology.yml pull &&
  sudo /usr/local/bin/docker compose -f docker-compose.synology.yml up -d &&
  sudo /usr/local/bin/docker compose -f docker-compose.synology.yml ps
'
```

For a default DSM SSH setup on port `22`, that becomes:

```bash
ssh -t <synology-user>@<synology-ip> '
  cd /volume1/docker/hearth/project &&
  sudo /usr/local/bin/docker compose -f docker-compose.synology.yml pull &&
  sudo /usr/local/bin/docker compose -f docker-compose.synology.yml up -d &&
  sudo /usr/local/bin/docker compose -f docker-compose.synology.yml ps
'
```

### Option B: DSM UI

If you prefer Container Manager:

1. Open `Container Manager`.
2. Go to `Projects`.
3. Select `hearth`.
4. Pull or redeploy the latest image for the project.
5. Start the project if DSM does not do it automatically.

## Pinning A Specific Release

If you do not want `latest`, edit `/volume1/docker/hearth/project/.env` and set:

```env
HEARTH_IMAGE=ghcr.io/davidjpramsay/hearth:v0.1.0
```

Then run the same update command:

```bash
docker compose -f docker-compose.synology.yml pull &&
docker compose -f docker-compose.synology.yml up -d
```

If you renamed `docker-compose.synology.yml` to `docker-compose.yml` in the Synology
project folder, you can omit `-f docker-compose.synology.yml`.

## What You Do Not Need To Repeat

For normal updates, you do not need to:

- recreate the Container Manager project
- resync the full source tree
- rebuild pnpm dependencies on the NAS
- re-enter the full setup wizard
- recreate `/volume1/docker/hearth/data`

## First-Time Migration Note

If your current Synology install was created from an older source-build compose file, switch it to the image-based `docker-compose.synology.yml` once before using this routine.

See:

- `docs/SYNOLOGY_DEPLOYMENT.md`

## Notes

- `docker compose -f docker-compose.synology.yml pull` downloads a new published image
  without rebuilding from source.
- `docker compose -f docker-compose.synology.yml up -d` recreates the container if the
  image changed.
- Data in `/volume1/docker/hearth/data` is preserved because it is mounted from the NAS filesystem.
- If you only change runtime configuration, updating `.env` and restarting the project may be enough.
