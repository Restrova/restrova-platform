import { Link } from "react-router-dom";
import { useLocale } from "../contexts/LocaleContext.jsx";
import { copilotUiCopy } from "./copilotUiCopy.js";
import LegacyApplication from "../components/legacy/LegacyApplication.jsx";

export function LegacyWorkspacePage() {
  const { locale } = useLocale(),
    c = copilotUiCopy[locale === "zh-CN" ? "zh" : locale] || copilotUiCopy.en;
  return (
    <>
      <nav className="decision-links">
        <Link to="/app/assistant">{c.title}</Link>
        <Link to="/app/reports">{c.report}</Link>
      </nav>
      <LegacyApplication />
    </>
  );
}
