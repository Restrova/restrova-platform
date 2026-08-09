import { forwardRef } from "react";

export const Input = forwardRef(function Input(
  { leadingIcon, trailingIcon, invalid = false, disabled = false, className = "", ...props },
  ref
) {
  return (
    <span
      className={`ui-input-wrap ${className}`.trim()}
      data-invalid={invalid || undefined}
      data-disabled={disabled || undefined}
    >
      {leadingIcon && (
        <span className="ui-input__icon" aria-hidden="true">
          {leadingIcon}
        </span>
      )}
      <input ref={ref} className="ui-input" disabled={disabled} aria-invalid={invalid || undefined} {...props} />
      {trailingIcon && <span className="ui-input__icon">{trailingIcon}</span>}
    </span>
  );
});
