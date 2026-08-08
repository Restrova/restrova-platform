import { Menu } from "lucide-react";
import { useLocale } from "../../contexts/LocaleContext.jsx";
import { useRestaurant } from "../../contexts/RestaurantContext.jsx";
import { useCurrentRoute } from "../../hooks/useCurrentRoute.js";
import { Badge } from "../ui/Badge.jsx";
import { Button } from "../ui/Button.jsx";
import { BranchSwitcher } from "./BranchSwitcher.jsx";
import { LanguageSwitcher } from "./LanguageSwitcher.jsx";
import { NotificationButton } from "./NotificationButton.jsx";
import { UserMenu } from "./UserMenu.jsx";

export function Topbar({ onOpenMobileNavigation }) {
  const { t } = useLocale();
  const route = useCurrentRoute();
  const restaurant = useRestaurant();

  return (
    <header className="app-topbar">
      <div className="app-topbar__title">
        <Button
          className="app-topbar__menu"
          variant="ghost"
          aria-label={t("navigation.openNavigation")}
          onClick={onOpenMobileNavigation}
        >
          <Menu size={20} />
        </Button>
        <div>
          <small>{t("navigation.mainNavigation")}</small>
          <h1>{route.title}</h1>
        </div>
      </div>
      <div className="app-topbar__controls">
        {restaurant.demoMode && <Badge variant="warning">{t("navigation.demoMode")}</Badge>}
        <BranchSwitcher />
        <LanguageSwitcher compact />
        <NotificationButton />
        <UserMenu compact />
      </div>
    </header>
  );
}
