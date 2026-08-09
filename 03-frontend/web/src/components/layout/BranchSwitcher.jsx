import { useLocale } from "../../contexts/LocaleContext.jsx";
import { useRestaurant } from "../../contexts/RestaurantContext.jsx";

export function BranchSwitcher() {
  const { t } = useLocale();
  const restaurant = useRestaurant();
  const disabled = restaurant.loading || !restaurant.selectedRestaurant;

  return (
    <label className="shell-switcher branch-switcher">
      <span>{t("navigation.currentBranch")}</span>
      <select
        aria-label={t("navigation.currentBranch")}
        value={restaurant.selectedBranchId}
        disabled={disabled}
        onChange={(event) => restaurant.setSelectedBranchId(event.target.value)}
      >
        {!restaurant.branches.length && <option value="">{t("navigation.noBranchSelected")}</option>}
        {restaurant.branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name || branch.code}
          </option>
        ))}
      </select>
    </label>
  );
}
