import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "./auth/RequireAuth";
import { AdminChoresPage } from "./pages/AdminChoresPage";
import { AdminLayoutEditorPage } from "./pages/AdminLayoutEditorPage";
import { AdminLayoutsPage } from "./pages/AdminLayoutsPage";
import { AdminLoginPage } from "./pages/AdminLoginPage";
import { DashboardPage } from "./pages/DashboardPage";

export const App = () => (
  <Routes>
    <Route path="/" element={<DashboardPage />} />
    <Route path="/admin" element={<Navigate to="/admin/layouts" replace />} />
    <Route path="/admin/login" element={<AdminLoginPage />} />
    <Route
      path="/chores"
      element={
        <RequireAuth>
          <AdminChoresPage />
        </RequireAuth>
      }
    />
    <Route
      path="/admin/chores"
      element={
        <RequireAuth>
          <AdminChoresPage />
        </RequireAuth>
      }
    />
    <Route
      path="/admin/layouts"
      element={
        <RequireAuth>
          <AdminLayoutsPage />
        </RequireAuth>
      }
    />
    <Route
      path="/admin/layouts/:id"
      element={
        <RequireAuth>
          <AdminLayoutEditorPage />
        </RequireAuth>
      }
    />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);
