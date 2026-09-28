import { Bell } from "lucide-react";
import { Link } from "react-router-dom";
import { useLocale } from "../../contexts/LocaleContext.jsx";
import { useOverview } from "../../pages/SimplePages.jsx";
export function NotificationButton() {
  const { t } = useLocale(),
    query = useOverview();
  return (
    <Link className="notification-link" to="/app/alerts" aria-label={t("navigation.notifications")}>
      <Bell size={20} />
      {query.data?.alert && (
        <span className="notification-dot" aria-label={t("navigation.alerts")}>
          !
        </span>
      )}
    </Link>
  );
}
