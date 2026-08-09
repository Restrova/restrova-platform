import { AlertTriangle } from "lucide-react";
import { useLocale } from "../../contexts/LocaleContext.jsx";
import { Button } from "./Button.jsx";

const errorKeys = {
  generic: ["errors.genericTitle", "errors.genericDescription"],
  network: ["errors.networkTitle", "errors.networkDescription"],
  permission: ["errors.permissionTitle", "errors.permissionDescription"],
  unavailable: ["errors.unavailableTitle", "errors.unavailableDescription"]
};

export function ErrorState({ type = "generic", title, description, onRetry, onBack, compact = false }) {
  const { t } = useLocale();
  const [titleKey, descriptionKey] = errorKeys[type] || errorKeys.generic;

  return (
    <section className={`ui-error ${compact ? "ui-error--compact" : ""}`.trim()} role="alert">
      <span className="ui-error__icon" aria-hidden="true">
        <AlertTriangle size={24} />
      </span>
      <h2>{title || t(titleKey)}</h2>
      <p>{description || t(descriptionKey)}</p>
      {(onRetry || onBack) && (
        <div className="design-system-row">
          {onBack && (
            <Button variant="outline" onClick={onBack}>
              {t("common.back")}
            </Button>
          )}
          {onRetry && <Button onClick={onRetry}>{t("common.retry")}</Button>}
        </div>
      )}
    </section>
  );
}
