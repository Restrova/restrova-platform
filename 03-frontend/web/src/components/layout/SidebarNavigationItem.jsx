import { NavLink } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { isNavigationItemActive } from "../../app/navigation.js";
import { useLocale } from "../../contexts/LocaleContext.jsx";

export function SidebarNavigationItem({ item, collapsed = false, onNavigate }) {
  const { t } = useLocale();
  const location = useLocation();
  const Icon = item.icon;
  const label = t(item.translationKey);

  return (
    <NavLink
      to={item.path}
      className={({ isActive }) => `sidebar-nav__item ${isActive ? "is-active" : ""}`.trim()}
      title={collapsed ? label : undefined}
      onClick={onNavigate}
      end
    >
      {({ isActive }) => (
        <>
          <Icon size={18} aria-hidden="true" />
          <span className={collapsed ? "sr-only" : ""}>{label}</span>
          <span className="sidebar-nav__state sr-only">
            {isNavigationItemActive(item, location.pathname) || isActive ? label : ""}
          </span>
        </>
      )}
    </NavLink>
  );
}
