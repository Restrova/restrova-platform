import { useId } from "react";
import { useLocale } from "../../contexts/LocaleContext.jsx";

export function FormField({
  label,
  description,
  error,
  required = false,
  optional = false,
  disabled = false,
  id,
  children
}) {
  const { t } = useLocale();
  const generatedId = useId();
  const inputId = id || generatedId;
  const descriptionId = description ? `${inputId}-description` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  const field =
    typeof children === "function"
      ? children({ id: inputId, describedBy, invalid: Boolean(error), disabled })
      : children;

  return (
    <div className="ui-form-field">
      <div className="ui-form-field__label-row">
        <label className="ui-form-field__label" htmlFor={inputId}>
          {label}
        </label>
        {(required || optional) && (
          <span className="ui-form-field__meta">{required ? t("common.required") : t("common.optional")}</span>
        )}
      </div>
      {field}
      {description && (
        <p className="ui-form-field__description" id={descriptionId}>
          {description}
        </p>
      )}
      {error && (
        <p className="ui-form-field__error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
}
