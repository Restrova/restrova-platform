import { useLocale } from "../../contexts/LocaleContext.jsx";

const labels = {
  ar: {
    title: "بياناتك المستوردة",
    empty: "لا توجد مبيعات مستوردة لهذا الفرع. اختر فرعًا يحتوي على بيانات:",
    period: "الفترة المتوفرة لهذا الفرع",
    analyze: "حلّل الفترة المتوفرة",
    noData: "لا توجد سجلات مبيعات متاحة لهذا الفرع.",
    question: (from, to) => `حلل المبيعات من ${from} إلى ${to}`
  },
  en: {
    title: "Your imported data",
    empty: "This branch has no imported sales. Select a branch with data:",
    period: "Available dates for this branch",
    analyze: "Analyze available dates",
    noData: "No sales records are available for this branch.",
    question: (from, to) => `Sales summary from ${from} to ${to}`
  },
  zh: {
    title: "已导入的数据",
    empty: "当前分店没有导入的销售记录，请选择有数据的分店：",
    period: "此分店的数据日期范围",
    analyze: "分析可用日期",
    noData: "此分店没有可用的销售记录。",
    question: (from, to) => `Sales summary from ${from} to ${to}`
  }
};

export function WorkspaceDataAvailability({ sales, onSelectBranch, onAnalyze, loading }) {
  const { locale } = useLocale();
  if (sales?.source !== "imports") return null;
  const copy = labels[locale] || labels.en;
  const branches = sales.available_branches || [];
  const first = sales.coverage?.first;
  const last = sales.coverage?.last;
  const date = (value) => new Intl.DateTimeFormat("en-CA", { timeZone: sales.timezone }).format(new Date(value));
  return (
    <section className="workspace-data-availability" aria-label={copy.title}>
      <strong>{copy.title}</strong>
      {first && last ? (
        <>
          <p>
            {copy.period}: <bdi>{date(first)}</bdi> — <bdi>{date(last)}</bdi> ({sales.timezone})
          </p>
          <button type="button" disabled={loading} onClick={() => onAnalyze(copy.question(date(first), date(last)))}>
            {copy.analyze}
          </button>
        </>
      ) : (
        <>
          <p>{branches.length ? copy.empty : copy.noData}</p>
          <div>
            {branches.map((branch) => (
              <button type="button" key={branch.id} onClick={() => onSelectBranch(String(branch.id))}>
                {branch.name}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
