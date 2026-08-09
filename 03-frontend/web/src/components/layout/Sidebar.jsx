import { ChevronLeft, ChevronRight, Store } from "lucide-react";
import { Link } from "react-router-dom";
import { useLocale } from "../../contexts/LocaleContext.jsx";
import { useRestaurant } from "../../contexts/RestaurantContext.jsx";
import { Badge } from "../ui/Badge.jsx";
import { Button } from "../ui/Button.jsx";
import { RestaurantSwitcher } from "./RestaurantSwitcher.jsx";
import { SidebarNavigation } from "./SidebarNavigation.jsx";
import { UserMenu } from "./UserMenu.jsx";

export function Sidebar({ collapsed, onCollapsedChange }) {
  const { t, direction } = useLocale();
  const restaurant = useRestaurant();
  const CollapseIcon = direction === "rtl" ? ChevronRight : ChevronLeft;
  const ExpandIcon = direction === "rtl" ? ChevronLeft : ChevronRight;
  const ToggleIcon = collapsed ? ExpandIcon : CollapseIcon;

  return (
    <aside
      className={`app-sidebar ${collapsed ? "is-collapsed" : ""}`.trim()}
      aria-label={t("navigation.mainNavigation")}
    >
      <div className="app-sidebar__product">
        <Link to="/app/dashboard" className="product-mark" aria-label={t("common.productName")}>
          <Store size={22} />
        </Link>
        {!collapsed && (
          <div>
            <strong>{t("common.productName")}</strong>
            <small>{t("navigation.productSubtitle")}</small>
          </div>
        )}
      </div>

      <div className="app-sidebar__restaurant">
        {collapsed ? (
          <span
            className="restaurant-compact"
            title={restaurant.selectedRestaurant?.name || t("navigation.currentRestaurant")}
          >
            {(restaurant.selectedRestaurant?.name || "R").slice(0, 1).toUpperCase()}
          </span>
        ) : (
          <RestaurantSwitcher />
        )}
        {collapsed && restaurant.demoMode && <Badge variant="warning">{t("common.demo")}</Badge>}
      </div>

      <SidebarNavigation role={restaurant.role} collapsed={collapsed} />

      <div className="app-sidebar__footer">
        <UserMenu compact={collapsed} />
        <Button
          variant="ghost"
          fullWidth={!collapsed}
          aria-label={collapsed ? t("navigation.expandSidebar") : t("navigation.collapseSidebar")}
          title={collapsed ? t("navigation.expandSidebar") : t("navigation.collapseSidebar")}
          onClick={() => onCollapsedChange(!collapsed)}
        >
          <ToggleIcon size={16} />
          {!collapsed && <span>{t("navigation.collapseSidebar")}</span>}
        </Button>
      </div>
    </aside>
  );
}
