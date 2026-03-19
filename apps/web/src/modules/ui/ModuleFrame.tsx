import type { ReactNode } from "react";
import { ModuleConnectionBadge } from "./ModuleConnectionBadge";

interface ModuleFrameProps {
  title: string;
  subtitle?: string;
  hideHeader?: boolean;
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyMessage?: string;
  statusLabel?: string;
  lastUpdatedMs?: number | null;
  disconnected?: boolean;
  onRemove?: () => void;
  onSelect?: () => void;
  children: ReactNode;
}

const formatLastUpdated = (timestampMs: number | null | undefined): string | null => {
  if (!timestampMs) {
    return null;
  }

  const formatter = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return formatter.format(new Date(timestampMs));
};

export const ModuleFrame = ({
  title,
  subtitle,
  hideHeader = false,
  loading = false,
  error = null,
  empty = false,
  emptyMessage = "No data available",
  statusLabel,
  lastUpdatedMs,
  disconnected = false,
  onRemove,
  onSelect,
  children,
}: ModuleFrameProps) => {
  const formattedLastUpdated = formatLastUpdated(lastUpdatedMs);
  const showStatusMeta =
    loading || Boolean(error) || Boolean(statusLabel) || Boolean(formattedLastUpdated);
  const statusClassName = error
    ? "status-dot status-dot--error"
    : loading
      ? "status-dot status-dot--loading"
      : "status-dot status-dot--ok";

  return (
    <div
      onMouseDownCapture={() => onSelect?.()}
      onTouchStartCapture={() => onSelect?.()}
      className="module-frame"
    >
      {hideHeader ? <ModuleConnectionBadge visible={disconnected} /> : null}
      {hideHeader ? <div className="module-drag-handle module-frame__drag-strip" /> : null}
      {!hideHeader ? (
        <div className="module-drag-handle module-frame__header">
          <div className="min-w-0">
            {title ? <span className="module-frame__title">{title}</span> : null}
            {subtitle ? <p className="module-frame__subtitle">{subtitle}</p> : null}
          </div>
          <div className="flex items-center gap-2">
            <ModuleConnectionBadge visible={disconnected} variant="inline" />
            {showStatusMeta ? (
              <div className="module-frame__meta">
                {statusLabel ? <span className="text-accent">{statusLabel}</span> : null}
                {formattedLastUpdated ? (
                  <span className="text-muted">Updated {formattedLastUpdated}</span>
                ) : null}
                <span className={statusClassName} aria-hidden="true" />
              </div>
            ) : null}
            {onRemove ? (
              <button
                type="button"
                onTouchStart={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onMouseDown={(event) => {
                  // Prevent grid drag from swallowing the click.
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onRemove();
                }}
                className="module-frame__remove module-no-drag"
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="module-frame__body module-no-drag">
        {error ? (
          <div className="module-frame__feedback module-frame__feedback--error">{error}</div>
        ) : empty ? (
          <div className="module-frame__feedback module-frame__feedback--empty">{emptyMessage}</div>
        ) : (
          children
        )}
      </div>
    </div>
  );
};
