import { Inbox } from "lucide-react";
import { useLocale } from "../../contexts/LocaleContext.jsx";

export function EmptyState({ icon, title, description, primaryAction, secondaryAction, compact = false }) {
  const { t } = useLocale();
  return (
    <section className={`ui-empty ${compact ? "ui-empty--compact" : ""}`.trim()} role="status">
      <span className="ui-empty__icon" aria-hidden="true">
        {icon || <Inbox size={24} />}
      </span>
      <h2>{title || t("empty.defaultTitle")}</h2>
      <p>{description || t("empty.defaultDescription")}</p>
      {(primaryAction || secondaryAction) && (
        <div className="design-system-row">
          {primaryAction}
          {secondaryAction}
        </div>
      )}
    </section>
  );
}
