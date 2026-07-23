const ROUTE_RELOAD_KEY = "hearth:route-load-recovery";
const ROUTE_RELOAD_COOLDOWN_MS = 15_000;

interface RouteReloadAttempt {
  path: string;
  attemptedAt: number;
}

const readLastAttempt = (): RouteReloadAttempt | null => {
  try {
    const raw = window.sessionStorage.getItem(ROUTE_RELOAD_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<RouteReloadAttempt>;
    if (typeof parsed.path !== "string" || typeof parsed.attemptedAt !== "number") {
      return null;
    }
    return { path: parsed.path, attemptedAt: parsed.attemptedAt };
  } catch {
    return null;
  }
};

const rememberAttempt = (attempt: RouteReloadAttempt) => {
  try {
    window.sessionStorage.setItem(ROUTE_RELOAD_KEY, JSON.stringify(attempt));
  } catch {
    // A reload still works when storage is unavailable.
  }
};

/**
 * Vite emits this event when a lazy route cannot load, most commonly because an
 * open tab references an asset from the previous deployment. Reload once to
 * pick up the current HTML and asset manifest instead of leaving the route blank.
 */
export const installRouteLoadRecovery = (): void => {
  if (typeof window === "undefined") return;

  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();

    const now = Date.now();
    const path = `${window.location.pathname}${window.location.search}`;
    const lastAttempt = readLastAttempt();
    if (lastAttempt?.path === path && now - lastAttempt.attemptedAt < ROUTE_RELOAD_COOLDOWN_MS) {
      return;
    }

    rememberAttempt({ path, attemptedAt: now });
    window.location.reload();
  });
};
