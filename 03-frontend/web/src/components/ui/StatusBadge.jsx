import { AlertTriangle, CheckCircle2, Circle, Clock, Info, XCircle } from "lucide-react";
import { useLocale } from "../../contexts/LocaleContext.jsx";

const statusMap = {
  neutral: ["neutral", Circle],
  info: ["info", Info],
  success: ["success", CheckCircle2],
  warning: ["warning", AlertTriangle],
  danger: ["danger", AlertTriangle],
  complete: ["success", CheckCircle2],
  partial: ["warning", Clock],
  missing: ["danger", AlertTriangle],
  stale: ["warning", Clock],
  failed: ["danger", XCircle],
  proposed: ["info", Info],
  accepted: ["success", CheckCircle2],
  rejected: ["danger", XCircle],
  in_progress: ["info", Clock],
  completed: ["success", CheckCircle2],
  cancelled: ["neutral", XCircle],
  low: ["success", Circle],
  medium: ["warning", AlertTriangle],
  high: ["danger", AlertTriangle],
  critical: ["danger", AlertTriangle]
};

function labelKey(status) {
  if (status === "in_progress") return "inProgress";
  return status;
}

export function StatusBadge({ status = "neutral", label, className = "" }) {
  const { t } = useLocale();
  const [variant, Icon] = statusMap[status] || statusMap.neutral;
  const text = label || t(`status.${labelKey(statusMap[status] ? status : "neutral")}`);

  return (
    <span className={`ui-status-badge ui-status-badge--${variant} ${className}`.trim()} aria-label={text}>
      <Icon size={12} aria-hidden="true" />
      <span>{text}</span>
    </span>
  );
}
