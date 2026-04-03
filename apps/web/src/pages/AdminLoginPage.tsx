import { FormEvent, useState } from "react";
import { useLocation } from "react-router-dom";
import { login } from "../api/client";
import { setAuthToken } from "../auth/storage";
import { getSafeAdminPostLoginPath } from "../auth/session";
import { PUBLIC_DOCS_URL } from "../config/public-links";

export const AdminLoginPage = () => {
  const location = useLocation();
  const from = getSafeAdminPostLoginPath(
    (location.state as { from?: string } | null)?.from ?? "/admin/layouts",
  );

  const [password, setPassword] = useState("");
  const [statusMessage, setStatusMessage] = useState(
    "Sign in with the configured admin password. On first install, set ADMIN_PASSWORD on the server and restart once before signing in.",
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await login(password);
      setAuthToken(response.token);
      setStatusMessage("Authentication successful.");
      if (typeof window !== "undefined") {
        window.location.replace(from);
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <section className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900/90 p-6 shadow-2xl shadow-black/25">
        <h1 className="font-display text-3xl font-bold text-slate-100">Hearth Admin</h1>
        <p className="mt-2 text-sm text-slate-300">{statusMessage}</p>
        <p className="mt-3 text-sm text-slate-400">
          Need setup or development guidance?{" "}
          <a
            href={PUBLIC_DOCS_URL}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-cyan-300 hover:text-cyan-200"
          >
            Open docs
          </a>
        </p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <label className="block space-y-2">
            <span className="text-sm text-slate-200">Admin password</span>
            <input
              type="password"
              required
              minLength={4}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-cyan-400"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {error ? (
            <p className="rounded border border-rose-500/60 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-60"
          >
            {isLoading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
};
