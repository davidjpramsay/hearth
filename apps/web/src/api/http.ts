import { handleUnauthorizedAdminResponse } from "../auth/session";

export const API_BASE = import.meta.env?.VITE_API_BASE ?? "/api";

export const request = async <T>(
  path: string,
  init: RequestInit,
  parser: (payload: unknown) => T,
): Promise<T> => {
  const headers = new Headers(init.headers ?? {});
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    handleUnauthorizedAdminResponse(response.status, headers);
    const errorBody = await response.json().catch(() => ({}));
    const message =
      typeof errorBody.message === "string"
        ? errorBody.message
        : `Request failed (${response.status})`;
    throw new Error(message);
  }

  if (response.status === 204) {
    return parser(undefined);
  }

  const data = await response.json().catch(() => undefined);
  return parser(data);
};

export const withAuth = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
});
