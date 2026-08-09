import { MoreHorizontal } from "lucide-react";
import { NavLink } from "react-router-dom";
import { mobilePriorityItems, roleCanAccess } from "../../app/navigation.js";
import { useLocale } from "../../contexts/LocaleContext.jsx";
import { useRestaurant } from "../../contexts/RestaurantContext.jsx";

export function MobileNavigation({ onMore }) {
  const { t } = useLocale();
  const restaurant = useRestaurant();
  const items = mobilePriorityItems.filter((item) => roleCanAccess(item, restaurant.role));

  return (
    <nav className="mobile-bottom-nav" aria-label={t("navigation.mainNavigation")}>
      {items.map((item) => {
        const Icon = item.icon;
        const label = t(item.translationKey);
        return (
          <NavLink
            key={item.id}
            to={item.path}
            className={({ isActive }) => `mobile-bottom-nav__item ${isActive ? "is-active" : ""}`.trim()}
            end
          >
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        );
      })}
      <button type="button" className="mobile-bottom-nav__item" onClick={onMore} aria-label={t("navigation.more")}>
        <MoreHorizontal size={18} aria-hidden="true" />
        <span>{t("navigation.more")}</span>
      </button>
    </nav>
  );
}
