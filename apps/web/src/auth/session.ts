import { clearAuthToken } from "./storage";

const ADMIN_LOGIN_PATH = "/admin/login";
const DEFAULT_ADMIN_PATH = "/admin/layouts";

const replaceBrowserLocation = (path: string): boolean => {
  if (typeof window === "undefined") {
    return false;
  }

  if (window.location.pathname !== path) {
    window.location.replace(path);
  }

  return true;
};

export const getSafeAdminPostLoginPath = (input: unknown): string => {
  if (typeof input !== "string" || !input.startsWith("/")) {
    return DEFAULT_ADMIN_PATH;
  }

  return input === ADMIN_LOGIN_PATH ? DEFAULT_ADMIN_PATH : input;
};

export const redirectToAdminLogin = (): boolean => replaceBrowserLocation(ADMIN_LOGIN_PATH);

export const logoutAdminSession = (): boolean => {
  clearAuthToken();
  return redirectToAdminLogin();
};

export const handleUnauthorizedAdminResponse = (
  status: number,
  headers: Headers,
): boolean => {
  if (status !== 401 || !headers.has("Authorization") || typeof window === "undefined") {
    return false;
  }

  return logoutAdminSession();
};
