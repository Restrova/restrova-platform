import { useLocation } from "react-router-dom";
import { findNavigationItem } from "../app/navigation.js";
import { useLocale } from "../contexts/LocaleContext.jsx";

export function useCurrentRoute() {
  const location = useLocation();
  const { t } = useLocale();
  const item = findNavigationItem(location.pathname);
  return {
    item,
    pathname: location.pathname,
    title: item ? t(item.titleKey || item.translationKey) : t("navigation.dashboard"),
    groupId: item?.groupId || "primary",
    fullBleed: Boolean(item?.fullBleed)
  };
}
