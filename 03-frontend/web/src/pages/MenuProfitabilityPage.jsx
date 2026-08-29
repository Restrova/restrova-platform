import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, BadgeDollarSign, BarChart3, RefreshCw, ShoppingBasket, TrendingDown } from "lucide-react";
import { Badge } from "../components/ui/Badge.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Card, CardContent } from "../components/ui/Card.jsx";
import { EmptyState } from "../components/ui/EmptyState.jsx";
import { ErrorState } from "../components/ui/ErrorState.jsx";
import { LoadingSkeleton } from "../components/ui/LoadingSkeleton.jsx";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useLocale } from "../contexts/LocaleContext.jsx";
import { useRestaurant } from "../contexts/RestaurantContext.jsx";
import { minorToMajor } from "../lib/financial.js";
import { getMenuProfitability, rankMenuItems } from "../lib/menuProfitability.js";

const copy = {
  en: {
    title: "Menu profitability",
    description: "Find the items that create profit, volume, and risk from recorded evidence.",
    period: "Period",
    days7: "Last 7 days",
    days30: "Last 30 days",
    days90: "Last 90 days",
    refresh: "Refresh",
    most: "Most profitable",
    least: "Least profitable",
    revenue: "Highest revenue",
    volume: "Highest volume",
    table: "All classified items",
    dish: "Menu item",
    class: "Class",
    profit: "Contribution profit",
    margin: "Margin",
    sold: "Quantity sold",
    rising: "Rising costs",
    worst: "Worst margins",
    evidence: "Evidence",
    close: "Close details",
    empty: "No classifiable menu data",
    emptyHelp: "Import sales and effective costs for this period. Missing costs are excluded, never treated as zero.",
    excluded: "items excluded because evidence is incomplete",
    updated: "Last recorded sale",
    sources: "Recorded source lines",
    costs: "Historical cost records",
    noRise: "No evidenced cost increases in this period."
  },
  ar: {
    title: "ربحية القائمة",
    description: "اعرف العناصر التي تصنع الربح والحجم والمخاطر من بيانات مسجلة.",
    period: "الفترة",
    days7: "آخر 7 أيام",
    days30: "آخر 30 يومًا",
    days90: "آخر 90 يومًا",
    refresh: "تحديث",
    most: "الأكثر ربحًا",
    least: "الأقل ربحًا",
    revenue: "الأعلى إيرادًا",
    volume: "الأعلى مبيعًا",
    table: "كل العناصر المصنفة",
    dish: "عنصر القائمة",
    class: "التصنيف",
    profit: "ربح المساهمة",
    margin: "الهامش",
    sold: "الكمية المباعة",
    rising: "التكاليف الصاعدة",
    worst: "أسوأ الهوامش",
    evidence: "الأدلة",
    close: "إغلاق التفاصيل",
    empty: "لا توجد بيانات قائمة قابلة للتصنيف",
    emptyHelp: "استورد المبيعات والتكاليف الفعالة لهذه الفترة. التكلفة الناقصة تُستبعد ولا تُعامل كصفر.",
    excluded: "عناصر مستبعدة بسبب نقص الأدلة",
    updated: "آخر عملية بيع مسجلة",
    sources: "أسطر المصدر المسجلة",
    costs: "سجلات التكلفة التاريخية",
    noRise: "لا توجد زيادات تكلفة مثبتة في هذه الفترة."
  },
  "zh-CN": {
    title: "菜单盈利能力",
    description: "根据已记录证据识别带来利润、销量与风险的菜品。",
    period: "期间",
    days7: "最近7天",
    days30: "最近30天",
    days90: "最近90天",
    refresh: "刷新",
    most: "利润最高",
    least: "利润最低",
    revenue: "收入最高",
    volume: "销量最高",
    table: "全部已分类菜品",
    dish: "菜品",
    class: "分类",
    profit: "贡献利润",
    margin: "利润率",
    sold: "销量",
    rising: "成本上升",
    worst: "最低利润率",
    evidence: "证据",
    close: "关闭详情",
    empty: "没有可分类的菜单数据",
    emptyHelp: "请导入该期间的销售与有效成本。缺失成本会被排除，不会视为零。",
    excluded: "个菜品因证据不完整而排除",
    updated: "最后记录销售",
    sources: "已记录来源行",
    costs: "历史成本记录",
    noRise: "此期间没有可验证的成本上升。"
  }
};

function periodRange(days) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86400000);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function MenuProfitabilityPage() {
  const { locale, formatCurrency, formatNumber, formatPercent, formatDateTime } = useLocale();
  const restaurant = useRestaurant();
  const auth = useAuth();
  const text = copy[locale] || copy.en;
  const [days, setDays] = useState(30);
  const [selected, setSelected] = useState(null);
  const range = useMemo(() => periodRange(days), [days]);
  const filters = useMemo(
    () => ({ branchId: restaurant.selectedBranchId, ...range }),
    [range, restaurant.selectedBranchId]
  );
  const query = useQuery({
    queryKey: ["menu-profitability", filters],
    queryFn: () => getMenuProfitability(filters),
    enabled: Boolean(restaurant.selectedBranchId)
  });
  const data = query.data;
  const rankings = useMemo(() => rankMenuItems(data?.items || []), [data]);
  const currency = data?.scope.currencyCode || auth.organization?.currency || "CNY";
  const money = (value) => (value == null ? "—" : formatCurrency(minorToMajor(value, currency), { currency }));
  const percent = (value) => (value == null ? "—" : formatPercent(value / 10000));
  const highlights = [
    [text.most, rankings.mostProfitable, BadgeDollarSign, (item) => money(item.metrics.contributionProfitMinor)],
    [text.least, rankings.leastProfitable, TrendingDown, (item) => money(item.metrics.contributionProfitMinor)],
    [text.revenue, rankings.highestRevenue, BarChart3, (item) => money(item.metrics.itemRevenueMinor)],
    [text.volume, rankings.highestVolume, ShoppingBasket, (item) => formatNumber(item.metrics.quantitySold)]
  ];

  return (
    <section className="menu-profitability" aria-labelledby="menu-profitability-title">
      <header className="menu-profitability__header">
        <div>
          <Badge variant="info">4.4</Badge>
          <h1 id="menu-profitability-title">{text.title}</h1>
          <p>{text.description}</p>
        </div>
        <div className="menu-profitability__controls">
          <label>
            {text.period}
            <select value={days} onChange={(event) => setDays(Number(event.target.value))}>
              <option value="7">{text.days7}</option>
              <option value="30">{text.days30}</option>
              <option value="90">{text.days90}</option>
            </select>
          </label>
          <Button
            variant="outline"
            size="small"
            leadingIcon={<RefreshCw size={16} />}
            loading={query.isFetching}
            onClick={() => query.refetch()}
          >
            {text.refresh}
          </Button>
        </div>
      </header>
      {query.isLoading && (
        <div className="menu-profitability__loading" role="status">
          <LoadingSkeleton variant="card" />
          <LoadingSkeleton variant="card" />
          <LoadingSkeleton variant="card" />
        </div>
      )}
      {query.isError && (
        <ErrorState type={query.error?.status === 403 ? "permission" : "network"} onRetry={() => query.refetch()} />
      )}
      {data && !data.items.length && <EmptyState title={text.empty} description={text.emptyHelp} />}
      {data?.items.length > 0 && (
        <>
          <div className="menu-profitability__highlights">
            {highlights.map(([label, item, Icon, value]) => (
              <Card key={label}>
                <CardContent>
                  <Icon size={20} />
                  <span>{label}</span>
                  <strong>{item?.name || "—"}</strong>
                  <small>{item ? value(item) : "—"}</small>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="menu-profitability__layout">
            <Card>
              <CardContent>
                <h2>{text.table}</h2>
                <p>
                  {data.excluded.length} {text.excluded}
                </p>
                <div className="menu-profitability__table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>{text.dish}</th>
                        <th>{text.class}</th>
                        <th>{text.profit}</th>
                        <th>{text.margin}</th>
                        <th>{text.sold}</th>
                        <th>{text.evidence}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <strong>{item.name}</strong>
                            <small>{item.itemCode}</small>
                          </td>
                          <td>
                            <Badge
                              variant={
                                item.engineering.classification === "STAR"
                                  ? "success"
                                  : item.engineering.classification === "DOG"
                                    ? "warning"
                                    : "neutral"
                              }
                            >
                              {item.engineering.classification}
                            </Badge>
                          </td>
                          <td>{money(item.metrics.contributionProfitMinor)}</td>
                          <td>{percent(item.metrics.contributionMarginBps)}</td>
                          <td>{formatNumber(item.metrics.quantitySold)}</td>
                          <td>
                            <button className="menu-profitability__detail-button" onClick={() => setSelected(item)}>
                              {text.evidence}
                              <ArrowUpRight size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <h2>{text.rising}</h2>
                {rankings.risingCosts.length ? (
                  <ul className="menu-profitability__rising">
                    {rankings.risingCosts.map((item) => (
                      <li key={item.id}>
                        <span>{item.name}</span>
                        <strong>+{money(item.costChangeMinor)}</strong>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>{text.noRise}</p>
                )}
                <h2>{text.worst}</h2>
                <ol className="menu-profitability__rising">
                  {rankings.worstMargins.slice(0, 3).map((item) => (
                    <li key={item.id}>
                      <span>{item.name}</span>
                      <strong>{percent(item.metrics.contributionMarginBps)}</strong>
                    </li>
                  ))}
                </ol>
                <h2>{text.updated}</h2>
                <p>
                  {formatDateTime(
                    Math.max(...data.items.map((item) => Date.parse(item.lineage.sales?.lastSaleAt || 0)))
                  )}
                </p>
              </CardContent>
            </Card>
          </div>
        </>
      )}
      {selected && (
        <aside
          className="menu-profitability__evidence"
          role="dialog"
          aria-modal="true"
          aria-label={`${text.evidence}: ${selected.name}`}
        >
          <button onClick={() => setSelected(null)}>{text.close}</button>
          <h2>{selected.name}</h2>
          <p>
            {text.sources}: {selected.lineage.sales?.lineCount || 0}
          </p>
          <p>
            {text.costs}: {selected.lineage.costs.length}
          </p>
          <ul>
            {selected.lineage.sales?.references.map((ref) => (
              <li key={ref.sourceId}>
                {ref.externalOrderId} / {ref.externalLineId}
              </li>
            ))}
          </ul>
        </aside>
      )}
    </section>
  );
}
