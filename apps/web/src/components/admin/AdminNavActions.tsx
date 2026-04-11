import { useNavigate } from "react-router-dom";
import { PUBLIC_DOCS_URL } from "../../config/public-links";

interface AdminNavActionsProps {
  current: "layouts" | "devices" | "children" | "chores" | "school";
  onLogout: () => void;
}

export const AdminNavActions = ({ current, onLogout }: AdminNavActionsProps) => {
  const navigate = useNavigate();
  const navItems = [
    { id: "layouts", label: "Layouts", href: "/admin/layouts" },
    { id: "children", label: "Children", href: "/children" },
    { id: "chores", label: "Chores", href: "/chores" },
    { id: "school", label: "School", href: "/school" },
    { id: "devices", label: "Settings", href: "/devices" },
  ] as const;

  return (
    <>
      {navItems.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => navigate(item.href)}
          aria-current={current === item.id ? "page" : undefined}
          className={`min-w-[7.5rem] rounded-lg border px-3 py-2 text-sm font-semibold transition ${
            current === item.id
              ? "border-cyan-300 bg-cyan-400/15 text-cyan-50"
              : "border-slate-600 text-slate-200 hover:border-slate-400"
          }`}
        >
          {item.label}
        </button>
      ))}
      <a
        href={PUBLIC_DOCS_URL}
        target="_blank"
        rel="noreferrer"
        className="rounded-lg border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-200 hover:border-slate-400"
      >
        Docs
      </a>
      <button
        type="button"
        onClick={onLogout}
        className="rounded-lg border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-200 hover:border-slate-400"
      >
        Logout
      </button>
    </>
  );
};
