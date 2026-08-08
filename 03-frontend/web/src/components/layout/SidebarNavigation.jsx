import { getNavigationForRole } from "../../app/navigation.js";
import { useLocale } from "../../contexts/LocaleContext.jsx";

import { SidebarNavigationItem } from "./SidebarNavigationItem.jsx";

export function SidebarNavigation({ role, collapsed = false, onNavigate }) {
  const { t } = useLocale();
  const groups = getNavigationForRole(role);

  return (
    <nav className="sidebar-nav" aria-label={t("navigation.mainNavigation")}>
      {groups.map((group) => (
        <section className="sidebar-nav__group" key={group.id}>
          {!collapsed && <h2>{t(group.translationKey)}</h2>}
          <div className="sidebar-nav__list">
            {group.items.map((item) => (
              <SidebarNavigationItem key={item.id} item={item} collapsed={collapsed} onNavigate={onNavigate} />
            ))}
          </div>
        </section>
      ))}
    </nav>
  );
}
