import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <main className="route-state">
      <span className="status-pill">404</span>
      <h1>Page not found</h1>
      <p>This route is not part of the restaurant manager workspace.</p>
      <Link to="/app/workspace">Open current workspace</Link>
    </main>
  );
}
