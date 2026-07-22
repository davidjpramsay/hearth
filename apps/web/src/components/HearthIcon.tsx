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
  <svg viewBox="0 0 32 32" aria-hidden="true" className={className} fill="none" {...props}>
    <path
      d="M4.75 14.1 16 4.75l11.25 9.35v12.65H4.75Z"
      fill="currentColor"
      fillOpacity="0.1"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M16 26c-3.2 0-5.4-2.25-5.4-5.35 0-2.45 1.4-4.2 3.65-6.2-.1 1.75.75 2.75 1.65 3.2.2-2.65 1.65-4.45 3.25-5.9.1 2.6 2.25 4.05 2.25 6.95 0 4.15-2.2 7.3-5.4 7.3Z"
      fill="currentColor"
    />
    <path
      d="M16.1 23.6c-1.25 0-2.15-.9-2.15-2.15 0-1.05.55-1.85 1.5-2.75.1.9.55 1.3 1.05 1.55.15-1.05.7-1.8 1.35-2.4.15 1.15.95 1.8.95 2.95 0 1.6-1 2.8-2.7 2.8Z"
      fill="var(--hearth-mark-cutout, #fffefa)"
    />
  </svg>
);
