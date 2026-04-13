# Roadmap

This is the prioritized feature sequence for upcoming work.

## Current Baseline (Already Implemented)

- Chores tile grouped by child with per-child weekly completion and earned-pay indicators.
- Chores completion tracking is week-scoped with configurable payday (`paydayDayOfWeek`).
- Chore schedules are non-retrospective (start from explicit `startsOn` dates in the household timezone).
- Explicit module time model:
  - `device-local` for screen clock modules
  - `site-local` for household-day modules like chores and bible verse
  - `source-local` for provider/feed-driven modules like weather and calendar
- Auto-generated app secrets and rolling SQLite backups.
- Calendar source URLs encrypted at rest.
- Server-managed Settings view for per-screen theme and routing assignment.
- Set-driven layout logic graph with portrait/landscape branching and rule-level cycle timers.
- Visual action-node graph authoring that compiles into the runtime set graph.
- Built-in Count Down SDK module with date/time countdown modes.
- PWA installability (manifest + service worker) and iPad Home Screen standalone support.

## Priority 1: Chores module hardening (Completed)

Goal: make chores robust, fast, and polished for daily family use.

Scope:

- Improve chores management workflows and admin clarity.
- Improve chores board reliability and edge-case behavior.
- Tighten module performance and loading behavior.

Done criteria:

- Daily chores flow is smooth on desktop + kiosk.
- No known blocking UX issues in create/edit/complete flows.
- Stable behavior across week boundaries and schedule types.

Status: Completed for current milestone. Revisit only as needed for future polish.

## Priority 2: Touchscreen support (Active Next)

Goal: first-class touch interaction in admin and kiosk contexts.

Scope:

- Touch-friendly drag, resize, and scrolling behavior.
- Comfortable touch target sizing and spacing.
- Validation on real touch hardware.

Done criteria:

- Core admin layout editing works reliably with touch.
- No accidental drag/scroll conflicts in common flows.

## Priority 3: Theme system

Goal: configurable visual themes without increasing runtime overhead.

Scope:

- Theme tokens for colors, typography, spacing, and surfaces.
- Theme selector in admin.
- Clean defaults optimized for readability.

Done criteria:

- Theme changes are global and consistent.
- Runtime overhead remains minimal on low-power devices.

## Priority 4: Smooth transitions between layouts (In Progress)

Goal: keep layout switching buttery on low hardware while staying lightweight.

Scope:

- Keep current default behavior instant (no animation) for maximum stability/performance.
- Design optional transition modes that can be toggled on only when hardware allows.
- Optional transition presets for layout switches.
- Performance-safe animation approach for kiosk hardware.

Done criteria:

- Default transition feels smooth during frequent orientation/layout changes.
- Effects can be disabled or reduced if performance is constrained.

## Priority 5: Set-Driven Timed Routing (Completed)

Goal: deliver explicit set-based logic routing with per-rule timing.

Scope:

- Visual set designer with router and layout nodes compiled to the runtime graph.
- Rule-level `cycleSeconds` control for each resolved layout target.
- Predictable branch routing from selected photo orientation.

Done criteria:

- Admin UI shows and edits routing flow in one place.
- Runtime resolves set sequence per screen session.
- Timer behavior is consistent across layout switching.

Status: Completed for current milestone.

## Priority 6: Centralized Device Assignment Overrides (Completed)

Goal: move from browser-local routing persistence to server-managed device identity and assignment.

Scope:

- Add a device identity model (stable device id + user-friendly name/label).
- Add an admin "Settings" view to assign each device:
  - follow a set, or
  - pin a layout.
- Resolve layout in this order:
  - device override (if present)
  - default set/layout routing
  - active/fallback layout

Done criteria:

- A device can be assigned and persistently uses its configured layout behavior.
- Displays can be reassigned between saved sets and pinned layouts without losing global routing config.
- Multi-device installs can run different layouts simultaneously without conflicts.

Status: Completed for current milestone.

## Current Polish and Reliability Backlog

This is the current concrete polish backlog after the major platform and module work above.

### 1. Set-logic editor UX hardening

Goal: make the layout-set graph editor predictable under heavy daily admin use.

Scope:

- Undo/redo for graph edits.
- Clearer selected-node state and graph-status feedback.
- Better inline connection guidance when an output already has a path.
- Draft recovery for interrupted graph edits.
- Tighter first-run empty states and guidance.

Status:

- Undo/redo is implemented.
- Selected-node status and connection guidance are implemented.
- Local draft recovery and first-run starter actions are implemented.
- Remaining work is mostly interaction polish and broader regression coverage.

### 2. Planner display polish

Goal: make the School display module feel production-finished on wall displays.

Scope:

- Scale row height to available vertical space.
- Add optional current-time indicator and now/next emphasis.
- Improve long-title and note overflow.
- Tune portrait density and compact mode behavior.

Status:

- Row height scaling is implemented.
- Notes now render with normal body copy styling instead of all-caps metadata styling.
- Current-time and next-up emphasis is implemented in the runtime view.
- Remaining work is portrait-density tuning and any future compact-mode option.

### 3. Admin autosave consistency

Goal: make admin edits feel consistent across settings-heavy screens.

Scope:

- Prefer autosave for low-risk changes.
- Reserve explicit save buttons for structural or destructive edits.
- Standardize saving/saved/error status affordances.

Status:

- Settings now autosaves household timezone, calendar feeds, and per-display assignment/theme edits.
- Structural and destructive actions such as create, remove, and delete remain explicit.
- Remaining work is to spread the same status language to any other low-risk admin forms that still feel inconsistent.

### 4. Offline and degraded-state polish

Goal: keep Hearth calm and understandable on flaky networks and cold boots.

Scope:

- Replace harsh blocking errors with softer stale/offline states where safe.
- Show when a tile is rendering cached data.
- Improve first-boot empty states.

Status:

- Shared connectivity handling now distinguishes between offline-with-cache, cached-but-disconnected, and first-sync blocking failures.
- Dashboard and modules now surface `Offline` / `Cached` badges instead of only generic disconnected icons.
- Remaining work is mostly broader empty-state design and any deeper per-module stale indicators.

### 5. Theme system refinement

Goal: make palette-slot themes feel more intentional and less purely generated.

Scope:

- Tune the 12-slot palette per theme.
- Tighten contrast rules for pale slots.
- Add a few stronger curated theme presets.

Status:

- Theme palettes are now curated per theme instead of being driven only by hue offsets from a primary colour.
- Palette slots are contrast-adjusted so every slot keeps a readable foreground.
- Two stronger presets were added: `Forest` and `Ember`.
- Remaining work is mostly aesthetic tuning rather than core system changes.

### 6. Admin UI consistency pass

Goal: reduce the “grown over time” feel across admin pages.

Scope:

- Align section headers, action rows, and helper copy.
- Standardize button/chip/input sizing.
- Trim low-value explanatory text.

Status:

- Settings, Children, Chores, and School now share the same section-card and section-header framing.
- Chores has been moved onto the same button, field, panel, and helper-text sizing used by the newer admin screens.
- Remaining work is mostly final copy tightening and any small one-off control sizing that still feels out of family.

### 7. Module loading and transition polish

Goal: improve perceived quality on low-power display hardware.

Scope:

- Better module skeleton states.
- Smoother state transitions between loading/ready/stale states.

Status:

- Shared skeleton states now cover the main display modules instead of dropping to plain `Loading ...` copy.
- The loading treatment is now consistent across chores, weather, calendar, photos, bible verse, and School planner.
- Remaining work is mostly transition tuning between loading, cached, and ready states rather than first-pass placeholders.

### 8. Operational observability

Goal: make long-running installs easier to operate without shell access.

Scope:

- Display sync health.
- Module refresh health.
- Cache/feed status summaries.
- Stale device detection.

Status:

- Settings now shows an operational health summary for display check-ins, stale devices, calendar cache warmth, and automatic backup status.
- Backup diagnostics now report latest backup time, retained backup count, schedule, and the most recent backup error if one occurred.
- Calendar diagnostics now report enabled feed count, warm in-memory source cache count, in-flight refreshes, and last prefetch completion time.
- Remaining work is deeper per-module refresh visibility if you decide you want a fuller monitoring view later.

### 9. Safer migrations and backup visibility

Goal: make persistence and recovery more transparent to operators.

Scope:

- Backup status in Settings.
- DB/migration status.
- Clear export/import story for household state.

Status:

- Backup visibility is now in Settings through the operational health panel, including latest backup time, retained backup count, schedule, and last backup error.
- Storage visibility now includes database size and last-modified time, so operators can confirm the install is writing state without shell access.
- Remaining work is explicit migration/version reporting and a real export/import flow for household state.

### 10. Public docs media polish

Goal: improve first-run comprehension for new users and contributors.

Scope:

- Short demo video.
- Selected screenshots for key admin pages.
- A simple “how Hearth works” flow diagram.

Status:

- The docs site homepage now has a dedicated demo-video slot and clearer install-path entry points.
- Media asset folders are prepared so screenshots and the final demo video can be dropped into the docs publishing path later.
- Remaining work is the actual media creation: the final video, selected screenshots, and the flow diagram artwork.
