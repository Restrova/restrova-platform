export function Badge({ children, variant = "neutral", className = "", ...props }) {
  return (
    <span className={`ui-badge ui-badge--${variant} ${className}`.trim()} {...props}>
      {children}
    </span>
  );
}
