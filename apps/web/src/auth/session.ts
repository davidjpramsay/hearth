import { clearAuthToken } from "./storage";

export const handleUnauthorizedAdminResponse = (
  status: number,
  headers: Headers,
): boolean => {
  if (status !== 401 || !headers.has("Authorization") || typeof window === "undefined") {
    return false;
  }

  clearAuthToken();

  if (window.location.pathname !== "/admin/login") {
    window.location.replace("/admin/login");
  }

  return true;
};
