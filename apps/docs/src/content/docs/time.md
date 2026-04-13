---
title: "Build time-safe modules"
description: "If a module depends on household time or `today`, use synced display time instead of browser time."
---

If a module depends on household time or `today`, use synced display time instead of browser time.

Set `manifest.timeMode` intentionally: `device-local`, `site-local`, or `source-local`.

For `site-local` modules, read time and timezone from `apps/web/src/runtime/display-time.ts` and refresh at the next site-local day boundary.

If a module reuses cached data, check that the cache still matches the current household date.

If cached data is shown after a failure, prefer a soft stale badge over a hard error.

## Key Points

- Good references: clock, chores, calendar, bible verse, and School planner.
- Do not trust raw `new Date()` for household-day logic on displays.
- Use timezone-aware helpers from `@hearth/shared` for day comparisons.
- The School planner uses synced household time for day selection and its current-time line.

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
