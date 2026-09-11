import { useLocale } from "../contexts/LocaleContext.jsx";
import { minorToMajor } from "../lib/financial.js";
const labels = {
  ar: {
    high: "ثقة عالية",
    medium: "ثقة متوسطة",
    low: "ثقة محدودة",
    revenue: "الإيراد المسجل",
    contribution: "هامش المساهمة",
    quantity: "الكمية",
    previous: "التكلفة السابقة للوحدة",
    current: "التكلفة الحالية للوحدة",
    increase: "زيادة تكلفة الوحدة",
    supplier: "المورد",
    demand: "تغيّر الطلب المفترض",
    projected: "المساهمة المتوقعة",
    change: "تغيّر المساهمة",
    before: "قبل التنفيذ",
    after: "بعد التنفيذ",
    observed: "تغيّر الإيراد المسجل",
    high_popularity_high_margin: "الصنف يحقق شعبية وهامشًا أعلى من حدود المقارنة.",
    high_popularity_below_portfolio_margin: "الصنف مطلوب، لكن هامشه أقل من حد مقارنة القائمة.",
    low_popularity_high_margin: "هامش الصنف جيد، لكن شعبيته أقل من حد المقارنة.",
    low_popularity_below_portfolio_margin: "شعبية الصنف وهامشه أقل من حدود المقارنة.",
    supplier_cost_increase: "ارتفعت تكلفة الوحدة لدى المورد نفسه حسب السجلات.",
    recorded_cost_increase: "ارتفعت تكلفة الوحدة المسجلة؛ نسبة الزيادة لمورد محدد غير مؤكدة.",
    falling_sales: "انخفضت مبيعات الفرع في الفترات القابلة للمقارنة.",
    high_refunds: "نسبة الاسترداد تجاوزت الحد المحدد.",
    abnormal_discounts: "زادت نسبة الخصومات عن حد المقارنة.",
    rising_costs: "ارتفعت نسبة التكاليف المسجلة.",
    underperformance: "نمو الفرع أقل من مجموعة الفروع القابلة للمقارنة."
  },
  en: {
    high: "High confidence",
    medium: "Medium confidence",
    low: "Limited confidence",
    revenue: "Recorded revenue",
    contribution: "Contribution",
    quantity: "Quantity",
    previous: "Previous unit cost",
    current: "Current unit cost",
    increase: "Unit cost increase",
    supplier: "Supplier",
    demand: "Assumed demand change",
    projected: "Projected contribution",
    change: "Contribution change",
    before: "Before action",
    after: "After action",
    observed: "Observed revenue change",
    high_popularity_high_margin: "Popularity and margin exceed the portfolio thresholds.",
    high_popularity_below_portfolio_margin: "The item is popular but its margin is below the portfolio threshold.",
    low_popularity_high_margin: "Margin is above the threshold but popularity is low.",
    low_popularity_below_portfolio_margin: "Popularity and margin are below portfolio thresholds.",
    supplier_cost_increase: "Recorded unit cost increased for the same supplier.",
    recorded_cost_increase: "Recorded unit cost increased; supplier attribution is unverified.",
    falling_sales: "Branch sales declined in comparable periods.",
    high_refunds: "The recorded refund rate exceeds the threshold.",
    abnormal_discounts: "The discount rate increased beyond its comparison threshold.",
    rising_costs: "The recorded cost rate increased.",
    underperformance: "Growth trails the eligible peer cohort."
  },
  zh: {
    high: "高置信度",
    medium: "中等置信度",
    low: "有限置信度",
    revenue: "记录收入",
    contribution: "贡献利润",
    quantity: "数量",
    previous: "先前单位成本",
    current: "当前单位成本",
    increase: "单位成本增加",
    supplier: "供应商",
    demand: "假设需求变化",
    projected: "预计贡献利润",
    change: "贡献利润变化",
    before: "执行前",
    after: "执行后",
    observed: "观察到的收入变化",
    high_popularity_high_margin: "受欢迎程度和利润率均高于组合阈值。",
    high_popularity_below_portfolio_margin: "商品受欢迎，但利润率低于组合阈值。",
    low_popularity_high_margin: "利润率高于阈值，但受欢迎程度较低。",
    low_popularity_below_portfolio_margin: "受欢迎程度和利润率均低于组合阈值。",
    supplier_cost_increase: "同一供应商的记录单位成本上涨。",
    recorded_cost_increase: "记录单位成本上涨，供应商归因未确认。",
    falling_sales: "可比期间的门店销售下降。",
    high_refunds: "退款率超过阈值。",
    abnormal_discounts: "折扣率增幅超过比较阈值。",
    rising_costs: "记录成本率上涨。",
    underperformance: "增长落后于可比门店群。"
  }
};
function useMoney(currency) {
  const { locale, formatCurrency } = useLocale(),
    c = labels[locale === "zh-CN" ? "zh" : locale] || labels.en;
  return {
    c,
    money: (value) =>
      value == null ? "—" : formatCurrency(minorToMajor(value, currency || "SAR"), { currency: currency || "SAR" })
  };
}
export function DecisionEvidence({ rec, currency }) {
  const { c, money } = useMoney(currency),
    e = rec.evidence;
  return (
    <>
      <p>{c[rec.problem] || rec.problem}</p>
      <p>{c[rec.confidence.level]}</p>
      <dl>
        {[
          ["itemRevenueMinor", "revenue"],
          ["contributionProfitMinor", "contribution"],
          ["previousUnitCostMinor", "previous"],
          ["currentUnitCostMinor", "current"],
          ["increaseMinor", "increase"]
        ]
          .filter(([key]) => e[key] != null)
          .map(([key, label]) => (
            <div key={key}>
              <dt>{c[label]}</dt>
              <dd>{money(e[key])}</dd>
            </div>
          ))}
        {e.supplier && (
          <div>
            <dt>{c.supplier}</dt>
            <dd>{e.supplier}</dd>
          </div>
        )}
        {e.current?.revenueMinor != null && (
          <div>
            <dt>{c.revenue}</dt>
            <dd>{money(e.current.revenueMinor)}</dd>
          </div>
        )}
      </dl>
    </>
  );
}
export function ScenarioResults({ result, currency }) {
  const { c, money } = useMoney(currency);
  return (
    <div className="operations-table-scroll">
      <table className="operations-table">
        <thead>
          <tr>
            <th>{c.demand}</th>
            <th>{c.projected}</th>
            <th>{c.change}</th>
          </tr>
        </thead>
        <tbody>
          {result.scenarios.map((row, i) => (
            <tr key={i}>
              <th>{row.demandChangeBps == null ? "—" : `${row.demandChangeBps / 100}%`}</th>
              <td>{money(row.projectedContributionMinor)}</td>
              <td>{money(row.contributionImpactMinor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function DecisionResult({ result, currency }) {
  const { c, money } = useMoney(currency);
  return (
    <dl>
      {[
        ["before", "revenueMinor"],
        ["after", "revenueMinor"]
      ].map(([key, metric]) => (
        <div key={key}>
          <dt>
            {c[key]} ·{" "}
            <bdi>
              {result[key].fromDate} — {result[key].toDate}
            </bdi>
          </dt>
          <dd>{money(result[key][metric])}</dd>
        </div>
      ))}
      <div>
        <dt>{c.observed}</dt>
        <dd>{money(result.revenueChangeMinor)}</dd>
      </div>
    </dl>
  );
}
