import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useRestaurant } from "../contexts/RestaurantContext.jsx";
import { useLocale } from "../contexts/LocaleContext.jsx";
import { api } from "../lib/api.js";
import { announceDataChange } from "../lib/dataRefresh.js";
import { simpleCopy } from "./simpleCopy.js";
import { LanguageSwitcher } from "../components/layout/LanguageSwitcher.jsx";
import { Button } from "../components/ui/Button.jsx";
import {
  BarChart3,
  CheckCircle2,
  CircleAlert,
  FileSpreadsheet,
  Link2,
  ShoppingBag,
  UtensilsCrossed
} from "lucide-react";
export function useOverview() {
  const auth = useAuth(),
    restaurant = useRestaurant();
  const branchId = restaurant.selectedBranchId;
  return useQuery({
    queryKey: ["simple-overview", auth.user?.id, auth.organization?.id, restaurant.selectedRestaurantId, branchId],
    queryFn: ({ signal }) => api(`/experience/overview${branchId ? `?branchId=${branchId}` : ""}`, { signal }),
    enabled: Boolean(restaurant.selectedRestaurantId),
    retry: false
  });
}
export function ConnectChoices({ c }) {
  return (
    <div className="connect-choices">
      <Link className="simple-primary" to="/app/integrations">
        <Link2 size={20} aria-hidden="true" /> {c.connect} <span aria-hidden="true">→</span>
      </Link>
      <p>{c.connectionNote}</p>
      <Link className="simple-secondary" to="/app/imports">
        <FileSpreadsheet size={20} aria-hidden="true" /> {c.upload}
      </Link>
    </div>
  );
}
export function DataPage() {
  const { locale, t } = useLocale(),
    c = simpleCopy[locale] || simpleCopy.en,
    auth = useAuth(),
    query = useOverview();
  return (
    <section className="simple-page">
      <header>
        <p className="simple-eyebrow">RESTROVA / DATA</p>
        <h1>{c.data}</h1>
        <p>{c.dataIntro}</p>
      </header>
      {query.isPending ? (
        <p role="status">{c.loading}</p>
      ) : query.isError ? (
        <p role="alert">
          {c.error} <Button onClick={() => query.refetch()}>{c.retry}</Button>
        </p>
      ) : (
        <>
          <div className="data-status-list">
            {["sales", "orders", "costs"].map((key) => (
              <article key={key}>
                <div className="data-status-name">
                  <span className="data-status-icon" aria-hidden="true">
                    {key === "sales" ? (
                      <BarChart3 size={22} />
                    ) : key === "orders" ? (
                      <ShoppingBag size={22} />
                    ) : (
                      <UtensilsCrossed size={22} />
                    )}
                  </span>
                  <div>
                    <h2>{c[key]}</h2>
                    <span className={query.data.status[key].count ? "simple-good" : "simple-warning"}>
                      {query.data.status[key].count ? (
                        <CheckCircle2 size={16} aria-hidden="true" />
                      ) : (
                        <CircleAlert size={16} aria-hidden="true" />
                      )}
                      {query.data.status[key].count ? c.ready : c.missing}
                    </span>
                  </div>
                </div>
                <small>
                  {c.updated}: <bdi>{query.data.status[key].updatedAt || "—"}</bdi>
                </small>
              </article>
            ))}
          </div>
          <details className="simple-details">
            <summary>{c.status}</summary>
            <p>{c.profitNote}</p>
            <ul>
              {(query.data.coverage?.missingCategories || []).map((key) => (
                <li key={key}>
                  {c.missing}: {t(`financialDashboard.categories.${key}`)}
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
      {auth.user?.role === "owner" ? <ConnectChoices c={c} /> : <p>{c.readOnly}</p>}
      {["owner", "branch_manager"].includes(auth.user?.role) && (
        <details className="simple-details">
          <summary>{c.manual}</summary>
          <ManualSummary key={`${query.data?.scope?.branchId}:${query.data?.date}`} c={c} overview={query.data} />
        </details>
      )}
    </section>
  );
}
function ManualSummary({ c, overview }) {
  const restaurant = useRestaurant(),
    client = useQueryClient(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false),
    [saved, setSaved] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(false);
    const form = new FormData(e.currentTarget);
    try {
      const result = await api("/experience/daily", {
        method: "POST",
        body: JSON.stringify({
          branchId: Number(restaurant.selectedBranchId),
          date: overview.date,
          sales: form.get("sales"),
          orders: Number(form.get("orders")),
          costs: form.get("costs"),
          waste: form.get("waste")
        })
      });
      announceDataChange(result.dataRevision);
      setSaved(true);
      await client.invalidateQueries();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  if (!restaurant.selectedBranchId) return <p>{c.manualDisabled}</p>;
  if (saved)
    return (
      <p role="status">
        {c.saved} · <Link to="/app/assistant?question=today">{c.analyze}</Link>
      </p>
    );
  if (overview?.manual) return <p>{c.manualExisting}</p>;
  if (overview?.today?.source === "import" || overview?.coverage?.hasData) return <p>{c.manualUnavailable}</p>;
  return (
    <form className="simple-manual" onSubmit={submit}>
      <p>{c.manualNote}</p>
      <p>
        <bdi>
          {overview?.date} · {overview?.currencyCode}
        </bdi>
      </p>
      {["sales", "orders", "costs", "waste"].map((key) => (
        <label key={key}>
          {key === "costs" ? c.totalCosts : c[key]}
          <input name={key} type="number" step={key === "orders" ? "1" : "any"} min="0" required disabled={busy} />
        </label>
      ))}
      {error && <p role="alert">{c.manualConflict}</p>}
      <Button type="submit" disabled={busy || !overview}>
        {busy ? c.loading : c.save}
      </Button>
    </form>
  );
}
export function SettingsPage() {
  const { locale } = useLocale(),
    c = simpleCopy[locale] || simpleCopy.en,
    auth = useAuth(),
    restaurant = useRestaurant(),
    [params, setParams] = useSearchParams();
  const owner = auth.user?.role === "owner",
    tabs = owner
      ? ["restaurant", "branches", "team", "integrations", "language", "account"]
      : ["restaurant", "language", "account"];
  const tab = tabs.includes(params.get("tab")) ? params.get("tab") : "restaurant";
  return (
    <section className="simple-page">
      <p className="simple-eyebrow">RESTROVA / SETTINGS</p>
      <h1>{c.settings}</h1>
      <div className="settings-tabs" role="tablist" aria-label={c.settings}>
        {tabs.map((key) => (
          <button
            role="tab"
            aria-selected={tab === key}
            aria-controls="settings-panel"
            id={`settings-${key}`}
            key={key}
            onClick={() => setParams({ tab: key })}
          >
            {c[key]}
          </button>
        ))}
      </div>
      <section className="simple-panel" role="tabpanel" id="settings-panel" aria-labelledby={`settings-${tab}`}>
        {tab === "restaurant" && (
          <>
            <h2>{c.restaurant}</h2>
            <dl className="settings-facts">
              <div>
                <dt>{c.restaurant}</dt>
                <dd>{restaurant.selectedRestaurant?.name || "—"}</dd>
              </div>
              <div>
                <dt>{c.currency}</dt>
                <dd>{auth.session?.restaurant?.currency || "—"}</dd>
              </div>
              <div>
                <dt>{c.timezone}</dt>
                <dd>{auth.session?.restaurant?.timezone || "—"}</dd>
              </div>
            </dl>
            {owner && (
              <div className="settings-branch-card">
                <div>
                  <h2>{c.branches}</h2>
                  <p>{restaurant.selectedBranch?.name || c.restaurant}</p>
                </div>
                <Link to="/app/branches">
                  {c.manage} {c.branches} →
                </Link>
              </div>
            )}
          </>
        )}
        {["branches", "team", "integrations"].includes(tab) && (
          <>
            <h2>{c[tab]}</h2>
            {tab === "integrations" && <p>{c.connectionNote}</p>}
            <Link className="simple-primary" to={`/app/${tab}`}>
              {c.manage} {c[tab]} →
            </Link>
          </>
        )}
        {tab === "language" && <LanguageSwitcher />}
        {tab === "account" && (
          <>
            <h2>{auth.user?.name}</h2>
            <p>{auth.user?.email}</p>
            <p>{auth.user?.role}</p>
          </>
        )}
      </section>
    </section>
  );
}
