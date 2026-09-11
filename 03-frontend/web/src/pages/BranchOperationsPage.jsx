import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Store, TrendingUp, ReceiptText, CircleDollarSign } from "lucide-react";
import { Button } from "../components/ui/Button.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card.jsx";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useLocale } from "../contexts/LocaleContext.jsx";
import { useRestaurant } from "../contexts/RestaurantContext.jsx";
import { getBranchOperations } from "../lib/operations.js";
import { minorToMajor } from "../lib/financial.js";
import { operationsCopy } from "./operationsCopy.js";

function Evidence({ lines = [], label }) {
  const [limit, setLimit] = useState(20);
  return (
    <details className="operations-evidence">
      <summary>
        {label} ({lines.length})
      </summary>
      <ul>
        {lines.slice(0, limit).map((line, index) => (
          <li key={index}>
            <bdi>
              {line.orderId ?? line.sourceReference} {line.lineId ? `· ${line.lineId}` : ""}
            </bdi>
          </li>
        ))}
      </ul>
      {limit < lines.length && (
        <button type="button" onClick={() => setLimit(limit + 50)}>
          + {Math.min(50, lines.length - limit)} / {lines.length}
        </button>
      )}
    </details>
  );
}

function Metric({ icon: Icon, label, value }) {
  return (
    <Card className="operations-metric">
      <CardContent>
        <Icon size={20} aria-hidden="true" />
        <span>{label}</span>
        <strong>{value}</strong>
      </CardContent>
    </Card>
  );
}

function SalesTable({ title, rows, name, copy, money, number, channel = false }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="operations-table-scroll" tabIndex={0} role="region" aria-label={title}>
          <table className="operations-table">
            <thead>
              <tr>
                <th scope="col">{channel ? copy.channel : title}</th>
                <th scope="col">{copy.revenue}</th>
                <th scope="col">{copy.orders}</th>
                {channel && (
                  <>
                    <th scope="col">{copy.discounts}</th>
                    <th scope="col">{copy.refunds}</th>
                    <th scope="col">{copy.commission}</th>
                    <th scope="col">{copy.afterCommission}</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <th scope="row">{name(row.key)}</th>
                  <td>{money(row.revenueMinor)}</td>
                  <td>{number(row.orderCount)}</td>
                  {channel && (
                    <>
                      <td>{money(row.discountsMinor)}</td>
                      <td>{money(row.refundsMinor)}</td>
                      <td>{money(row.commissionMinor)}</td>
                      <td>{money(row.revenueAfterCommissionMinor)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export function BranchOperationsPage() {
  const auth = useAuth();
  const context = useRestaurant();
  const { locale, t, formatCurrency, formatPercent, formatNumber, formatDate } = useLocale();
  const copy = operationsCopy[locale] || operationsCopy.en;
  const [chosenScope, setScope] = useState("restaurant");
  const [period, setPeriod] = useState("month");
  const [comparison, setComparison] = useState("previous_period");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [tab, setTab] = useState("overview");
  const role = auth.user?.role;
  const scope =
    role === "branch_manager"
      ? "branch"
      : chosenScope === "organization" && role !== "owner"
        ? "restaurant"
        : chosenScope;
  const dateValid = period !== "custom" || Boolean(fromDate && toDate && fromDate <= toDate);
  const filters = {
    scope,
    period,
    comparison,
    ...(scope === "restaurant" ? { restaurantId: context.selectedRestaurantId } : {}),
    ...(scope === "branch" ? { branchId: context.selectedBranchId } : {}),
    ...(period === "custom" ? { fromDate, toDate } : {})
  };
  const query = useQuery({
    queryKey: [
      "branch-operations",
      auth.user?.id,
      auth.organization?.id,
      context.selectedRestaurantId,
      context.selectedBranchId,
      filters
    ],
    queryFn: ({ signal }) => getBranchOperations(filters, signal),
    enabled: Boolean(auth.user?.id && dateValid && (scope !== "branch" || context.selectedBranchId)),
    retry: false
  });
  const data = dateValid ? query.data : null;
  const currency = data?.currencyCode || auth.organization?.currency || "SAR";
  const money = (value) =>
    value == null ? copy.unavailable : formatCurrency(minorToMajor(value, currency), { currency });
  const percent = (value) => (value == null ? copy.unavailable : formatPercent(value / 10000));
  const date = (value) => formatDate(value, { timeZone: data?.timezone || auth.organization?.timezone || "UTC" });
  const weekdayName = (key) =>
    new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 7, 2 + key)));
  const scopes =
    role === "branch_manager"
      ? ["branch"]
      : role === "owner"
        ? ["restaurant", "branch", "organization"]
        : ["restaurant", "branch"];
  const salesTableProps = { copy, money, number: formatNumber };

  return (
    <section className="operations-page" aria-labelledby="operations-title">
      <header className="operations-header">
        <div>
          <h1 id="operations-title">{copy.title}</h1>
          <p>{copy.description}</p>
        </div>
        <Button
          variant="outline"
          onClick={() => query.refetch()}
          disabled={!dateValid}
          loading={query.isFetching}
          leadingIcon={<RefreshCw size={16} />}
        >
          {t("financialDashboard.refresh")}
        </Button>
      </header>
      <div className="operations-filters">
        <label>
          {t("financialDashboard.scope")}
          <select value={scope} onChange={(event) => setScope(event.target.value)}>
            {scopes.map((key) => (
              <option key={key} value={key}>
                {t(`financialDashboard.scopes.${key}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("financialDashboard.period")}
          <select value={period} onChange={(event) => setPeriod(event.target.value)}>
            {["today", "yesterday", "week", "month", "quarter", "year", "custom"].map((key) => (
              <option key={key} value={key}>
                {key === "custom" ? copy.custom : t(`financialDashboard.periods.${key}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("financialDashboard.comparison")}
          <select value={comparison} onChange={(event) => setComparison(event.target.value)}>
            {["previous_period", "previous_year", "none"].map((key) => (
              <option key={key} value={key}>
                {t(`financialDashboard.comparisons.${key}`)}
              </option>
            ))}
          </select>
        </label>
        {period === "custom" && (
          <>
            <label>
              {copy.from}
              <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
            </label>
            <label>
              {copy.to}
              <input type="date" value={toDate} min={fromDate} onChange={(event) => setToDate(event.target.value)} />
            </label>
          </>
        )}
      </div>
      {!dateValid && <p role="status">{copy.dateError}</p>}
      {dateValid && query.isPending && <p role="status">{copy.loading}</p>}
      {query.isError && (
        <div className="operations-notice" role="alert">
          <p>{copy.error}</p>
          <Button onClick={() => query.refetch()}>{copy.retry}</Button>
        </div>
      )}
      {data && (
        <>
          <p className="operations-period">
            <span>
              {copy.current}:{" "}
              <bdi>
                {date(data.period.current.from)} — {date(data.period.current.to)}
              </bdi>
            </span>
            {data.period.comparison && (
              <span>
                {copy.previous}:{" "}
                <bdi>
                  {date(data.period.comparison.from)} — {date(data.period.comparison.to)}
                </bdi>
              </span>
            )}
            <bdi>
              {data.timezone} · {currency}
            </bdi>
          </p>
          <div className="operations-metrics">
            <Metric
              icon={CircleDollarSign}
              label={copy.importedRevenue}
              value={
                data.timeAnalysis.totals.lineCount ? money(data.timeAnalysis.totals.revenueMinor) : copy.unavailable
              }
            />
            <Metric icon={ReceiptText} label={copy.orders} value={formatNumber(data.timeAnalysis.totals.orderCount)} />
            <Metric
              icon={Store}
              label={copy.comparable}
              value={`${formatNumber(data.sameStore.eligible.length)} / ${formatNumber(data.scorecards.length)}`}
            />
            <Metric icon={TrendingUp} label={copy.growth} value={percent(data.sameStore.revenueChange?.changeBps)} />
          </div>
          <nav className="operations-tabs" aria-label={copy.title}>
            {["overview", "time", "channels"].map((key) => (
              <button type="button" key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>
                {copy[key]}
              </button>
            ))}
          </nav>
          {!data.timeAnalysis.totals.lineCount && <p className="operations-notice">{copy.noData}</p>}
          {tab === "overview" && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>{copy.sameStore}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p>{copy.comparisonHelp}</p>
                  <p>
                    <strong>{formatNumber(data.sameStore.alignment.current.length)}</strong> {copy.matched}
                  </p>
                  {!data.sameStore.eligible.length ? (
                    <p className="operations-notice">{copy.noComparable}</p>
                  ) : (
                    <div className="operations-table-scroll" tabIndex={0} role="region" aria-label={copy.sameStore}>
                      <table className="operations-table">
                        <thead>
                          <tr>
                            <th scope="col">{copy.branch}</th>
                            <th scope="col">{copy.current}</th>
                            <th scope="col">{copy.previous}</th>
                            <th scope="col">{copy.change}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.sameStore.eligible.map((branch) => (
                            <tr key={branch.branchId}>
                              <th scope="row">
                                {branch.branchName}
                                <Evidence
                                  lines={branch.current.lineage.concat(branch.comparison.lineage)}
                                  label={copy.evidence}
                                />
                              </th>
                              <td>{money(branch.current.revenueMinor)}</td>
                              <td>{money(branch.comparison.revenueMinor)}</td>
                              <td>
                                {money(branch.revenueChange.change)}
                                <small>{percent(branch.revenueChange.changeBps)}</small>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <details>
                    <summary>{copy.dates}</summary>
                    <div className="operations-date-lists">
                      <p>
                        {copy.current}: <bdi>{data.sameStore.alignment.current.join(", ")}</bdi>
                      </p>
                      <p>
                        {copy.previous}: <bdi>{data.sameStore.alignment.comparison.join(", ")}</bdi>
                      </p>
                    </div>
                  </details>
                  {!!data.sameStore.excluded.length && (
                    <details>
                      <summary>
                        {copy.excluded} ({data.sameStore.excluded.length})
                      </summary>
                      <ul>
                        {data.sameStore.excluded.map((branch) => (
                          <li key={branch.branchId}>
                            <strong>{branch.branchName}</strong>:{" "}
                            {branch.reasons.map((reason) => copy.reasons[reason] || reason).join(" · ")}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>{copy.scorecards}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p>{copy.scorecardHelp}</p>
                  <div className="operations-table-scroll" tabIndex={0} role="region" aria-label={copy.scorecards}>
                    <table className="operations-table">
                      <thead>
                        <tr>
                          <th scope="col">{copy.branch}</th>
                          <th scope="col">{copy.revenue}</th>
                          <th scope="col">{copy.costs}</th>
                          <th scope="col">{copy.profit}</th>
                          <th scope="col">{copy.margin}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.scorecards.map((branch) => (
                          <tr key={branch.branchId}>
                            <th scope="row">
                              {branch.branchName}
                              <small>{branch.branchCode}</small>
                              <Evidence label={copy.evidence} lines={Object.values(branch.lineage.current).flat()} />
                            </th>
                            {["revenueMinor", "totalCostsMinor", "netProfitMinor"].map((key) => (
                              <td key={key}>
                                {money(branch.current[key])}
                                {branch.fullPeriodComparable && branch.deltas[key] && (
                                  <small>
                                    {copy.change}: {money(branch.deltas[key].change)}
                                  </small>
                                )}
                              </td>
                            ))}
                            <td>{percent(branch.current.netMarginBps)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
              <section aria-label={copy.opportunities}>
                <h2>{copy.opportunities}</h2>
                <div className="operations-opportunities">
                  {data.opportunities.length ? (
                    data.opportunities.map((opportunity) => (
                      <Card key={opportunity.id}>
                        <CardContent>
                          <small>{opportunity.branchName}</small>
                          <h3>{copy.types[opportunity.type]?.[0]}</h3>
                          <p>{copy.types[opportunity.type]?.[1]}</p>
                          <p>
                            {copy.current}:{" "}
                            {opportunity.type === "falling_sales"
                              ? money(opportunity.values.current)
                              : percent(opportunity.values.current)}{" "}
                            · {copy.previous}:{" "}
                            {opportunity.type === "falling_sales"
                              ? money(opportunity.values.previous)
                              : percent(opportunity.values.previous ?? opportunity.values.peerGrowth)}
                          </p>
                          <Evidence
                            label={copy.evidence}
                            lines={opportunity.evidence.current.lineage.concat(opportunity.evidence.comparison.lineage)}
                          />
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <p>{copy.noOpportunities}</p>
                  )}
                </div>
              </section>
            </>
          )}
          {tab === "time" && (
            <>
              <p>{copy.timeHelp}</p>
              <div className="operations-columns">
                <SalesTable
                  {...salesTableProps}
                  title={copy.weekdays}
                  rows={data.timeAnalysis.weekdays}
                  name={weekdayName}
                />
                <SalesTable
                  {...salesTableProps}
                  title={copy.dayparts}
                  rows={data.timeAnalysis.dayparts}
                  name={(key) => copy.daypartNames[key]}
                />
              </div>
              <SalesTable
                {...salesTableProps}
                title={copy.hours}
                rows={data.timeAnalysis.hours}
                name={(key) => `${String(key).padStart(2, "0")}:00`}
              />
            </>
          )}
          {tab === "channels" && (
            <>
              <p>{copy.channelHelp}</p>
              <SalesTable
                {...salesTableProps}
                channel
                title={copy.channels}
                rows={data.channels.groups}
                name={(key) => copy.channelNames[key]}
              />
              {!!data.channels.aggregators.length && (
                <SalesTable
                  {...salesTableProps}
                  channel
                  title={copy.platforms}
                  rows={data.channels.aggregators}
                  name={(key) => key}
                />
              )}
            </>
          )}
          <p className="operations-footnote">{copy.sourceHelp}</p>
        </>
      )}
    </section>
  );
}
