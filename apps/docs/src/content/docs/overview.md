---
title: "What Hearth does"
description: "Hearth is a household display system for dashboards, layouts, photo-driven rotation, chores, calendars, planner boards, weather, and site-local time-aware modules."
---

Hearth is a household display system for dashboards, layouts, photo-driven rotation, chores, calendars, planner boards, weather, and site-local time-aware modules.

A display opens the dashboard, checks in with the server, receives the active layout or set, and then renders SDK modules inside the grid.

The server is the source of truth for household timezone, display routing, module APIs, saved settings, and cached provider data.

The web app contains both the display runtime and the admin experience, so most work happens in one frontend package with server-backed routes where secrets or integrations are involved.

## Key Points

- Display clients use synced server time instead of trusting the Pi clock directly.
- Layouts can be selected directly or through set logic and time/photo-based routing.
- Modules are SDK-first and auto-discovered from the web app.
