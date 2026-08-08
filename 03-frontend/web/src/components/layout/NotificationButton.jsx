import { Bell } from "lucide-react";
import { useLocale } from "../../contexts/LocaleContext.jsx";
import { Button } from "../ui/Button.jsx";

export function NotificationButton() {
  const { t } = useLocale();
  return (
    <Button variant="ghost" aria-label={t("navigation.notifications")} title={t("navigation.notifications")} disabled>
      <Bell size={18} />
    </Button>
  );
}
