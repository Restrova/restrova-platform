import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Bot,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  MapPin,
  ShieldCheck,
  Sparkles,
  Store,
  User
} from "lucide-react";
import { LanguageSwitcher } from "../components/layout/LanguageSwitcher.jsx";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useLocale } from "../contexts/LocaleContext.jsx";

const defaultProfile = {
  name: "Restaurant Owner",
  organizationName: "Sana'a Hospitality",
  restaurantName: "مطعم صنعاء",
  branchName: "Guangzhou Main",
  branchCode: "GZ-01",
  city: "Guangzhou",
  currency: "CNY",
  timezone: "Asia/Shanghai",
  language: "ar",
  operatingDayStart: "10:00",
  operatingDayEnd: "02:00"
};

const stepIcons = [User, Building2, Store, MapPin, Check];

export function LoginPage({ mode = "login" }) {
  const auth = useAuth();
  const { direction, locale, t } = useLocale();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [profile, setProfile] = useState(() => ({ ...defaultProfile, language: locale }));
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isRegister = mode === "register";
  const next = searchParams.get("next") || "/app/workspace";
  const steps = useMemo(
    () => ["account", "organization", "restaurant", "branch", "review"].map((key) => t(`auth.steps.${key}`)),
    [t]
  );
  const BackIcon = direction === "rtl" ? ChevronRight : ChevronLeft;
  const NextIcon = direction === "rtl" ? ChevronLeft : ChevronRight;

  useEffect(() => {
    if (auth.isAuthenticated && !isRegister) navigate(next, { replace: true });
  }, [auth.isAuthenticated, isRegister, navigate, next]);

  const updateProfile = (field) => (event) => setProfile((current) => ({ ...current, [field]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (isRegister && step < steps.length - 1) {
      setStep((current) => current + 1);
      return;
    }

    setBusy(true);
    try {
      if (isRegister) await auth.register({ ...profile, email, password });
      else await auth.login({ email, password });
      navigate(next, { replace: true });
    } catch (requestError) {
      setError(requestError.message || t("auth.unable"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className={`login ${isRegister ? "login--onboarding" : ""}`.trim()}>
      <section>
        <div className="auth-toolbar">
          <div className="brand">
            <span>
              <Bot />
            </span>
            <b>{t("common.productName")}</b>
          </div>
          <LanguageSwitcher compact />
        </div>
        <h1>
          {t("auth.headline")}
          <br />
          <em>{t("auth.headlineAccent")}</em>
        </h1>
        <p>{t("auth.description")}</p>
        <div className="superpowers">
          <span>{t("navigation.reports")}</span>
          <span>{t("navigation.menuProfitability")}</span>
          <span>{t("navigation.alerts")}</span>
        </div>

        <form onSubmit={submit} className={isRegister ? "onboarding-form" : ""}>
          <div className="auth-tabs">
            <Link className={!isRegister ? "active" : ""} to="/login">
              {t("auth.login")}
            </Link>
            <Link className={isRegister ? "active" : ""} to="/register">
              {t("auth.createRestaurant")}
            </Link>
          </div>

          {isRegister && (
            <ol className="onboarding-stepper" aria-label={t("auth.progress")}>
              {steps.map((label, index) => {
                const Icon = stepIcons[index];
                return (
                  <li key={label} className={index === step ? "is-active" : index < step ? "is-complete" : ""}>
                    <span>{index < step ? <Check size={13} /> : <Icon size={13} />}</span>
                    <small>{label}</small>
                  </li>
                );
              })}
            </ol>
          )}

          {(!isRegister || step === 0) && (
            <fieldset className="onboarding-fieldset">
              {isRegister && <legend>{t("auth.accountTitle")}</legend>}
              {isRegister && (
                <label>
                  {t("auth.yourName")}
                  <input value={profile.name} onChange={updateProfile("name")} required />
                </label>
              )}
              <label>
                {t("auth.email")}
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </label>
              <label>
                {t("auth.password")}
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={8}
                  required
                />
              </label>
              {isRegister && <small className="quiet-note">{t("auth.passwordHelp")}</small>}
            </fieldset>
          )}

          {isRegister && step === 1 && (
            <fieldset className="onboarding-fieldset">
              <legend>{t("auth.organizationTitle")}</legend>
              <p>{t("auth.organizationHelp")}</p>
              <label>
                {t("auth.organization")}
                <input value={profile.organizationName} onChange={updateProfile("organizationName")} required />
              </label>
              <div className="form-grid onboarding-three-columns">
                <label>
                  {t("auth.currency")}
                  <select value={profile.currency} onChange={updateProfile("currency")}>
                    <option value="CNY">CNY</option>
                    <option value="SAR">SAR</option>
                    <option value="USD">USD</option>
                  </select>
                </label>
                <label>
                  {t("auth.timezone")}
                  <select value={profile.timezone} onChange={updateProfile("timezone")}>
                    <option value="Asia/Shanghai">Asia/Shanghai</option>
                    <option value="Asia/Riyadh">Asia/Riyadh</option>
                    <option value="Asia/Aden">Asia/Aden</option>
                  </select>
                </label>
                <label>
                  {t("auth.language")}
                  <select value={profile.language} onChange={updateProfile("language")}>
                    <option value="ar">العربية</option>
                    <option value="en">English</option>
                    <option value="zh-CN">简体中文</option>
                  </select>
                </label>
              </div>
            </fieldset>
          )}

          {isRegister && step === 2 && (
            <fieldset className="onboarding-fieldset">
              <legend>{t("auth.restaurantTitle")}</legend>
              <p>{t("auth.restaurantHelp")}</p>
              <label>
                {t("auth.restaurant")}
                <input value={profile.restaurantName} onChange={updateProfile("restaurantName")} required />
              </label>
              <div className="onboarding-info">
                <Store size={18} />
                <span>{t("auth.restaurantInfo")}</span>
              </div>
            </fieldset>
          )}

          {isRegister && step === 3 && (
            <fieldset className="onboarding-fieldset">
              <legend>{t("auth.branchTitle")}</legend>
              <p>{t("auth.branchHelp")}</p>
              <label>
                {t("auth.firstBranch")}
                <input value={profile.branchName} onChange={updateProfile("branchName")} required />
              </label>
              <div className="form-grid">
                <label>
                  {t("auth.code")}
                  <input value={profile.branchCode} onChange={updateProfile("branchCode")} required />
                </label>
                <label>
                  {t("auth.city")}
                  <input value={profile.city} onChange={updateProfile("city")} required />
                </label>
              </div>
              <div className="form-grid">
                <label>
                  {t("auth.dayStart")}
                  <input
                    type="time"
                    value={profile.operatingDayStart}
                    onChange={updateProfile("operatingDayStart")}
                    required
                  />
                </label>
                <label>
                  {t("auth.dayEnd")}
                  <input
                    type="time"
                    value={profile.operatingDayEnd}
                    onChange={updateProfile("operatingDayEnd")}
                    required
                  />
                </label>
              </div>
            </fieldset>
          )}

          {isRegister && step === 4 && (
            <fieldset className="onboarding-fieldset">
              <legend>{t("auth.reviewTitle")}</legend>
              <p>{t("auth.reviewHelp")}</p>
              <dl className="onboarding-review">
                <div>
                  <dt>{t("auth.yourName")}</dt>
                  <dd>{profile.name}</dd>
                </div>
                <div>
                  <dt>{t("auth.email")}</dt>
                  <dd>{email}</dd>
                </div>
                <div>
                  <dt>{t("auth.organization")}</dt>
                  <dd>{profile.organizationName}</dd>
                </div>
                <div>
                  <dt>{t("auth.restaurant")}</dt>
                  <dd>{profile.restaurantName}</dd>
                </div>
                <div>
                  <dt>{t("auth.firstBranch")}</dt>
                  <dd>
                    {profile.branchCode} — {profile.branchName}
                  </dd>
                </div>
                <div>
                  <dt>{t("auth.city")}</dt>
                  <dd>{profile.city}</dd>
                </div>
                <div>
                  <dt>{t("auth.operatingDay")}</dt>
                  <dd>
                    {profile.operatingDayStart}–{profile.operatingDayEnd}
                  </dd>
                </div>
                <div>
                  <dt>{t("auth.defaults")}</dt>
                  <dd>
                    {profile.currency} · {profile.timezone} · {profile.language}
                  </dd>
                </div>
              </dl>
            </fieldset>
          )}

          {error && (
            <small role="alert" className="auth-error">
              {error}
            </small>
          )}
          <div className="onboarding-actions">
            {isRegister && step > 0 && (
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setStep((current) => current - 1);
                  setError("");
                }}
              >
                <BackIcon size={16} /> {t("common.back")}
              </button>
            )}
            <button disabled={busy}>
              {busy
                ? t("auth.working")
                : isRegister && step < steps.length - 1
                  ? t("common.continue")
                  : isRegister
                    ? t("auth.createOrganization")
                    : t("auth.openDecisionCenter")}
              {!busy && isRegister && step < steps.length - 1 && <NextIcon size={16} />}
            </button>
          </div>
        </form>
      </section>
      <aside>
        <div className="quote">{t("auth.quote")}</div>
        <div className="answer">
          <Sparkles size={18} />
          <div>
            <b>{t("auth.nextMove")}</b>
            <br />
            {t("auth.sampleAnswer")}
          </div>
        </div>
        <div className="boundary">
          <ShieldCheck /> {t("auth.boundary")}
        </div>
      </aside>
    </main>
  );
}
