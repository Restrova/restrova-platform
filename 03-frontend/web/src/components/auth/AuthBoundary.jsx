import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useLocale } from "../../contexts/LocaleContext.jsx";
import { useAuth } from "../../contexts/AuthContext.jsx";

export function AuthBoundary() {
  const auth = useAuth();
  const { t } = useLocale();
  const location = useLocation();

  if (auth.status === "checking") {
    return (
      <main className="route-state" aria-live="polite">
        <p>{t("common.checkingSession")}</p>
      </main>
    );
  }

  if (auth.status === "forbidden") {
    return <Navigate to="/unauthorized" replace />;
  }

  if (!auth.isAuthenticated) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  return <Outlet />;
}
