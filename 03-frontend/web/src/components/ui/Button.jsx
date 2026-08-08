import { forwardRef } from "react";

export const Button = forwardRef(function Button({
  children,
  variant = "primary",
  size = "medium",
  type = "button",
  disabled = false,
  loading = false,
  leadingIcon,
  trailingIcon,
  fullWidth = false,
  className = "",
  loadingLabel = "Loading",
  ...props
}, ref) {
  const classes = [
    "ui-button",
    `ui-button--${variant}`,
    `ui-button--${size}`,
    fullWidth ? "ui-button--full" : "",
    className
  ].filter(Boolean).join(" ");

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <span className="ui-spinner" aria-hidden="true" />}
      {loading && <span className="sr-only">{loadingLabel}</span>}
      {!loading && leadingIcon}
      <span>{children}</span>
      {!loading && trailingIcon}
    </button>
  );
});
