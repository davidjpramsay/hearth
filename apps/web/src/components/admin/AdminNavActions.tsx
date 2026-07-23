import { useNavigate } from "react-router-dom";
import { PUBLIC_DOCS_URL } from "../../config/public-links";
import { preloadAdminRoute, type AdminRouteId } from "../../routing/admin-route-preload";
import { HearthIcon, HearthMark, type HearthIconName } from "../HearthIcon";

interface AdminNavActionsProps {
  current: AdminRouteId;
  onLogout: () => void;
}

const NavIcon = ({ icon }: { icon: HearthIconName }) => (
  <span className="hearth-admin-nav__icon">
    <HearthIcon name={icon} className="h-5 w-5" />
  </span>
);

export const AdminNavActions = ({ current, onLogout }: AdminNavActionsProps) => {
  const navigate = useNavigate();
  const navItems = [
    { id: "layouts", label: "Layouts", href: "/admin/layouts", icon: "layouts" },
    { id: "children", label: "Family", href: "/children", icon: "family" },
    { id: "chores", label: "Chores", href: "/chores", icon: "checklist" },
    { id: "school", label: "School", href: "/school", icon: "school" },
    { id: "devices", label: "Displays", href: "/devices", icon: "display" },
    { id: "connections", label: "Settings", href: "/connections", icon: "settings" },
  ] as const;

  return (
    <nav aria-label="Admin section" className="hearth-admin-nav">
      <div className="hearth-admin-brand" aria-label="Hearth admin">
        <span className="hearth-admin-brand__mark" aria-hidden="true">
          <HearthMark className="h-11 w-11" />
        </span>
        <span>Hearth</span>
      </div>

      <label className="sr-only" htmlFor="admin-section-nav">
        Admin section
      </label>
      <select
        id="admin-section-nav"
        value={current}
        onChange={(event) => {
          const target = navItems.find((item) => item.id === event.target.value);
          if (target) {
            preloadAdminRoute(target.id);
            navigate(target.href);
          }
        }}
        className="hearth-admin-nav__select"
      >
        {navItems.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>

      <div className="hearth-admin-nav__items">
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => navigate(item.href)}
            onPointerEnter={() => preloadAdminRoute(item.id)}
            onFocus={() => preloadAdminRoute(item.id)}
            onTouchStart={() => preloadAdminRoute(item.id)}
            aria-current={current === item.id ? "page" : undefined}
            className="hearth-admin-nav__item"
          >
            <NavIcon icon={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      <div className="hearth-admin-nav__footer">
        <a href={PUBLIC_DOCS_URL} target="_blank" rel="noreferrer">
          Help &amp; docs
        </a>
        <button type="button" onClick={onLogout}>
          Log out
        </button>
      </div>
    </nav>
  );
};
