import { useLocale } from "../../contexts/LocaleContext.jsx";

export function LanguageSwitcher({ compact = false }) {
  const locale = useLocale();

  return (
    <label className={`shell-switcher language-switcher ${compact ? "shell-switcher--compact" : ""}`.trim()}>
      {!compact && <span>{locale.t("navigation.changeLanguage")}</span>}
      <select
        aria-label={locale.t("navigation.changeLanguage")}
        value={locale.locale}
        onChange={(event) => locale.setLocale(event.target.value)}
      >
        {Object.entries(locale.locales).map(([value, meta]) => (
          <option key={value} value={value}>{meta.label}</option>
        ))}
      </select>
    </label>
  );
}
