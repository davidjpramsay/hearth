import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { getAuthToken } from "./storage";

interface RequireAuthProps {
  children: ReactNode;
}

export const RequireAuth = ({ children }: RequireAuthProps) => {
  const token = getAuthToken();
  const location = useLocation();

  if (!token) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
};
