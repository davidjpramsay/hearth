import type { ReactNode } from "react";

interface PageShellProps {
  title: string;
  subtitle?: string;
  rightActions?: ReactNode;
  children: ReactNode;
}

export const PageShell = ({
  title,
  subtitle,
  rightActions,
  children,
}: PageShellProps) => (
  <main
    className="mx-auto min-h-screen w-full max-w-7xl sm:px-6 lg:px-8"
    style={{
      paddingTop: "calc(1.5rem + env(safe-area-inset-top, 0px))",
      paddingRight: "max(env(safe-area-inset-right, 0px), 1rem)",
      paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))",
      paddingLeft: "max(env(safe-area-inset-left, 0px), 1rem)",
      boxSizing: "border-box",
    }}
  >
    <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="font-display text-3xl font-bold text-slate-100">{title}</h1>
        {subtitle ? <p className="mt-1 text-slate-300">{subtitle}</p> : null}
      </div>
      <div className="flex flex-wrap items-end gap-3">{rightActions}</div>
    </header>
    {children}
  </main>
);
