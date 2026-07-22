import type { ReactNode } from "react";

interface PageShellProps {
  title: string;
  subtitle?: string;
  rightActions?: ReactNode;
  children: ReactNode;
}

export const PageShell = ({ title, subtitle, rightActions, children }: PageShellProps) => (
  <main className="hearth-admin-shell">
    {rightActions ? <aside className="hearth-admin-shell__rail">{rightActions}</aside> : null}
    <div className="hearth-admin-content">
      <header className="hearth-admin-page-header">
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </header>
      {children}
    </div>
  </main>
);
