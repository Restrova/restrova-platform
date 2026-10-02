import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { Button } from "../components/ui/Button.jsx";
const copies = {
  ar: {
    frequency: "تكرار الجدولة",
    title: "التقارير المجدولة",
    hint: "تصلك هنا تقارير الفترة المكتملة حسب توقيت مطعمك. الأسبوعي كل اثنين والشهري أول الشهر. الإرسال بالبريد غير متاح حاليًا.",
    hour: "الساعة بتوقيت المطعم",
    add: "جدولة التقرير",
    pause: "إيقاف",
    resume: "استئناف",
    next: "الموعد التالي",
    open: "عرض التقرير المحفوظ",
    failed: "تعذر إعداد التقرير؛ تحقق من المصدر والصلاحيات.",
    error: "تعذّر تحديث الجدولة. حاول مرة ثانية.",
    live: "العودة للتقرير الحالي"
  },
  en: {
    frequency: "Schedule frequency",
    title: "Scheduled reports",
    hint: "Completed-period reports arrive here in your restaurant timezone. Weekly on Monday; monthly on the first. Email delivery is not currently available.",
    hour: "Hour in restaurant timezone",
    add: "Schedule report",
    pause: "Pause",
    resume: "Resume",
    next: "Next run",
    open: "View saved report",
    failed: "Report generation failed; check sources and permissions.",
    error: "Unable to update the schedule. Please retry.",
    live: "Return to current report"
  },
  zh: {
    frequency: "计划频率",
    title: "定时报告",
    hint: "完整期间的报告会按餐厅时区显示在此处。每周一生成周报，每月一日生成月报。暂不支持邮件发送。",
    hour: "餐厅时区的小时",
    add: "安排报告",
    pause: "暂停",
    resume: "恢复",
    next: "下次生成",
    open: "查看已保存报告",
    failed: "报告生成失败，请检查数据来源和权限。",
    error: "无法更新计划，请重试。",
    live: "返回当前报告"
  }
};
export function ReportSchedules({ scopeKey, branchId, language, copy, onOpen, onLive }) {
  const c = copies[language] || copies.en,
    client = useQueryClient();
  const [cadence, setCadence] = useState("daily"),
    [hour, setHour] = useState(8),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const query = useQuery({
    queryKey: ["report-schedules", scopeKey],
    queryFn: ({ signal }) => api("/reports/schedules", { signal }),
    refetchInterval: 60000,
    retry: false
  });
  async function perform(action) {
    setBusy(true);
    setError(false);
    try {
      await action();
      await client.invalidateQueries({ queryKey: ["report-schedules", scopeKey] });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  const date = (value, timezone) =>
    new Intl.DateTimeFormat(language, { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }).format(
      new Date(value)
    );
  return (
    <details className="simple-details no-print">
      <summary>{c.title}</summary>
      <p>{c.hint}</p>
      {(error || query.isError) && <p role="alert">{c.error}</p>}
      <form
        className="intelligence-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          perform(() =>
            api("/reports/schedules", {
              method: "POST",
              body: JSON.stringify({ cadence, hour, language, ...(branchId ? { branchId } : {}) })
            })
          );
        }}
      >
        <label>
          {c.frequency}
          <select value={cadence} onChange={(e) => setCadence(e.target.value)}>
            {["daily", "weekly", "monthly"].map((key) => (
              <option key={key} value={key}>
                {copy[key]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {c.hour}
          <input
            type="number"
            min="0"
            max="23"
            required
            value={hour}
            onChange={(e) => setHour(e.target.value === "" ? "" : Number(e.target.value))}
          />
        </label>
        <Button type="submit" disabled={busy || hour === ""}>
          {c.add}
        </Button>
      </form>
      {query.data?.schedules?.map((row) => (
        <article className="report-schedule" key={row.id}>
          <p>
            {copy[row.cadence]} · {row.timezone} · {row.language}
          </p>
          {row.nextRunAt && (
            <p>
              {c.next}:{" "}
              <time dateTime={row.retryAt || row.nextRunAt}>{date(row.retryAt || row.nextRunAt, row.timezone)}</time>
            </p>
          )}
          <Button
            disabled={busy}
            onClick={() =>
              perform(() =>
                api(`/reports/schedules/${row.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ enabled: !row.enabled })
                })
              )
            }
          >
            {row.enabled ? c.pause : c.resume}
          </Button>
        </article>
      ))}
      {query.data?.runs?.map((run) => (
        <article className="report-schedule" key={run.id}>
          <time dateTime={run.scheduledFor}>
            {date(run.scheduledFor, query.data.schedules.find((s) => s.id === run.scheduleId)?.timezone)}
          </time>{" "}
          {run.status === "ready" ? (
            <Button
              disabled={busy}
              onClick={() => perform(async () => onOpen(await api(`/reports/scheduled/${run.id}`)))}
            >
              {c.open}
            </Button>
          ) : (
            <p>{c.failed}</p>
          )}
        </article>
      ))}
      <Button variant="outline" onClick={onLive}>
        {c.live}
      </Button>
    </details>
  );
}
