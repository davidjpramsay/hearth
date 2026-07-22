import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { PUBLIC_DOCS_URL } from "../../config/public-links";

interface AdminNavActionsProps {
  current: "layouts" | "devices" | "connections" | "children" | "chores" | "school";
  onLogout: () => void;
}

type AdminNavIcon = "layouts" | "family" | "chores" | "school" | "displays" | "settings";

const NavIcon = ({ icon }: { icon: AdminNavIcon }) => {
  const paths: Record<AdminNavIcon, ReactNode> = {
    layouts: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <path d="M9 3v18M9 10h12" />
      </>
    ),
    family: (
      <>
        <circle cx="9" cy="8" r="3" />
        <circle cx="17" cy="9" r="2.5" />
        <path d="M3.5 20c.6-4 2.4-6 5.5-6s4.9 2 5.5 6M14 15c3.7-.5 5.8 1.2 6.5 4.5" />
      </>
    ),
    chores: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 2.5 2.5L16.5 9" />
      </>
    ),
    school: (
      <>
        <path d="m3 9 9-5 9 5-9 5-9-5Z" />
        <path d="M7 12v5c3 2 7 2 10 0v-5M21 9v6" />
      </>
    ),
    displays: (
      <>
        <rect x="3" y="4" width="18" height="13" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
      </>
    ),
  };

  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/60">
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-[18px] w-[18px]"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {paths[icon]}
      </svg>
    </span>
  );
};

export const AdminNavActions = ({ current, onLogout }: AdminNavActionsProps) => {
  const navigate = useNavigate();
  const navItems = [
    { id: "layouts", label: "Layouts", href: "/admin/layouts", icon: "layouts" },
    { id: "children", label: "Family", href: "/children", icon: "family" },
    { id: "chores", label: "Chores", href: "/chores", icon: "chores" },
    { id: "school", label: "School", href: "/school", icon: "school" },
    { id: "devices", label: "Displays", href: "/devices", icon: "displays" },
    { id: "connections", label: "Settings", href: "/connections", icon: "settings" },
  ] as const;

  return (
    <nav aria-label="Admin section" className="hearth-admin-nav">
      <div className="hearth-admin-brand" aria-label="Hearth admin">
        <span className="hearth-admin-brand__mark" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            className="h-[18px] w-[18px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m4 10 8-7 8 7v10H4V10Z" />
            <path d="M9 20v-6h6v6" />
          </svg>
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
