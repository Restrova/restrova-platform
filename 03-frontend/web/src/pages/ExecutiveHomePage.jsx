import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, ArrowUpRight } from "lucide-react";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useRestaurant } from "../contexts/RestaurantContext.jsx";
import { useLocale } from "../contexts/LocaleContext.jsx";
import { api } from "../lib/api.js";
import { Button } from "../components/ui/Button.jsx";
import { simpleCopy } from "./simpleCopy.js";
import { actionCopy } from "./decisionCopy.js";
import { useOverview, ConnectChoices } from "./SimplePages.jsx";
export function ExecutiveHomePage() {
  const auth = useAuth(),
    restaurant = useRestaurant(),
    { locale } = useLocale(),
    c = simpleCopy[locale] || simpleCopy.en,
    language = locale === "zh-CN" ? "zh" : locale,
    query = useOverview();
  const [dismissed, setDismissed] = useState("");
  const accountKey = `${auth.user?.id}:${restaurant.selectedRestaurantId}`;
  const weekly = useQuery({
    queryKey: ["simple-home-trend", accountKey, restaurant.selectedBranchId, language],
    queryFn: ({ signal }) =>
      api(
        `/reports/executive?${new URLSearchParams({ cadence: "weekly", language, scope: restaurant.selectedBranchId ? "branch" : "restaurant", ...(restaurant.selectedBranchId ? { branchId: restaurant.selectedBranchId } : {}) })}`,
        { signal }
      ),
    enabled: Boolean(query.data?.hasData),
    retry: false
  });
  if (query.isPending) return <p role="status">{c.loading}</p>;
  if (query.isError)
    return (
      <section className="simple-page">
        <p role="alert">{c.error}</p>
        <Button onClick={() => query.refetch()}>{c.retry}</Button>
      </section>
    );
  const data = query.data,
    digits = new Intl.NumberFormat(locale, { style: "currency", currency: data.currencyCode }).resolvedOptions()
      .maximumFractionDigits;
  const money = (n) =>
    n == null
      ? c.unknown
      : new Intl.NumberFormat(locale, {
          style: "currency",
          currency: data.currencyCode,
          maximumFractionDigits: digits
        }).format(n / 10 ** digits);
  if (!data.hasData && dismissed !== accountKey && auth.user?.role === "owner")
    return (
      <section className="simple-welcome simple-page">
        <ol className="welcome-steps" aria-label={c.welcome}>
          <li aria-current="step">{c.connectStep}</li>
          <li>{c.reviewStep}</li>
          <li>{c.analysisStep}</li>
        </ol>
        <div className="welcome-card">
          <img src="/images/restrova/welcome-mascot.webp" alt="" width="180" height="180" />
          <div className="welcome-card__content">
            <p className="simple-eyebrow">RESTROVA</p>
            <h1>{c.welcome} 👋</h1>
            <p>{c.connectIntro}</p>
            <ConnectChoices c={c} />
            <Button variant="ghost" onClick={() => setDismissed(accountKey)}>
              {c.later}
            </Button>
          </div>
        </div>
      </section>
    );
  const action = weekly.data?.topActions?.[0],
    actions = actionCopy[language] || actionCopy.en;
  const trend = weekly.data?.trend || [],
    known = trend.filter((day) => day.revenueMinor != null),
    max = Math.max(1, ...known.map((day) => Math.abs(day.revenueMinor)));
  return (
    <section className="simple-page simple-home">
      <header className="simple-home-heading">
        <div>
          <p className="simple-eyebrow">
            {c.hello}
            {auth.user?.name ? `, ${auth.user.name}` : ""} 👋
          </p>
          <h1>{restaurant.selectedRestaurant?.name || c.home}</h1>
          <p>{c.home}</p>
        </div>
        <details className="simple-actions">
          <summary aria-label={c.tools}>•••</summary>
          <Link to="/app/reports">{c.reports}</Link>
          <Link to="/app/forecasts">{c.forecast}</Link>
          <Link to="/app/menu-profitability">{c.viewMenu}</Link>
        </details>
      </header>
      <p className="simple-period">
        {c.today} ·{" "}
        <bdi>
          {data.date} · {data.timezone}
        </bdi>
        {data.today.source === "manual" ? ` · ${c.manualSource}` : ""}
      </p>
      <div className="simple-kpis">
        {[
          [c.sales, money(data.today.revenueMinor), "today"],
          [c.profit, money(data.today.profitMinor), "profit"],
          [
            c.orders,
            data.today.orders == null ? c.unknown : new Intl.NumberFormat(locale).format(data.today.orders),
            "today"
          ]
        ].map(([label, value, path]) => (
          <Link to={`/app/${path}`} className="simple-kpi" key={label}>
            <span>
              {label}
              <ArrowUpRight className="directional-arrow" size={18} aria-hidden="true" />
            </span>
            <strong>{value}</strong>
          </Link>
        ))}
      </div>
      <p className="simple-muted">{c.profitNote}</p>
      {data.alert && (
        <Link className="simple-attention" to="/app/alerts">
          <strong>{c.important}</strong>
          <span>
            {data.alert.snapshot?.title || c.details}{" "}
            <span className="directional-arrow" aria-hidden="true">
              →
            </span>
          </span>
        </Link>
      )}
      <Link className="simple-ask" to="/app/assistant">
        <Sparkles size={23} />
        {c.ask}
        <span className="directional-arrow" aria-hidden="true">
          →
        </span>
      </Link>
      <section className="simple-panel">
        <h2>{c.trend}</h2>
        {weekly.isFetching ? (
          <p role="status">{c.loading}</p>
        ) : weekly.isError ? (
          <p role="alert">{c.error}</p>
        ) : !known.length ? (
          <p>{c.noTrend}</p>
        ) : (
          <div className="simple-chart" role="img" aria-label={c.trend}>
            {trend.map((day) => (
              <div className="simple-chart-day" key={day.date}>
                <small>{money(day.revenueMinor)}</small>
                <div className="simple-chart-track">
                  <span
                    style={{
                      background: day.revenueMinor < 0 ? "#b84e35" : undefined,
                      height: day.revenueMinor == null ? 0 : `${Math.max(2, (Math.abs(day.revenueMinor) / max) * 100)}%`
                    }}
                  />
                </div>
                <span>
                  <bdi>{day.date.slice(5)}</bdi>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="simple-panel simple-insight">
        <img className="rivo-insight" src="/images/restrova/welcome-mascot.webp" alt="" width="84" height="84" />
        <div>
          <p className="simple-eyebrow">RIVO AI</p>
          <h2>{c.insight}</h2>
          <p>
            {action
              ? actions[action.recommendedAction] || c.details
              : !data.status.costs.count
                ? `${c.missing}: ${c.costs}`
                : c.noAlert}
          </p>
          {action?.item?.name && <p>{action.item.name}</p>}
          <Link to={action ? "/app/recommendations" : "/app/data"}>
            {c.details}{" "}
            <span className="directional-arrow" aria-hidden="true">
              →
            </span>
          </Link>
        </div>
      </section>
    </section>
  );
}
