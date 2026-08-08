import { useLocale } from "../../contexts/LocaleContext.jsx";
import { useRestaurant } from "../../contexts/RestaurantContext.jsx";
import { Badge } from "../ui/Badge.jsx";

export function RestaurantSwitcher({ compact = false }) {
  const { t } = useLocale();
  const restaurant = useRestaurant();

  if (restaurant.loading) {
    return <span className="shell-switcher shell-switcher--loading">{t("common.loading")}</span>;
  }

  if (!restaurant.restaurants.length) {
    return <span className="shell-switcher shell-switcher--empty">{t("navigation.currentRestaurant")}: —</span>;
  }

  return (
    <label className={`shell-switcher ${compact ? "shell-switcher--compact" : ""}`.trim()}>
      {!compact && <span>{t("navigation.currentRestaurant")}</span>}
      <select
        aria-label={t("navigation.currentRestaurant")}
        value={restaurant.selectedRestaurantId}
        onChange={(event) => restaurant.setSelectedRestaurantId(event.target.value)}
      >
        {restaurant.restaurants.map((item) => (
          <option key={item.id} value={item.id}>{item.name}</option>
        ))}
      </select>
      {restaurant.demoMode && <Badge variant="warning">{t("navigation.demoMode")}</Badge>}
    </label>
  );
}
