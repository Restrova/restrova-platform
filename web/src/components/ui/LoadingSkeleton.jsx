export function LoadingSkeleton({
  variant = "line",
  lines = 1,
  width,
  height,
  label,
  className = ""
}) {
  const style = {
    inlineSize: width,
    blockSize: height || (variant === "circle" ? width : undefined)
  };

  if (variant === "card") {
    return (
      <div className={`ui-card ui-card__content ui-skeleton-stack ${className}`.trim()} role={label ? "status" : undefined} aria-label={label}>
        <span className="ui-skeleton" style={{ inlineSize: "60%", blockSize: "1rem" }} />
        <span className="ui-skeleton" style={{ inlineSize: "100%", blockSize: "4rem" }} />
      </div>
    );
  }

  if (lines > 1) {
    return (
      <div className={`ui-skeleton-stack ${className}`.trim()} role={label ? "status" : undefined} aria-label={label}>
        {Array.from({ length: lines }, (_, index) => (
          <span key={index} className="ui-skeleton" style={{ inlineSize: index === lines - 1 ? "70%" : "100%", blockSize: height || "0.875rem" }} />
        ))}
      </div>
    );
  }

  return (
    <span
      className={`ui-skeleton ui-skeleton--${variant} ${className}`.trim()}
      style={style}
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
    />
  );
}
