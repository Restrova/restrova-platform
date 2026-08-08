export function Card({ children, variant = "default", interactive = false, className = "", ...props }) {
  const classes = [
    "ui-card",
    variant === "muted" ? "ui-card--muted" : "",
    interactive ? "ui-card--interactive" : "",
    className
  ].filter(Boolean).join(" ");
  return <article className={classes} {...props}>{children}</article>;
}

export function CardHeader({ children, status, className = "" }) {
  return (
    <header className={`ui-card__header ${className}`.trim()}>
      <div>{children}</div>
      {status && <div>{status}</div>}
    </header>
  );
}

export function CardTitle({ children }) {
  return <h2 className="ui-card__title">{children}</h2>;
}

export function CardDescription({ children }) {
  return <p className="ui-card__description">{children}</p>;
}

export function CardContent({ children, className = "" }) {
  return <div className={`ui-card__content ${className}`.trim()}>{children}</div>;
}

export function CardFooter({ children, className = "" }) {
  return <footer className={`ui-card__footer ${className}`.trim()}>{children}</footer>;
}
