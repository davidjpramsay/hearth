import { Suspense, lazy, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "./auth/RequireAuth";
import { DashboardPage } from "./pages/DashboardPage";

const AdminChoresPage = lazy(async () => {
  const module = await import("./pages/AdminChoresPage");
  return { default: module.AdminChoresPage };
});

const AdminDevicesPage = lazy(async () => {
  const module = await import("./pages/AdminDevicesPage");
  return { default: module.AdminDevicesPage };
});

const AdminLayoutEditorPage = lazy(async () => {
  const module = await import("./pages/AdminLayoutEditorPage");
  return { default: module.AdminLayoutEditorPage };
});

const AdminLayoutsPage = lazy(async () => {
  const module = await import("./pages/AdminLayoutsPage");
  return { default: module.AdminLayoutsPage };
});

const AdminLoginPage = lazy(async () => {
  const module = await import("./pages/AdminLoginPage");
  return { default: module.AdminLoginPage };
});

const RouteLoading = () => (
  <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-center text-sm text-slate-300">
    Loading page...
  </div>
);

const withRouteSuspense = (node: ReactNode) => (
  <Suspense fallback={<RouteLoading />}>{node}</Suspense>
);

export const App = () => (
  <Routes>
    <Route path="/" element={<DashboardPage />} />
    <Route path="/admin" element={<Navigate to="/admin/layouts" replace />} />
    <Route path="/admin/login" element={withRouteSuspense(<AdminLoginPage />)} />
    <Route
      path="/chores"
      element={<RequireAuth>{withRouteSuspense(<AdminChoresPage />)}</RequireAuth>}
    />
    <Route
      path="/devices"
      element={<RequireAuth>{withRouteSuspense(<AdminDevicesPage />)}</RequireAuth>}
    />
    <Route
      path="/admin/chores"
      element={<RequireAuth>{withRouteSuspense(<AdminChoresPage />)}</RequireAuth>}
    />
    <Route
      path="/admin/devices"
      element={<RequireAuth>{withRouteSuspense(<AdminDevicesPage />)}</RequireAuth>}
    />
    <Route
      path="/admin/layouts"
      element={<RequireAuth>{withRouteSuspense(<AdminLayoutsPage />)}</RequireAuth>}
    />
    <Route
      path="/admin/layouts/:id"
      element={<RequireAuth>{withRouteSuspense(<AdminLayoutEditorPage />)}</RequireAuth>}
    />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);
