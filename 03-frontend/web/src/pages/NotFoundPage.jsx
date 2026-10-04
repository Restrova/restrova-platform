import { useLocale } from "../contexts/LocaleContext.jsx";
import { Link } from "react-router-dom";

export function NotFoundPage() {
  const { t } = useLocale();
  return (
    <main className="route-state">
      <span className="status-pill">404</span>
      <h1>{t("common.pageNotFound")}</h1>
      <p>{t("common.notFoundDescription")}</p>
      <Link to="/app/dashboard">{t("common.openWorkspace")}</Link>
    </main>
  );
}
