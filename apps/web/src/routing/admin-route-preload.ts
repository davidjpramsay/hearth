export type AdminRouteId = "layouts" | "devices" | "connections" | "children" | "chores" | "school";

const adminRouteLoaders: Record<AdminRouteId, () => Promise<unknown>> = {
  layouts: () => import("../pages/AdminLayoutsPage"),
  children: () => import("../pages/AdminChildrenPage"),
  chores: () => import("../pages/AdminChoresPage"),
  school: () => import("../pages/AdminPlannerPage"),
  devices: () => import("../pages/AdminDevicesPage"),
  connections: () => import("../pages/AdminDevicesPage"),
};

export const preloadAdminRoute = (routeId: AdminRouteId): void => {
  void adminRouteLoaders[routeId]().catch(() => {
    // Navigation owns recovery and user feedback if an intentional preload fails.
  });
};
