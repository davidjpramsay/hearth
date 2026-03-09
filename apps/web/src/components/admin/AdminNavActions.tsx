import { useNavigate } from "react-router-dom";

interface AdminNavActionsProps {
  current: "layouts" | "devices" | "chores";
  onLogout: () => void;
}

export const AdminNavActions = ({
  current,
  onLogout,
}: AdminNavActionsProps) => {
  const navigate = useNavigate();

  return (
    <>
      {current !== "layouts" ? (
        <button
          type="button"
          onClick={() => navigate("/admin/layouts")}
          className="rounded-lg border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-200 hover:border-slate-400"
        >
          Layouts
        </button>
      ) : null}
      {current !== "devices" ? (
        <button
          type="button"
          onClick={() => navigate("/devices")}
          className="rounded-lg border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-200 hover:border-slate-400"
        >
          Devices
        </button>
      ) : null}
      {current !== "chores" ? (
        <button
          type="button"
          onClick={() => navigate("/chores")}
          className="rounded-lg border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-200 hover:border-slate-400"
        >
          Chores
        </button>
      ) : null}
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
