import { Link, useLocation } from "react-router-dom";
import { mobilePriorityItems, roleCanAccess, isNavigationItemActive } from "../../app/navigation.js";
import { useLocale } from "../../contexts/LocaleContext.jsx";
import { useRestaurant } from "../../contexts/RestaurantContext.jsx";
import { BrandMark } from "../brand/BrandMark.jsx";

export function MobileNavigation() {
  const { pathname } = useLocation();
  const { t } = useLocale();
  const restaurant = useRestaurant();
  const items = mobilePriorityItems.filter((item) => roleCanAccess(item, restaurant.role));

  return (
    <nav className="mobile-bottom-nav" aria-label={t("navigation.mainNavigation")}>
      {items.map((item) => {
        const Icon = item.icon;
        const label = t(item.translationKey);
        return (
          <Link
            key={item.id}
            to={item.path}
            className={`mobile-bottom-nav__item ${isNavigationItemActive(item, pathname) ? "is-active" : ""}`}
            aria-current={isNavigationItemActive(item, pathname) ? "page" : undefined}
          >
            {item.id === "dashboard" ? <BrandMark size={22} monochrome /> : <Icon size={18} aria-hidden="true" />}
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
