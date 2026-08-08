import { useLocale } from "../../contexts/LocaleContext.jsx";

export function SkipLink() {
  const { t } = useLocale();
  return <a className="skip-link" href="#main-content">{t("common.continue")}</a>;
}
