# Image Publishing

Hearth now includes a GitHub Actions workflow that publishes multi-architecture container images to GitHub Container Registry.

Published image:

```text
ghcr.io/davidjpramsay/hearth
```

## What The Workflow Does

Workflow file:

```text
.github/workflows/publish-container.yml
```

On every push to `main`, GitHub Actions:

- builds the Docker image
- publishes `ghcr.io/davidjpramsay/hearth:latest`
- publishes branch and SHA tags

On every pushed tag like `v0.1.0`, GitHub Actions also publishes:

- `ghcr.io/davidjpramsay/hearth:v0.1.0`
- `ghcr.io/davidjpramsay/hearth:0.1.0`
- `ghcr.io/davidjpramsay/hearth:0.1`

The workflow builds for:

- `linux/amd64`
- `linux/arm64`

## Maintainer Workflow

### Publish the latest mainline image

1. Commit changes.
2. Push to `main`.
3. GitHub Actions publishes a new `latest` image.

### Publish a versioned release

1. Commit and push your release-ready changes.
2. Create a tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

3. GitHub Actions publishes the versioned image tags.

## GitHub Setup Notes

This workflow uses `GITHUB_TOKEN`, so no extra registry secret is required for GHCR publishing from the same repository.

To make pulls work easily for other users:

- keep the repository public
- make sure the GHCR package visibility is public if GitHub does not inherit it automatically

If users cannot pull the image anonymously, the first thing to check is the package visibility in GitHub Packages.

## Developer Workflow

Local development stays source-based:

```bash
pnpm dev
pnpm build
pnpm start
```

For local container builds from source, use:

```bash
docker compose -f docker-compose.build.yml up --build
```

## Deployment Workflow

Normal users should deploy with:

- `docker-compose.yml` for generic Docker
- `docker-compose.synology.yml` for Synology

Normal updates become:

```bash
docker compose pull
docker compose up -d
```

No NAS-side source build is required.
