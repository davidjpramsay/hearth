const TOKEN_KEY = "hearth-admin-token";

export const getAuthToken = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setAuthToken = (token: string): void => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Ignore storage write failures.
  }
};

export const clearAuthToken = (): void => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Ignore storage write failures.
  }
};
