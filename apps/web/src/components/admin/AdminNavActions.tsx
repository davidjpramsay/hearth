import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { PUBLIC_DOCS_URL } from "../../config/public-links";

interface AdminNavActionsProps {
  current: "layouts" | "devices" | "connections" | "children" | "chores" | "school";
  onLogout: () => void;
}

const NavIcon = ({ children }: { children: ReactNode }) => (
  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/60 text-lg">
    {children}
  </span>
);

export const AdminNavActions = ({ current, onLogout }: AdminNavActionsProps) => {
  const navigate = useNavigate();
  const navItems = [
    { id: "layouts", label: "Layouts", href: "/admin/layouts", icon: "▦" },
    { id: "children", label: "Family", href: "/children", icon: "◎" },
    { id: "chores", label: "Chores", href: "/chores", icon: "✓" },
    { id: "school", label: "School", href: "/school", icon: "▤" },
    { id: "devices", label: "Devices", href: "/devices", icon: "▣" },
    { id: "connections", label: "Connections", href: "/connections", icon: "⌁" },
  ] as const;

  return (
    <nav aria-label="Admin section" className="hearth-admin-nav">
      <div className="hearth-admin-brand" aria-label="Hearth admin">
        <span className="hearth-admin-brand__mark" aria-hidden="true">
          ⌂
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
          if (target) navigate(target.href);
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
            aria-current={current === item.id ? "page" : undefined}
            className="hearth-admin-nav__item"
          >
            <NavIcon>{item.icon}</NavIcon>
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
