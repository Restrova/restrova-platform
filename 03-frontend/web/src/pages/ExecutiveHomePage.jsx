import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useRestaurant } from "../contexts/RestaurantContext.jsx";
import { useLocale } from "../contexts/LocaleContext.jsx";
import { api } from "../lib/api.js";
import { Button } from "../components/ui/Button.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card.jsx";
import { ErrorState } from "../components/ui/ErrorState.jsx";
import { CopilotAnswer } from "./CopilotAnswer.jsx";
import { ReportDetails } from "./CopilotPage.jsx";
import { copilotUiCopy } from "./copilotUiCopy.js";
import { ownerCopy } from "./ownerCopy.js";

export function ExecutiveHomePage() {
  const auth = useAuth(),
    restaurant = useRestaurant(),
    { locale, t } = useLocale();
  const c = ownerCopy[locale] || ownerCopy.en,
    language = locale === "zh-CN" ? "zh" : locale;
  const [selection, setSelection] = useState("restaurant");
  const scope = auth.user?.role === "branch_manager" ? "branch" : selection;
  const filters = {
    cadence: "daily",
    language,
    scope,
    ...(scope === "branch" ? { branchId: restaurant.selectedBranchId } : {})
  };
  const query = useQuery({
    queryKey: ["owner-home", auth.user?.id, auth.organization?.id, restaurant.selectedRestaurantId, filters],
    queryFn: ({ signal }) => api(`/reports/executive?${new URLSearchParams(filters)}`, { signal }),
    enabled: Boolean(restaurant.selectedRestaurantId) && (scope !== "branch" || Boolean(restaurant.selectedBranchId)),
    retry: false
  });
  return (
    <section className="owner-home intelligence-page">
      <header>
        <h1>{c.title}</h1>
        <p>{c.intro}</p>
      </header>
      <nav className="owner-shortcuts" aria-label={t("navigation.mainNavigation")}>
        {[
          ["today", c.today],
          ["profit", c.profit],
          ["menu-profitability", t("navigation.menuProfitability")],
          ["sales-comparison", t("navigation.salesComparison")],
          ["alerts", t("navigation.alerts")],
          ["assistant", t("navigation.assistant")]
        ].map(([path, label]) => (
          <Link key={path} to={`/app/${path}`}>
            {label}
          </Link>
        ))}
      </nav>
      <div className="intelligence-toolbar">
        <label>
          {t("financialDashboard.scope")}
          <select
            value={scope}
            disabled={auth.user?.role === "branch_manager"}
            onChange={(e) => setSelection(e.target.value)}
          >
            {["restaurant", "branch"].map((value) => (
              <option key={value} value={value}>
                {t(`financialDashboard.scopes.${value}`)}
              </option>
            ))}
          </select>
        </label>
        <Button loading={query.isFetching} onClick={() => query.refetch()}>
          {t("financialDashboard.refresh")}
        </Button>
      </div>
      <p>{c.recorded}</p>
      {query.isLoading && <p role="status">{t("financialDashboard.loading")}</p>}
      {query.isError && (
        <ErrorState type={query.error?.status === 403 ? "permission" : "network"} onRetry={() => query.refetch()} />
      )}
      {query.data && <ExecutiveHomeContent report={query.data} locale={locale} />}
    </section>
  );
}

export function ExecutiveHomeContent({ report, locale }) {
  const c = ownerCopy[locale] || ownerCopy.en,
    language = locale === "zh-CN" ? "zh" : locale,
    copy = copilotUiCopy[language] || copilotUiCopy.en;
  const groups = [
    ["health", ["revenue", "profit", "margin", "orders"]],
    ["changed", ["change", "profitChange", "foodChange", "costChange"]]
  ];
  return (
    <>
      <p>
        {copy.period}:{" "}
        <bdi>
          {report.period.fromDate} — {report.period.toDate}
        </bdi>{" "}
        · {copy.revision}: <bdi>{report.dataRevision.revision}</bdi>
      </p>
      <div className="owner-question-grid">
        {groups.map(([key, keys]) => (
          <Card key={key}>
            <CardHeader>
              <CardTitle>{c[key]}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="owner-facts">
                {report.claims
                  .filter((claim) => keys.includes(claim.key))
                  .map((claim) => (
                    <div key={claim.key}>
                      <dt>{claim.label}</dt>
                      <dd>{claim.status === "supported" ? claim.text.slice(claim.label.length + 2) : c.unknown}</dd>
                    </div>
                  ))}
              </dl>
              <a href="#owner-evidence">{c.evidence}</a>
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader>
            <CardTitle>{c.why}</CardTitle>
          </CardHeader>
          <CardContent>
            {report.executiveSummary?.length ? (
              report.executiveSummary.map((item, index) => <p key={index}>{item.text}</p>)
            ) : (
              <p>{c.missing}</p>
            )}
            <a href="#owner-evidence">{c.evidence}</a>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{c.next}</CardTitle>
          </CardHeader>
          <CardContent>
            <ReportDetails report={{ ...report, trend: [] }} copy={copy} language={language} />
          </CardContent>
        </Card>
      </div>
      <section id="owner-evidence" tabIndex={-1}>
        <h2>{c.evidence}</h2>
        <CopilotAnswer answer={report} copy={copy} />
      </section>
    </>
  );
}
