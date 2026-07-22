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
  "rounded-2xl border border-stone-200 bg-white p-5 shadow-[0_8px_28px_rgba(40,52,50,0.04)]";
export const ADMIN_PANEL_CLASS = "rounded-xl border border-stone-200 bg-[#fdfcf9] p-4";
export const ADMIN_INPUT_CLASS =
  "w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-800 outline-none transition focus:border-teal-700 focus:ring-2 focus:ring-teal-700/10 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400";
export const ADMIN_BUTTON_PRIMARY_CLASS =
  "rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700/30 disabled:cursor-not-allowed disabled:opacity-60";
export const ADMIN_BUTTON_SECONDARY_CLASS =
  "rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm font-semibold text-stone-700 transition hover:border-teal-600 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700/20 disabled:cursor-not-allowed disabled:opacity-60";
export const ADMIN_BUTTON_DANGER_CLASS =
  "rounded-xl border border-rose-200 bg-white px-3 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60";
export const ADMIN_META_TEXT_CLASS = "text-xs text-stone-500";
export const ADMIN_FIELD_LABEL_CLASS = "block space-y-1.5 text-sm font-medium text-stone-700";
export const ADMIN_EMPTY_STATE_CLASS =
  "rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-center text-sm leading-6 text-stone-600";

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
      <h2 className="text-lg font-semibold text-stone-900">{title}</h2>
      {description ? <p className="mt-1 text-sm leading-6 text-stone-600">{description}</p> : null}
    </div>
    {meta ? (
      <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-600">
        {meta}
      </div>
    ) : null}
    {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
  </div>
);
