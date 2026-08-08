import { Link } from "react-router-dom";
import { useLocale } from "../contexts/LocaleContext.jsx";

export function PlaceholderPage({ title, titleKey, description }) {
  const { t } = useLocale();
  const resolvedTitle = titleKey ? t(titleKey) : title;

  return (
    <section className="route-state">
      <span className="status-pill">In development</span>
      <h1>{resolvedTitle}</h1>
      <p>{description}</p>
      <Link to="/app/workspace">Back to current workspace</Link>
    </section>
  );
}
