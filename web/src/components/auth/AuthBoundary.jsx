import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext.jsx";

export function AuthBoundary() {
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === "checking") {
    return (
      <main className="route-state" aria-live="polite">
        <p>Checking your restaurant session...</p>
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
