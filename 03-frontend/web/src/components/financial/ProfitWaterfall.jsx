import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../ui/Card.jsx";
import { ownerCopy } from "../../pages/ownerCopy.js";
export const costCategories = [
  ["foodCostsMinor", "food_costs"],
  ["packagingCostsMinor", "packaging"],
  ["deliveryCommissionsMinor", "delivery_commissions"],
  ["laborCostsMinor", "labor"],
  ["rentCostsMinor", "rent"],
  ["utilitiesCostsMinor", "utilities"],
  ["marketingCostsMinor", "marketing"],
  ["miscellaneousOperatingExpensesMinor", "miscellaneous_operating_expenses"]
];
export const profitComplete = (completeness) =>
  Boolean(completeness?.hasData && completeness.missingCategories?.length === 0);
export function waterfallRows(summary) {
  const present = summary.completeness.presentCategories;
  const rows = [
    ["sales", summary.revenue.grossSalesMinor],
    ["discounts", -summary.revenue.discountsMinor],
    ["refunds", -summary.revenue.refundsMinor],
    ...costCategories.map(([key, category]) => [category, -summary.costs[key]])
  ];
  let balance = 0;
  return rows.map(([key, amount]) => {
    const value = present.includes(key) && Number.isSafeInteger(amount) ? amount : null;
    const start = balance;
    balance = balance !== null && value !== null && Number.isSafeInteger(balance + value) ? balance + value : null;
    return { key, value, start, end: balance };
  });
}
export function ProfitWaterfall({ summary, money, t, locale }) {
  const c = ownerCopy[locale] || ownerCopy.en,
    rows = waterfallRows(summary);
  const complete = profitComplete(summary.completeness) && rows.at(-1).end === summary.profit.netProfitMinor;
  const low = Math.min(0, ...rows.flatMap((r) => [r.start ?? 0, r.end ?? 0]));
  const high = Math.max(0, ...rows.flatMap((r) => [r.start ?? 0, r.end ?? 0]));
  const span = high - low || 1;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{c.waterfall}</CardTitle>
        <CardDescription>{c.waterfallHint}</CardDescription>
      </CardHeader>
      <CardContent>
        {!complete && <p role="status">{c.missing}</p>}
        <div className="waterfall-table" role="region" aria-label={c.waterfall} tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th>{t("financialDashboard.costBreakdown")}</th>
                <th>{t("financialDashboard.metrics.revenue")}</th>
                <th>{c.total}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <th scope="row">{t(`financialDashboard.categories.${row.key}`)}</th>
                  <td>
                    <bdi>{row.value === null ? c.unknown : money(row.value)}</bdi>
                  </td>
                  <td>
                    {complete ? (
                      <>
                        <span className="waterfall-track" aria-hidden="true">
                          <i
                            style={{
                              insetInlineStart: `${((Math.min(row.start, row.end) - low) / span) * 100}%`,
                              inlineSize: `${(Math.abs(row.end - row.start) / span) * 100}%`
                            }}
                          />
                        </span>
                        <bdi>{money(row.end)}</bdi>
                      </>
                    ) : (
                      c.unknown
                    )}
                  </td>
                </tr>
              ))}
              <tr>
                <th scope="row">{t("financialDashboard.metrics.netProfit")}</th>
                <td colSpan={2}>
                  <strong>
                    <bdi>{complete ? money(summary.profit.netProfitMinor) : c.unknown}</bdi>
                  </strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
