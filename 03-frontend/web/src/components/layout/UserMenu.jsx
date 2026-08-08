import { LogOut, UserCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useLocale } from "../../contexts/LocaleContext.jsx";
import { Button } from "../ui/Button.jsx";

export function UserMenu({ compact = false }) {
  const auth = useAuth();
  const { t } = useLocale();
  const navigate = useNavigate();
  const name = auth.user?.name || auth.user?.email || t("navigation.account");
  const role = auth.user?.role || "";

  const logout = async () => {
    await auth.logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className={`user-menu ${compact ? "user-menu--compact" : ""}`.trim()}>
      <div className="user-menu__identity">
        <UserCircle size={22} aria-hidden="true" />
        <span>
          <b>{name}</b>
          {!compact && role && <small>{role}</small>}
        </span>
      </div>
      <Button variant="ghost" onClick={logout} aria-label={t("navigation.logout")} title={t("navigation.logout")}>
        <LogOut size={16} />
        {!compact && <span>{t("navigation.logout")}</span>}
      </Button>
    </div>
  );
}
