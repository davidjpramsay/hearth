---
title: "Build time-safe modules"
description: "If a module depends on household time or `today`, use synced display time instead of browser time."
---

If a module depends on household time or `today`, use synced display time instead of browser time.

Set `manifest.timeMode` on purpose: `device-local`, `site-local`, or `source-local`.

For `site-local` modules, read time and timezone from `apps/web/src/runtime/display-time.ts`.

Refresh at the next site-local day boundary.

If a module uses cached data, make sure the cache still matches the current household date.

## Key Points

- Good references: clock, chores, calendar, Bible verse, and School planner.
- Do not trust raw `new Date()` for household-day logic.
- Use timezone-aware helpers from `@hearth/shared`.
- School planner uses synced household time for day selection and its current-time line.

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
