import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../components/ui/Button.jsx";
import { Card, CardContent } from "../components/ui/Card.jsx";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useLocale } from "../contexts/LocaleContext.jsx";
import { useRestaurant } from "../contexts/RestaurantContext.jsx";
import { api } from "../lib/api.js";
import { minorToMajor } from "../lib/financial.js";
import { intelligenceCopy } from "./intelligenceCopy.js";
export function ForecastPage() {
  const auth = useAuth(),
    context = useRestaurant(),
    { locale: uiLocale, formatCurrency, formatNumber } = useLocale(),
    locale = uiLocale === "zh-CN" ? "zh" : uiLocale,
    copy = intelligenceCopy[locale] || intelligenceCopy.en;
  const [horizon, setHorizon] = useState(7),
    [historyDays, setHistoryDays] = useState(57),
    [chosenScope, setScope] = useState("restaurant");
  const scope = auth.user?.role === "branch_manager" ? "branch" : chosenScope;
  const filters = {
    scope,
    horizon,
    historyDays,
    language: locale,
    ...(scope === "branch"
      ? { branchId: context.selectedBranchId }
      : scope === "restaurant"
        ? { restaurantId: context.selectedRestaurantId }
        : {})
  };
  const query = useQuery({
    queryKey: [
      "forecast",
      auth.user?.id,
      auth.organization?.id,
      context.selectedRestaurantId,
      context.selectedBranchId,
      filters
    ],
    queryFn: ({ signal }) => api(`/forecasts?${new URLSearchParams(filters)}`, { signal }),
    retry: false,
    enabled: scope !== "branch" || Boolean(context.selectedBranchId)
  });
  const money = (value) =>
    value == null
      ? copy.noData
      : formatCurrency(minorToMajor(value, query.data?.currencyCode || "SAR"), {
          currency: query.data?.currencyCode || "SAR"
        });
  const metrics = [
    ["grossSalesMinor", "gross"],
    ["revenueMinor", "revenue"],
    ["foodCostsMinor", "food"],
    ["packagingMinor", "packaging"],
    ["commissionsMinor", "commissions"],
    ["operatingCostsMinor", "operating"],
    ["grossProfitMinor", "grossProfit"],
    ["contributionProfitMinor", "contribution"],
    ["netProfitMinor", "netProfit"]
  ];
  return (
    <section className="intelligence-page" dir={locale === "ar" ? "rtl" : "ltr"}>
      <header>
        <h1>{copy.forecast}</h1>
        <p>{copy.assumption}</p>
      </header>
      <div className="intelligence-toolbar">
        <label>
          {copy.scope}
          <select
            value={scope}
            disabled={auth.user?.role === "branch_manager"}
            onChange={(e) => setScope(e.target.value)}
          >
            {(auth.user?.role === "owner" ? ["restaurant", "branch", "organization"] : ["restaurant", "branch"]).map(
              (key) => (
                <option key={key} value={key}>
                  {copy[key]}
                </option>
              )
            )}
          </select>
        </label>
        <label>
          {copy.horizon}
          <select value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>
            {[
              [1, "tomorrow"],
              [7, "seven"],
              [30, "thirty"]
            ].map(([n, label]) => (
              <option value={n} key={n}>
                {copy[label]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {copy.historyDays}
          <select value={historyDays} onChange={(e) => setHistoryDays(Number(e.target.value))}>
            {[29, 57, 85, 169, 365].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>
      {query.isPending ? (
        <p role="status">{copy.loading}</p>
      ) : query.isError ? (
        <div role="alert">
          {copy.error}
          <Button onClick={() => query.refetch()}>{copy.retry}</Button>
        </div>
      ) : (
        <>
          <p>
            <bdi>
              {query.data.history.fromDate} — {query.data.history.toDate}
            </bdi>
          </p>
          <div className="intelligence-metrics">
            {metrics.map(([key, label]) => (
              <Card key={key}>
                <CardContent>
                  <span>{copy[label]}</span>
                  <strong>{money(query.data.totals[key])}</strong>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="operations-table-scroll" role="region" aria-label={copy.forecast} tabIndex={0}>
            <table className="operations-table">
              <thead>
                <tr>
                  <th>{copy.date}</th>
                  <th>{copy.revenue}</th>
                  <th>{copy.orders}</th>
                  <th>{copy.netProfit}</th>
                </tr>
              </thead>
              <tbody>
                {query.data.daily.map((day) => (
                  <tr key={day.date}>
                    <th>
                      <bdi>{day.date}</bdi>
                    </th>
                    <td>{money(day.revenueMinor)}</td>
                    <td>{day.orderCount == null ? copy.noData : formatNumber(day.orderCount)}</td>
                    <td>{money(day.netProfitMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {query.data.branches.map((branch) => (
            <Card key={branch.branchId}>
              <CardContent>
                <h2>{branch.branchName}</h2>
                <p>
                  {copy.revenue}: {money(branch.totals.revenueMinor)} · {copy.netProfit}:{" "}
                  {money(branch.totals.netProfitMinor)}
                </p>
                <details>
                  <summary>{copy.evidence}</summary>
                  <p>
                    {copy.historyDays}: {branch.evidence.history.filter((day) => day.observed).length}/
                    {branch.evidence.history.length}
                  </p>
                  <p>{copy.sources}</p>
                  <ul>
                    {branch.evidence.history.map((day) => (
                      <li key={day.date}>
                        <bdi>{day.date}</bdi> · {day.observed ? money(day.revenueMinor) : copy.insufficient} ·{" "}
                        {day.salesLineage.length} / {day.ledgerLineage.length}
                        <details>
                          <summary>{copy.sources}</summary>
                          <ul>
                            {day.salesLineage.slice(0, 20).map((line) => (
                              <li key={line.salesLineId}>
                                <bdi>
                                  {line.orderId} · {line.lineId}
                                </bdi>
                              </li>
                            ))}
                            {day.ledgerLineage.slice(0, 20).map((line) => (
                              <li key={line.ledgerEntryId}>
                                <bdi>{line.sourceReference}</bdi>
                              </li>
                            ))}
                          </ul>
                        </details>
                      </li>
                    ))}
                  </ul>
                </details>
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </section>
  );
}
