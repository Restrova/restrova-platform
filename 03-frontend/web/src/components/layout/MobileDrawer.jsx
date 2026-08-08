import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useLocale } from "../../contexts/LocaleContext.jsx";
import { useRestaurant } from "../../contexts/RestaurantContext.jsx";
import { Button } from "../ui/Button.jsx";
import { BranchSwitcher } from "./BranchSwitcher.jsx";
import { LanguageSwitcher } from "./LanguageSwitcher.jsx";
import { RestaurantSwitcher } from "./RestaurantSwitcher.jsx";
import { SidebarNavigation } from "./SidebarNavigation.jsx";
import { UserMenu } from "./UserMenu.jsx";

export function MobileDrawer({ open, onClose }) {
  const { t } = useLocale();
  const restaurant = useRestaurant();
  const panelRef = useRef(null);
  const previousFocus = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    previousFocus.current = document.activeElement;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = panelRef.current?.querySelector("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
    focusable?.focus();

    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const nodes = [...panelRef.current.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")].filter((node) => !node.disabled);
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = originalOverflow;
      previousFocus.current?.focus?.();
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="mobile-drawer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside
        className="mobile-drawer__panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-navigation-title"
      >
        <header className="mobile-drawer__header">
          <div>
            <h2 id="mobile-navigation-title">{t("common.productName")}</h2>
            <p>{t("navigation.productSubtitle")}</p>
          </div>
          <Button variant="ghost" aria-label={t("navigation.closeNavigation")} onClick={onClose}>
            <X size={18} />
          </Button>
        </header>
        <div className="mobile-drawer__section">
          <RestaurantSwitcher />
          <BranchSwitcher />
          <LanguageSwitcher />
        </div>
        <SidebarNavigation role={restaurant.role} onNavigate={onClose} />
        <div className="mobile-drawer__footer">
          <UserMenu />
        </div>
      </aside>
    </div>
  );
}
