# Performance Guide

This project is optimized for always-on kiosk use, including lower-power hardware.

## Server Optimizations

## SQLite + Persistence

- SQLite runs in WAL mode for better concurrent read/write behavior.
- Automatic rolling backups use native SQLite backup snapshots.
- Backup cadence and retention are configurable:
  - `BACKUP_INTERVAL_MINUTES`
  - `BACKUP_RETENTION_DAYS`

## Photos Module

- Folder scans are cached per resolved folder path.
- Folder watchers mark cache dirty only when needed.
- Periodic fallback rescan runs every 15s.
- Photo metadata parsing is cached by `(path, mtimeMs, size)`.
- Metadata reads use header-first parsing; full file reads are fallback-only.
- Multi-folder collections merge folder caches without duplicating file metadata scans.
- Photo image responses now use long-lived browser cache headers (`public, max-age=31536000, immutable`).
- Photo image ids are derived from path + `mtimeMs` + size, so updated files naturally get new URLs.

Impact: avoids repeated full image reads and repeated metadata parsing on unchanged files, and lets cache-capable display clients reuse already-loaded images instead of refetching them across weaker Wi-Fi links.

## Weather Module

- Location search responses are cached in memory.
- Current weather responses are cached by normalized location/unit key.
- Weather cache TTL follows module refresh interval (minimum 60s).

Impact: reduces external API calls and lowers CPU/network churn.

## Calendar Module

- Calendar source payloads are cached with refresh interval control.
- Failed refreshes can serve cached events with warnings.
- API responses use stable source ids instead of raw calendar URLs.

Impact: stable dashboard behavior during network hiccups.

## Chores Module

- Week stats are computed from a 7-day payday-bounded window.
- Board generation filters out dates before chore creation (non-retrospective chores).
- Display + admin refresh from SSE and periodic polling to stay correct over day/week boundaries.

Impact: lower unnecessary schedule expansion and predictable week rollover behavior.

## Frontend Optimizations

- Display grid calculations are memoized.
- Display is non-draggable/non-resizable at runtime.
- SSE drives updates; no aggressive polling loop.
- Empty-layout state is rendered explicitly (no blank silent failure).
- Layout switches are currently instant (no fade pipeline), minimizing animation overhead.
- Photos orientation events are emitted from real image frames only, reducing spurious switches.
- In set mode, Photos slideshow interval follows the active set rule timer (`cycleSeconds`) for synchronized layout/photo cadence.
- In set mode, resolved photo collections are scoped by set/rule context; playback state remains isolated by screen session.

## Recommended Hardware Setup

- Use Chromium kiosk mode.
- Keep display resolution native (avoid scaling layers).
- Prefer JPEG/PNG/WebP/BMP/GIF for photos.
- Use SSD storage if possible (faster folder scans and DB IO).
- Keep photo directories local/network-stable.

## Operational Recommendations

- Keep weather refresh >= 300s unless needed.
- Keep calendar refresh >= 300s unless required.
- Use one active Photos module for orientation-triggered switching.
- Avoid extremely deep photo folder trees if unnecessary.
- In auto photo switching mode, keep portrait/landscape target lists short and intentional (typically 1-3 each) to reduce abrupt context churn.
- Deploy updated server builds when photo-serving behavior changes; browser cache improvements only take effect after the app server is updated.
- Browser caching helps repeat photo loads, but it does not replace client-side network quality work on unstable kiosk hardware.

## Benchmark Checklist

When changing core rendering or backend loops, validate:

1. CPU usage at idle display for 10+ minutes.
2. Memory growth over 30+ minutes (check for leaks).
3. Layout switch latency after admin save.
4. Photos rescan behavior when adding/removing files.
5. External API rate stability (weather/calendar).

## Regression Guard

Before pushing:

```bash
pnpm build
```

For runtime checks:

- Confirm `/api/layouts?activeOnly=true` returns one active layout.
- Confirm dashboard renders modules with no console errors.
- Confirm weather and photo endpoints return structured payloads.
