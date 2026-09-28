import { Link } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { isNavigationItemActive } from "../../app/navigation.js";
import { useLocale } from "../../contexts/LocaleContext.jsx";

export function SidebarNavigationItem({ item, collapsed = false, onNavigate }) {
  const { t } = useLocale();
  const location = useLocation();
  const Icon = item.icon;
  const label = t(item.translationKey);

  return (
    <Link
      to={item.path}
      className={`sidebar-nav__item ${isNavigationItemActive(item, location.pathname) ? "is-active" : ""}`}
      aria-current={isNavigationItemActive(item, location.pathname) ? "page" : undefined}
      title={collapsed ? label : undefined}
      onClick={onNavigate}
    >
      <>
        <Icon size={18} aria-hidden="true" />
        <span className={collapsed ? "sr-only" : ""}>{label}</span>
      </>
    </Link>
  );
}
