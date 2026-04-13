---
title: "Write time-safe modules"
description: "Any module that depends on household-local time, midnight rollover, or `today` must use the synced display-time utilities instead of raw browser time."
---

Any module that depends on household-local time, midnight rollover, or `today` must use the synced display-time utilities instead of raw browser time.

Set `manifest.timeMode` intentionally: `device-local`, `site-local`, or `source-local`.

For `site-local` modules, read time and timezone from `apps/web/src/runtime/display-time.ts`, react to display-time updates, and schedule a dedicated rollover refresh at the next site-local day boundary.

If a module caches snapshots locally and its content is day-scoped, validate the snapshot against the current household date before reusing it.

When cached data is reused after a connectivity failure, prefer a soft stale badge over a hard blocking error.

## Key Points

- Good references: clock, chores, calendar, bible-verse, homeschool-planner.
- Do not trust raw `new Date()` for household-day grouping on displays.
- Use timezone-aware helpers from `@hearth/shared` for day comparisons.
- The School planner runtime uses synced household time for day selection and its current-time indicator.

### Site-local module pattern

```ts
const siteTimeZone = getDisplaySiteTimeZone();
const now = getDisplayNow();
const siteDate = toCalendarDateInTimeZone(now, siteTimeZone);
const delayMs = getMillisecondsUntilNextCalendarDateInTimeZone(now, siteTimeZone);

const removeListener = addDisplayTimeContextListener(() => {
  // re-evaluate when synced time or timezone changes
});
```
