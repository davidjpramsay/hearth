interface ModuleSkeletonProps {
  variant?: "list" | "board" | "media" | "quote";
}

const shimmerLine = (key: string, className: string) => (
  <div key={key} className={`module-skeleton__line ${className}`} aria-hidden="true" />
);

export const ModuleSkeleton = ({ variant = "list" }: ModuleSkeletonProps) => {
  if (variant === "media") {
    return (
      <div className="module-skeleton module-skeleton--media" aria-hidden="true">
        <div className="module-skeleton__media" />
      </div>
    );
  }

  if (variant === "quote") {
    return (
      <div className="module-skeleton module-skeleton--quote" aria-hidden="true">
        {shimmerLine("eyebrow", "module-skeleton__line--eyebrow")}
        {shimmerLine("title", "module-skeleton__line--title")}
        {shimmerLine("copy-1", "module-skeleton__line--full")}
        {shimmerLine("copy-2", "module-skeleton__line--full")}
        {shimmerLine("copy-3", "module-skeleton__line--short")}
      </div>
    );
  }

  if (variant === "board") {
    return (
      <div className="module-skeleton module-skeleton--board" aria-hidden="true">
        <div className="module-skeleton__board-rail" />
        <div className="module-skeleton__board-grid">
          <div className="module-skeleton__board-header" />
          <div className="module-skeleton__board-header" />
          <div className="module-skeleton__board-header" />
          <div className="module-skeleton__board-block module-skeleton__board-block--tall" />
          <div className="module-skeleton__board-block module-skeleton__board-block--mid" />
          <div className="module-skeleton__board-block module-skeleton__board-block--short" />
        </div>
      </div>
    );
  }

  return (
    <div className="module-skeleton module-skeleton--list" aria-hidden="true">
      <div className="module-skeleton__card">
        {shimmerLine("title-1", "module-skeleton__line--title")}
        {shimmerLine("meta-1", "module-skeleton__line--short")}
      </div>
      <div className="module-skeleton__card">
        {shimmerLine("title-2", "module-skeleton__line--title")}
        {shimmerLine("meta-2", "module-skeleton__line--full")}
        {shimmerLine("meta-3", "module-skeleton__line--medium")}
      </div>
      <div className="module-skeleton__card">
        {shimmerLine("title-3", "module-skeleton__line--title")}
        {shimmerLine("meta-4", "module-skeleton__line--medium")}
      </div>
    </div>
  );
};
