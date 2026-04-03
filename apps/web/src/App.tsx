import { Suspense, lazy, useEffect, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { RequireAuth } from "./auth/RequireAuth";
import { PUBLIC_DOCS_URL } from "./config/public-links";
import { DashboardPage } from "./pages/DashboardPage";
import { useBuildUpdateMonitor } from "./update/build-updates";

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

const ExternalDocsRedirect = () => {
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.location.replace(PUBLIC_DOCS_URL);
    }
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-center text-sm text-slate-300">
      Redirecting to public docs...
    </div>
  );
};

export const App = () => {
  const location = useLocation();
  const shouldAutoReload = location.pathname === "/";
  const updateAvailable = useBuildUpdateMonitor(shouldAutoReload ? "reload" : "prompt");

  return (
    <>
      {updateAvailable ? (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-cyan-400/60 bg-slate-950/95 px-4 py-3 text-sm text-slate-100 shadow-2xl shadow-slate-950/40">
            <p>A newer build is available.</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg bg-cyan-400 px-3 py-1.5 font-semibold text-slate-950 hover:bg-cyan-300"
            >
              Reload now
            </button>
          </div>
        </div>
      ) : null}

      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/docs" element={<ExternalDocsRedirect />} />
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
    </>
  );
};
