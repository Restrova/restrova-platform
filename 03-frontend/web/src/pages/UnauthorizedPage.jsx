import { useLocale } from "../contexts/LocaleContext.jsx";
import { Link } from "react-router-dom";

export function UnauthorizedPage() {
  const { t } = useLocale();
  return (
    <main className="route-state">
      <span className="status-pill danger">{t("common.accessLimited")}</span>
      <h1>{t("common.permissionRequired")}</h1>
      <p>{t("common.permissionDescription")}</p>
      <Link to="/app/dashboard">{t("common.openWorkspace")}</Link>
    </main>
  );
}
