---
title: "Use the admin app"
description: "The admin flow is centred on Layouts, Settings, Children, Chores, and School. Displays appear after they open the dashboard once."
---

The admin flow is centred on Layouts, Settings, Children, Chores, and School. Displays appear after they open the dashboard once.

Use Layouts to build grid-based pages, attach SDK modules, and configure photo/set logic.

Use Settings to manage connected displays, household timezone, saved calendar feeds, and runtime/device details.

Use Children to manage the shared child roster that feeds both chores and school planning.

Use Chores to manage payouts, schedules, and household task behavior for those children.

Use School to manage reusable day plans, assign them to repeat weekdays, and edit their timetables.

## Key Points

- Admin login lives at `/admin/login`.
- The dashboard display runtime lives at `/`.
- Saved calendar feeds are global and can be referenced by calendar modules by ID.
- Settings autosaves low-risk edits such as household timezone, calendar feed edits, and per-display theme/routing changes.
- School day plans are global, each weekday can only belong to one plan, and the School module renders the plan that matches today's household weekday.
- The main admin pages now share the same section framing and tighter helper copy, so Settings, Children, Chores, and School read as one system instead of separate generations of UI.
- Settings now includes an operational health panel with display check-in summaries, stale-device detection, calendar cache warmth, and backup status.
- That same panel now surfaces database size and last-modified time, so storage state is visible without shell access.
- The layout set-logic editor supports undo/redo, draft recovery, and starter actions for first-time graph setup.
- Displays and snapshot-backed modules now show softer `Offline` or `Cached` badges when they are serving last-good data.
- The main display modules now use shared skeleton loading states instead of plain `Loading ...` copy while data warms up.
- Theme colours now come from curated 12-slot palettes, including the newer Forest and Ember presets.
