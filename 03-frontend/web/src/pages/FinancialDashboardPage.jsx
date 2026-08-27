import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BadgeDollarSign,
  Banknote,
  Calculator,
  ChartNoAxesCombined,
  CircleDollarSign,
  Percent,
  ReceiptText,
  RefreshCw,
  ShoppingBasket,
  UtensilsCrossed,
  UsersRound
} from "lucide-react";
import { FinancialTrendChart } from "../components/financial/FinancialTrendChart.jsx";
import { Badge } from "../components/ui/Badge.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card.jsx";
import { EmptyState } from "../components/ui/EmptyState.jsx";
import { ErrorState } from "../components/ui/ErrorState.jsx";
import { LoadingSkeleton } from "../components/ui/LoadingSkeleton.jsx";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useLocale } from "../contexts/LocaleContext.jsx";
import { useRestaurant } from "../contexts/RestaurantContext.jsx";
import { getFinancialDashboard, minorToMajor, ratioBps } from "../lib/financial.js";

const periodOptions = ["today", "yesterday", "week", "month", "quarter", "year"];
const costKeys = [
  ["foodCostsMinor", "food"],
  ["packagingCostsMinor", "packaging"],
  ["deliveryCommissionsMinor", "delivery"],
  ["laborCostsMinor", "labor"],
  ["rentCostsMinor", "rent"],
  ["utilitiesCostsMinor", "utilities"],
  ["marketingCostsMinor", "marketing"],
  ["miscellaneousOperatingExpensesMinor", "miscellaneous"]
];

function defaultScope(role) {
  if (role === "branch_manager") return "branch";
  if (role === "owner") return "organization";
  return "restaurant";
}

function scopeOptions(role) {
  if (role === "branch_manager") return ["branch"];
  if (role === "owner") return ["organization", "restaurant", "branch"];
  return ["restaurant", "branch"];
}

function errorType(error) {
  if (error?.status === 403) return "permission";
  if (!error?.status) return "network";
  return "generic";
}

function ChangeIndicator({ value, format, label, emptyLabel }) {
  if (value === null || value === undefined) {
    return <span className="financial-metric__change">{emptyLabel}</span>;
  }
  const variant = value > 0 ? "positive" : value < 0 ? "negative" : "neutral";
  const prefix = value > 0 ? "+" : "";
  return (
    <span className={`financial-metric__change financial-metric__change--${variant}`}>
      {prefix}
      {format(value)} {label}
    </span>
  );
}

function MetricCard({ icon: Icon, label, value, change, changeFormat, comparisonLabel, emptyLabel, hint }) {
  return (
    <Card className="financial-metric">
      <CardContent>
        <span className="financial-metric__icon" aria-hidden="true">
          <Icon size={19} />
        </span>
        <span className="financial-metric__label">{label}</span>
        <strong className="financial-metric__value">{value}</strong>
        {changeFormat ? (
          <ChangeIndicator value={change} format={changeFormat} label={comparisonLabel} emptyLabel={emptyLabel} />
        ) : (
          <span className="financial-metric__change">{hint}</span>
        )}
      </CardContent>
    </Card>
  );
}

function DashboardLoading({ label }) {
  return (
    <div className="financial-dashboard__loading" aria-label={label} role="status">
      <div className="financial-metrics-grid">
        {Array.from({ length: 8 }, (_, index) => (
          <LoadingSkeleton variant="card" key={index} />
        ))}
      </div>
      <div className="financial-dashboard__two-column">
        <LoadingSkeleton variant="card" />
        <LoadingSkeleton variant="card" />
      </div>
    </div>
  );
}

export function FinancialDashboardPage() {
  const auth = useAuth();
  const restaurant = useRestaurant();
  const { t, formatCurrency, formatNumber, formatPercent } = useLocale();
  const role = auth.user?.role || "viewer";
  const [scope, setScope] = useState(() => defaultScope(role));
  const [period, setPeriod] = useState("today");
  const [comparison, setComparison] = useState("previous_period");

  useEffect(() => {
    if (!scopeOptions(role).includes(scope)) setScope(defaultScope(role));
  }, [role, scope]);

  const filters = useMemo(
    () => ({
      scope,
      restaurantId: restaurant.selectedRestaurantId,
      branchId: restaurant.selectedBranchId,
      period,
      comparison
    }),
    [comparison, period, restaurant.selectedBranchId, restaurant.selectedRestaurantId, scope]
  );

  const dashboardQuery = useQuery({
    queryKey: ["financial-dashboard", filters],
    queryFn: () => getFinancialDashboard(filters),
    enabled: Boolean(restaurant.selectedRestaurantId) && (scope !== "branch" || Boolean(restaurant.selectedBranchId))
  });

  const dashboard = dashboardQuery.data;
  const currencyCode = dashboard?.currencyCode || auth.organization?.currency || "CNY";
  const money = (minor) => formatCurrency(minorToMajor(minor, currencyCode), { currency: currencyCode });
  const percentage = (bps) => formatPercent(bps === null ? null : bps / 10000);

  const comparisonOptions = [
    "previous_period",
    ...(["today", "yesterday"].includes(period) ? ["same_weekday"] : []),
    "previous_year",
    "none"
  ];

  function changePeriod(nextPeriod) {
    setPeriod(nextPeriod);
    if (comparison === "same_weekday" && !["today", "yesterday"].includes(nextPeriod)) {
      setComparison("previous_period");
    }
  }

  const controls = (
    <div className="financial-dashboard__controls" aria-label={t("financialDashboard.filters")}>
      <label>
        <span>{t("financialDashboard.scope")}</span>
        <select value={scope} onChange={(event) => setScope(event.target.value)}>
          {scopeOptions(role).map((option) => (
            <option key={option} value={option}>
              {t(`financialDashboard.scopes.${option}`)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>{t("financialDashboard.period")}</span>
        <select value={period} onChange={(event) => changePeriod(event.target.value)}>
          {periodOptions.map((option) => (
            <option key={option} value={option}>
              {t(`financialDashboard.periods.${option}`)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>{t("financialDashboard.comparison")}</span>
        <select value={comparison} onChange={(event) => setComparison(event.target.value)}>
          {comparisonOptions.map((option) => (
            <option key={option} value={option}>
              {t(`financialDashboard.comparisons.${option}`)}
            </option>
          ))}
        </select>
      </label>
      <Button
        variant="outline"
        size="small"
        leadingIcon={<RefreshCw size={16} />}
        loading={dashboardQuery.isFetching}
        onClick={() => dashboardQuery.refetch()}
      >
        {t("financialDashboard.refresh")}
      </Button>
    </div>
  );

  return (
    <section className="financial-dashboard" aria-labelledby="financial-dashboard-title">
      <header className="financial-dashboard__header">
        <div>
          <Badge variant="info">{t("financialDashboard.badge")}</Badge>
          <h1 id="financial-dashboard-title">{t("financialDashboard.title")}</h1>
          <p>{t("financialDashboard.description")}</p>
        </div>
        {dashboard && (
          <Badge variant={dashboard.summary.completeness.missingCategories.length ? "warning" : "success"}>
            {dashboard.summary.completeness.missingCategories.length
              ? t("financialDashboard.partialData")
              : t("financialDashboard.completeData")}
          </Badge>
        )}
      </header>

      {controls}

      {dashboardQuery.isLoading && <DashboardLoading label={t("financialDashboard.loading")} />}
      {dashboardQuery.isError && (
        <ErrorState type={errorType(dashboardQuery.error)} onRetry={() => dashboardQuery.refetch()} />
      )}
      {!dashboardQuery.isLoading && !dashboardQuery.isError && !dashboard && (
        <EmptyState
          title={t("financialDashboard.noScopeTitle")}
          description={t("financialDashboard.noScopeDescription")}
        />
      )}
      {dashboard && !dashboard.summary.completeness.hasData && (
        <EmptyState
          icon={<ReceiptText size={24} />}
          title={t("financialDashboard.emptyTitle")}
          description={t("financialDashboard.emptyDescription")}
        />
      )}

      {dashboard?.summary.completeness.hasData && (
        <DashboardContent
          dashboard={dashboard}
          money={money}
          percentage={percentage}
          formatNumber={formatNumber}
          formatCurrency={formatCurrency}
          t={t}
        />
      )}
    </section>
  );
}

function DashboardContent({ dashboard, money, percentage, formatNumber, formatCurrency, t }) {
  const { summary, comparison } = dashboard;
  const revenue = summary.revenue.revenueMinor;
  const foodCostBps = ratioBps(summary.costs.foodCostsMinor, revenue);
  const laborCostBps = ratioBps(summary.costs.laborCostsMinor, revenue);
  const comparisonLabel = t("financialDashboard.vsComparison");
  const currencyChange = (value) => money(value);
  const numberChange = (value) => formatNumber(value);
  const percentChange = (value) => percentage(value);
  const metrics = [
    {
      icon: CircleDollarSign,
      label: t("financialDashboard.metrics.revenue"),
      value: money(revenue),
      change: comparison?.changes.revenueMinor,
      changeFormat: currencyChange
    },
    {
      icon: Banknote,
      label: t("financialDashboard.metrics.netProfit"),
      value: money(summary.profit.netProfitMinor),
      change: comparison?.changes.netProfitMinor,
      changeFormat: currencyChange
    },
    {
      icon: Percent,
      label: t("financialDashboard.metrics.profitMargin"),
      value: percentage(summary.marginsBps.netMarginBps),
      change: comparison?.changes.netMarginBps,
      changeFormat: percentChange
    },
    {
      icon: UtensilsCrossed,
      label: t("financialDashboard.metrics.foodCost"),
      value: percentage(foodCostBps),
      hint: t("financialDashboard.ofRevenue")
    },
    {
      icon: UsersRound,
      label: t("financialDashboard.metrics.laborCost"),
      value: percentage(laborCostBps),
      hint: t("financialDashboard.ofRevenue")
    },
    {
      icon: Calculator,
      label: t("financialDashboard.metrics.aov"),
      value: money(summary.orders.averageOrderValueMinor),
      change: comparison?.changes.averageOrderValueMinor,
      changeFormat: currencyChange
    },
    {
      icon: ShoppingBasket,
      label: t("financialDashboard.metrics.orders"),
      value: formatNumber(summary.orders.orderCount),
      change: comparison?.changes.orderCount,
      changeFormat: numberChange
    },
    {
      icon: BadgeDollarSign,
      label: t("financialDashboard.metrics.totalCosts"),
      value: money(summary.costs.totalCostsMinor),
      hint: t("financialDashboard.recordedCosts")
    }
  ];

  return (
    <div className="financial-dashboard__content">
      <section className="financial-metrics-grid" aria-label={t("financialDashboard.keyMetrics")}>
        {metrics.map((metric) => (
          <MetricCard
            key={metric.label}
            {...metric}
            comparisonLabel={comparisonLabel}
            emptyLabel={t("financialDashboard.noComparison")}
          />
        ))}
      </section>

      <section className="financial-dashboard__two-column">
        <Card className="financial-dashboard__trend-card">
          <CardHeader status={<Badge>{t(`financialDashboard.granularities.${dashboard.trends.granularity}`)}</Badge>}>
            <CardTitle>{t("financialDashboard.trendTitle")}</CardTitle>
            <CardDescription>{t("financialDashboard.trendDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <FinancialTrendChart
              points={dashboard.trends.points}
              currencyCode={dashboard.currencyCode}
              formatCurrency={formatCurrency}
              labels={{
                title: t("financialDashboard.trendTitle"),
                description: t("financialDashboard.trendAccessibleDescription"),
                tableCaption: t("financialDashboard.trendTableCaption"),
                period: t("financialDashboard.period"),
                revenue: t("financialDashboard.metrics.revenue"),
                profit: t("financialDashboard.metrics.netProfit")
              }}
            />
          </CardContent>
        </Card>

        <CostBreakdownCard dashboard={dashboard} money={money} t={t} />
      </section>

      <section className="financial-dashboard__two-column financial-dashboard__two-column--bottom">
        <BranchRankingCard dashboard={dashboard} money={money} percentage={percentage} t={t} />
        <DataCoverageCard dashboard={dashboard} t={t} formatNumber={formatNumber} />
      </section>
    </div>
  );
}

function CostBreakdownCard({ dashboard, money, t }) {
  const costs = costKeys.map(([key, label]) => ({ key, label, value: dashboard.summary.costs[key] }));
  const maximum = Math.max(...costs.map((cost) => cost.value), 1);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("financialDashboard.costBreakdown")}</CardTitle>
        <CardDescription>{t("financialDashboard.costBreakdownDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="financial-costs">
        {costs.map((cost) => (
          <div className="financial-cost" key={cost.key}>
            <div>
              <span>{t(`financialDashboard.costs.${cost.label}`)}</span>
              <strong>{money(cost.value)}</strong>
            </div>
            <span className="financial-cost__track" aria-hidden="true">
              <i style={{ inlineSize: `${Math.max((cost.value / maximum) * 100, cost.value ? 2 : 0)}%` }} />
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function BranchRankingCard({ dashboard, money, percentage, t }) {
  const rows = dashboard.branchRanking.items;
  return (
    <Card>
      <CardHeader status={<Badge variant="neutral">{rows.length}</Badge>}>
        <CardTitle>{t("financialDashboard.branchRanking")}</CardTitle>
        <CardDescription>{t("financialDashboard.branchRankingDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="financial-table-wrap">
        {rows.length ? (
          <table className="financial-table">
            <thead>
              <tr>
                <th>{t("financialDashboard.rank")}</th>
                <th>{t("financialDashboard.branch")}</th>
                <th>{t("financialDashboard.metrics.revenue")}</th>
                <th>{t("financialDashboard.metrics.netProfit")}</th>
                <th>{t("financialDashboard.metrics.profitMargin")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.branchId}>
                  <td>{row.rank || "—"}</td>
                  <th>
                    <span>{row.branchName}</span>
                    <small>
                      {row.branchCode} · {row.city}
                    </small>
                  </th>
                  <td>{money(row.metrics.revenueMinor)}</td>
                  <td>{money(row.metrics.netProfitMinor)}</td>
                  <td>{percentage(row.metrics.netMarginBps)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="financial-dashboard__muted">{t("financialDashboard.noBranches")}</p>
        )}
        {dashboard.branchRanking.unallocatedCostsExcluded && (
          <p className="financial-dashboard__note">{t("financialDashboard.unallocatedNote")}</p>
        )}
      </CardContent>
    </Card>
  );
}

function DataCoverageCard({ dashboard, t, formatNumber }) {
  const completeness = dashboard.summary.completeness;
  const sourceCount = Object.values(dashboard.summary.lineage).flat().length;
  return (
    <Card>
      <CardHeader
        status={
          <Badge variant={completeness.missingCategories.length ? "warning" : "success"}>
            {completeness.entryCount}
          </Badge>
        }
      >
        <CardTitle>{t("financialDashboard.dataCoverage")}</CardTitle>
        <CardDescription>{t("financialDashboard.dataCoverageDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="financial-coverage">
        <div className="financial-coverage__summary">
          <ChartNoAxesCombined size={20} aria-hidden="true" />
          <div>
            <strong>{formatNumber(sourceCount)}</strong>
            <span>{t("financialDashboard.evidenceSources")}</span>
          </div>
          <div>
            <strong>{formatNumber(completeness.entryCount)}</strong>
            <span>{t("financialDashboard.ledgerEntries")}</span>
          </div>
        </div>
        <div>
          <h3>{t("financialDashboard.recordedInputs")}</h3>
          <div className="financial-coverage__tags">
            {completeness.presentCategories.map((category) => (
              <Badge variant="success" key={category}>
                {t(`financialDashboard.categories.${category}`)}
              </Badge>
            ))}
          </div>
        </div>
        {completeness.missingCategories.length > 0 && (
          <div>
            <h3>{t("financialDashboard.missingInputs")}</h3>
            <div className="financial-coverage__tags">
              {completeness.missingCategories.map((category) => (
                <Badge variant="warning" key={category}>
                  {t(`financialDashboard.categories.${category}`)}
                </Badge>
              ))}
            </div>
          </div>
        )}
        <p className="financial-dashboard__note">{t("financialDashboard.lineageNote")}</p>
      </CardContent>
    </Card>
  );
}
