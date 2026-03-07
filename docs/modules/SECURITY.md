# Module Security

## Principle

Browser modules should never store or expose sensitive credentials. Integrations run server-side.

## Where integration logic belongs

Server adapters live in:

- `apps/server/src/modules/adapters/*.ts`

They are the only place that should talk to:

- local services/devices
- private APIs
- network shares/NAS
- secret-bearing APIs

## UI responsibilities

Web modules should only call normalized server endpoints:

- `/api/modules/<adapter-id>`
- `/api/modules/stream?topic=<topic>`

## Existing safeguards

- CORS is allowlist-driven (`CORS_ORIGINS`) in `apps/server/src/app.ts`
- calendar source URLs are encrypted at rest
- JWT auth protects admin routes
- module adapter responses can be zod-validated (see `server-status` adapter)

## Safe defaults for new modules

1. Put secrets in server env/config only.
2. Validate adapter output with zod before sending.
3. Return only required fields to the client.
4. Avoid leaking upstream URLs, tokens, or filesystem paths.
