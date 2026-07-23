import type { SVGProps } from "react";

export type HearthIconName =
  | "arrow-left"
  | "calendar"
  | "checklist"
  | "close"
  | "display"
  | "family"
  | "home"
  | "layouts"
  | "photos"
  | "school"
  | "settings";

interface HearthIconProps extends SVGProps<SVGSVGElement> {
  name: HearthIconName;
}

const IconPaths = ({ name }: { name: HearthIconName }) => {
  switch (name) {
    case "arrow-left":
      return <path d="M19 12H5m6-6-6 6 6 6" />;
    case "calendar":
      return (
        <>
          <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
          <path d="M8 3.5v3M16 3.5v3M3.5 9.5h17" />
          <path d="M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01" />
        </>
      );
    case "checklist":
      return (
        <>
          <rect x="4" y="3.5" width="16" height="17" rx="3" />
          <path d="m7.5 9 1.4 1.4 2.3-2.6M13.5 9h3M7.5 15l1.4 1.4 2.3-2.6M13.5 15h3" />
        </>
      );
    case "close":
      return <path d="m6 6 12 12M18 6 6 18" />;
    case "display":
      return (
        <>
          <rect x="3" y="4" width="18" height="13.5" rx="2.5" />
          <path d="M8.5 21h7M12 17.5V21" />
        </>
      );
    case "family":
      return (
        <>
          <circle cx="8.5" cy="8" r="3" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M3.5 20c.5-4 2.2-6 5-6s4.5 2 5 6M14 15c3.7-.6 5.9 1.1 6.5 4.5" />
        </>
      );
    case "home":
      return (
        <>
          <path d="m3.5 11.2 8.5-7 8.5 7v9.3h-17Z" />
          <path d="M9 20.5v-6h6v6" />
        </>
      );
    case "layouts":
      return (
        <>
          <rect x="3.5" y="3.5" width="7" height="17" rx="2" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
        </>
      );
    case "photos":
      return (
        <>
          <rect x="3" y="4" width="18" height="16" rx="2.5" />
          <circle cx="9" cy="9" r="1.5" />
          <path d="m5.5 17.5 4.7-4.8 3.1 3 2.3-2.2 4.4 4" />
        </>
      );
    case "school":
      return (
        <>
          <path d="M4 5.5c3.2-.8 5.8-.2 8 1.7v12c-2.2-1.9-4.8-2.5-8-1.7Z" />
          <path d="M20 5.5c-3.2-.8-5.8-.2-8 1.7v12c2.2-1.9 4.8-2.5 8-1.7ZM12 7.2v12" />
        </>
      );
    case "settings":
      return (
        <>
          <path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h8M16 17h4" />
          <circle cx="15" cy="7" r="2" />
          <circle cx="9" cy="12" r="2" />
          <circle cx="14" cy="17" r="2" />
        </>
      );
  }
};

export const HearthIcon = ({ name, className = "", ...props }: HearthIconProps) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <IconPaths name={name} />
  </svg>
);

export const HearthMark = ({ className = "", ...props }: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 48 48" aria-hidden="true" className={className} fill="none" {...props}>
    <path
      d="M17.2 42H8.5A4.5 4.5 0 0 1 4 37.5V20.2a6 6 0 0 1 2.2-4.65L20.85 4.2a5 5 0 0 1 6.3 0L41.8 15.55A6 6 0 0 1 44 20.2v17.3a4.5 4.5 0 0 1-4.5 4.5h-8.7"
      stroke="var(--hearth-mark-house, #0f7773)"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M21.5 43c-5-2-7.5-6-7-10.5.5-4 3.5-7 5-10 1.7-2.7 1.6-5.3.7-8 6.9 2.6 12.8 9.7 13.2 16.5.4 5.1-2.6 9.4-6.9 11.5-1.3-2.9-1.3-6.3 0-9.3-3.3 2.3-4.7 6.3-4.2 9.8Z"
      fill="var(--hearth-mark-flame, #f36f50)"
    />
    <path
      d="M26.8 43.7H22c-1.4-4.6-.1-9.5 4.4-14.2.9 3.3.1 7.5 2.4 11.2.7 1.1-.5 2.2-2 3Z"
      fill="var(--hearth-mark-cutout, #fffefa)"
    />
  </svg>
);
