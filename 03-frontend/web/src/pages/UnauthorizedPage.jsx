import { Link } from "react-router-dom";

export function UnauthorizedPage() {
  return (
    <main className="route-state">
      <span className="status-pill danger">Access limited</span>
      <h1>Permission required</h1>
      <p>Your account does not have access to this restaurant area.</p>
      <Link to="/app/workspace">Return to workspace</Link>
    </main>
  );
}
