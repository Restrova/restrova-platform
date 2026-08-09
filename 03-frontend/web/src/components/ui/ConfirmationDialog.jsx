import { cloneElement, useCallback, useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { useLocale } from "../../contexts/LocaleContext.jsx";
import { Button } from "./Button.jsx";

export function ConfirmationDialog({
  trigger,
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  danger = false,
  loading = false,
  onConfirm,
  children
}) {
  const { t } = useLocale();
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef(null);
  const previousFocus = useRef(null);

  const setOpen = useCallback(
    (next) => {
      if (loading) return;
      onOpenChange?.(next);
      if (open === undefined) setInternalOpen(next);
    },
    [loading, onOpenChange, open]
  );

  useEffect(() => {
    if (!isOpen) return undefined;
    previousFocus.current = document.activeElement;
    const focusable = dialogRef.current?.querySelector(
      "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
    );
    focusable?.focus();

    const onKeyDown = (event) => {
      if (event.key === "Escape" && !loading) setOpen(false);
      if (event.key !== "Tab") return;
      const nodes = [
        ...dialogRef.current.querySelectorAll(
          "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
        )
      ].filter((node) => !node.disabled);
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus.current?.focus?.();
    };
  }, [isOpen, loading, setOpen]);

  const triggerElement = trigger
    ? cloneElement(trigger, {
        onClick: (event) => {
          trigger.props.onClick?.(event);
          setOpen(true);
        }
      })
    : null;

  return (
    <>
      {triggerElement}
      {isOpen && (
        <div
          className="ui-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            ref={dialogRef}
            className="ui-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description || children ? descriptionId : undefined}
          >
            <header className="ui-dialog__header">
              <h2 id={titleId} className="ui-card__title">
                {title}
              </h2>
              <Button variant="ghost" aria-label={t("common.close")} onClick={() => setOpen(false)} disabled={loading}>
                <X size={16} />
              </Button>
            </header>
            <div className="ui-dialog__body" id={description || children ? descriptionId : undefined}>
              {description && <p>{description}</p>}
              {children}
            </div>
            <footer className="ui-dialog__footer">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                {cancelLabel || t("common.cancel")}
              </Button>
              <Button
                variant={danger ? "danger" : "primary"}
                loading={loading}
                onClick={async () => {
                  await onConfirm?.();
                  if (!loading) setOpen(false);
                }}
              >
                {confirmLabel || t("common.confirm")}
              </Button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
