import type { HTMLAttributes, ReactNode } from "react";

interface AdminSectionProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  as?: "section" | "article" | "div";
}

interface AdminSectionHeaderProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  compact?: boolean;
}

export const ADMIN_SECTION_CLASS =
  "rounded-xl border border-slate-700 bg-slate-900/70 p-4 shadow-[0_10px_26px_rgba(2,6,23,0.12)]";
export const ADMIN_PANEL_CLASS = "rounded-lg border border-slate-800 bg-slate-950/60 p-4";
export const ADMIN_INPUT_CLASS =
  "w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500";
export const ADMIN_BUTTON_PRIMARY_CLASS =
  "rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60";
export const ADMIN_BUTTON_SECONDARY_CLASS =
  "rounded-lg border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-200 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60";
export const ADMIN_BUTTON_DANGER_CLASS =
  "rounded-lg border border-rose-500/70 px-3 py-2 text-sm font-semibold text-rose-100 hover:border-rose-400 hover:text-rose-50 disabled:cursor-not-allowed disabled:opacity-60";
export const ADMIN_META_TEXT_CLASS = "text-xs text-slate-400";

export const AdminSection = ({
  as = "section",
  className = "",
  children,
  ...props
}: AdminSectionProps) => {
  const Component = as;

  return (
    <Component className={`${ADMIN_SECTION_CLASS}${className ? ` ${className}` : ""}`} {...props}>
      {children}
    </Component>
  );
};

export const AdminSectionHeader = ({
  title,
  description,
  actions,
  meta,
  compact = false,
}: AdminSectionHeaderProps) => (
  <div className={`flex flex-wrap items-start justify-between gap-3 ${compact ? "" : "md:gap-4"}`}>
    <div className="min-w-0 flex-1">
      <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
      {description ? <p className="mt-1 text-sm leading-6 text-slate-300">{description}</p> : null}
    </div>
    {meta ? (
      <div className="rounded-lg border border-slate-700/80 bg-slate-950/60 px-3 py-2 text-sm text-slate-300">
        {meta}
      </div>
    ) : null}
    {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
  </div>
);
