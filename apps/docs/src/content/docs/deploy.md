---
title: "Deploy to Synology"
description: "Production deployment currently revolves around publishing the image, pulling it on Synology, and recreating the compose service."
---

Production deployment currently revolves around publishing the image, pulling it on Synology, and recreating the compose service.

The Synology project uses the checked-in compose template and persistent data volume for server state.

A normal update path is publish image, pull on the NAS, recreate the container, and run a health check against the root app and server-status endpoint.

Timezone defaults should be set in the deployment environment as well as in admin settings so fresh containers do not silently fall back to UTC.

### Supported deployment check path

```bash
pnpm verify

# then on Synology
docker compose -f docker-compose.synology.yml pull
docker compose -f docker-compose.synology.yml up -d
docker compose -f docker-compose.synology.yml ps
```
