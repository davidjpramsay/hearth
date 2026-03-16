interface ModuleConnectionBadgeProps {
  visible?: boolean;
  variant?: "floating" | "inline";
  title?: string;
}

export const ModuleConnectionBadge = ({
  visible = false,
  variant = "floating",
  title = "Connection unavailable",
}: ModuleConnectionBadgeProps) => {
  if (!visible) {
    return null;
  }

  return (
    <div
      className={`module-connection-badge module-connection-badge--${variant}`}
      role="status"
      aria-label="Connection unavailable"
      title={title}
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M4 9.5a12.2 12.2 0 0 1 16 0M7.5 13a7 7 0 0 1 7.92-1.2M12 18h.01"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M4 4l16 16"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};
