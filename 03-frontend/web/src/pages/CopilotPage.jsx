import { ownerCopy } from "./ownerCopy.js";
import { actionCopy } from "./decisionCopy.js";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useRestaurant } from "../contexts/RestaurantContext.jsx";
import { useLocale } from "../contexts/LocaleContext.jsx";
import { api } from "../lib/api.js";
import { Button } from "../components/ui/Button.jsx";
import { CopilotAnswer } from "./CopilotAnswer.jsx";
import { copilotUiCopy } from "./copilotUiCopy.js";
export function CopilotPage({ report = false }) {
  const auth = useAuth(),
    restaurant = useRestaurant(),
    { locale } = useLocale(),
    language = locale === "zh-CN" ? "zh" : locale,
    c = copilotUiCopy[language] || copilotUiCopy.en,
    [selectedScope, setScope] = useState("restaurant"),
    scope = auth.user?.role === "branch_manager" ? "branch" : selectedScope;
  const scopeKey = [
    auth.user?.id,
    auth.organization?.id,
    restaurant.selectedRestaurantId,
    restaurant.selectedBranchId,
    scope,
    language,
    report
  ].join(":");
  return (
    <section className="intelligence-page" dir={language === "ar" ? "rtl" : "ltr"}>
      <header>
        <h1>{report ? c.reportTitle : c.title}</h1>
        <p>{report ? c.reportIntro : c.intro}</p>
        <nav className="decision-links">
          {auth.user?.role === "owner" && <Link to="/app/imports">{c.imports}</Link>}
          <Link to={report ? "/app/assistant" : "/app/reports"}>{report ? c.title : c.report}</Link>
        </nav>
      </header>
      <label>
        {c.scope}
        <select
          value={scope}
          disabled={auth.user?.role === "branch_manager"}
          onChange={(e) => setScope(e.target.value)}
        >
          <option value="restaurant">{c.restaurant}</option>
          <option value="branch">{c.branch}</option>
        </select>
      </label>
      <CopilotWorkspace
        key={scopeKey}
        scopeKey={scopeKey}
        scope={scope}
        branchId={scope === "branch" ? Number(restaurant.selectedBranchId) : undefined}
        language={language}
        copy={c}
        report={report}
      />
    </section>
  );
}
function CopilotWorkspace({ scopeKey, scope, branchId, language, copy: c, report }) {
  const client = useQueryClient(),
    [cadence, setCadence] = useState("daily"),
    [message, setMessage] = useState(""),
    [fromDate, setFrom] = useState(""),
    [toDate, setTo] = useState(""),
    [threadId, setThread] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const ux = ownerCopy[language === "zh" ? "zh-CN" : language] || ownerCopy.en;
  const datesValid = (!fromDate && !toDate) || (Boolean(fromDate && toDate) && fromDate <= toDate);
  const filters = {
    scope,
    ...(branchId ? { branchId } : {}),
    language,
    ...(fromDate ? { fromDate } : {}),
    ...(toDate ? { toDate } : {})
  };
  const threads = useQuery({
    queryKey: ["copilot-threads", scopeKey],
    queryFn: ({ signal }) => api("/copilot/threads", { signal }),
    enabled: !report,
    retry: false
  });
  const thread = useQuery({
    queryKey: ["copilot-thread", scopeKey, threadId],
    queryFn: ({ signal }) => api(`/copilot/threads/${threadId}`, { signal }),
    enabled: Boolean(threadId) && !report,
    retry: false
  });
  const daily = useQuery({
    queryKey: ["daily-report", scopeKey, filters, cadence],
    queryFn: ({ signal }) => api(`/reports/executive?${new URLSearchParams({ ...filters, cadence })}`, { signal }),
    enabled: report && datesValid && (scope !== "branch" || Boolean(branchId)),
    retry: false
  });
  async function exportCsv() {
    setError(false);
    try {
      const csv = await api(
        `/reports/export.csv?${new URLSearchParams({ ...filters, cadence, fromDate: daily.data.period.fromDate, toDate: daily.data.period.toDate })}`
      );
      const url = URL.createObjectURL(
        new Blob(["\uFEFF" + csv.replace(/^\uFEFF/, "")], { type: "text/csv;charset=utf-8" })
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `restrova-${cadence}-${daily.data.period.fromDate}.csv`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError(true);
    }
  }
  async function submit(e) {
    e.preventDefault();
    if (!message.trim() || !datesValid || busy) return;
    setBusy(true);
    setError(false);
    try {
      const result = await api("/copilot/ask", {
        method: "POST",
        body: JSON.stringify({
          ...filters,
          message,
          requestKey: crypto.randomUUID(),
          ...(threadId ? { threadId, version: thread.data?.version } : {})
        })
      });
      setThread(result.threadId);
      setMessage("");
      await client.invalidateQueries({ queryKey: ["copilot-thread"] });
      await client.invalidateQueries({ queryKey: ["copilot-threads"] });
    } catch {
      setError(true);
      if (threadId) thread.refetch();
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="intelligence-toolbar no-print">
        {report && (
          <label>
            {c.cadence}
            <select
              value={cadence}
              onChange={(e) => {
                setCadence(e.target.value);
                setFrom("");
                setTo("");
              }}
            >
              {["daily", "weekly", "monthly"].map((value) => (
                <option key={value} value={value}>
                  {c[value]}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          {c.from}
          <input type="date" value={fromDate} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          {c.to}
          <input type="date" min={fromDate} value={toDate} onChange={(e) => setTo(e.target.value)} />
        </label>
        <Button
          disabled={report && (!datesValid || (scope === "branch" && !branchId))}
          onClick={() => (report ? daily.refetch() : threads.refetch())}
        >
          {c.retry}
        </Button>
      </div>
      {!datesValid && <p role="alert">{ux.dateError}</p>}
      {busy && (
        <p role="status" aria-live="polite">
          {ux.busy}
        </p>
      )}
      {report && <p className="no-print">{c.periodHint}</p>}
      {(error || daily.isError || threads.isError || thread.isError) && <p role="alert">{c.error}</p>}
      {report ? (
        !datesValid ? null : daily.isPending ? (
          <p role="status">{c.loading}</p>
        ) : (
          daily.data && (
            <>
              <div className="decision-links no-print">
                <Button onClick={exportCsv} disabled={daily.isFetching}>
                  {c.csv}
                </Button>
                <Button onClick={() => window.print()} disabled={daily.isFetching}>
                  {c.pdf}
                </Button>
              </div>
              <div className="executive-print">
                <h2>
                  {c[cadence]} · {c.reportTitle}
                </h2>
                <CopilotAnswer answer={daily.data} copy={c} />
                <ReportDetails report={daily.data} copy={c} language={language} />
              </div>
            </>
          )
        )
      ) : (
        <>
          <p>{c.private}</p>
          <div className="copilot-layout">
            <aside>
              <h2>{c.history}</h2>
              <Button
                onClick={() => {
                  setThread(null);
                  setMessage("");
                  setError(false);
                }}
              >
                {c.new}
              </Button>
              {threads.data?.threads
                .filter((row) => row.scope === scope && (scope !== "branch" || row.branchId === branchId))
                .map((row) => (
                  <button
                    className="copilot-thread"
                    key={row.id}
                    onClick={() => setThread(row.id)}
                    aria-current={threadId === row.id ? "true" : undefined}
                  >
                    {row.title}
                  </button>
                ))}
            </aside>
            <div>
              {!threadId && (
                <>
                  <p>{c.empty}</p>
                  <div className="decision-links">
                    {c.suggestions.map((question) => (
                      <Button variant="outline" key={question} onClick={() => setMessage(question)}>
                        {question}
                      </Button>
                    ))}
                  </div>
                </>
              )}
              {threadId && thread.isPending && <p role="status">{c.loading}</p>}
              {thread.data?.turns.map((turn) => (
                <div className="copilot-turn" key={turn.id}>
                  <p className="copilot-question" dir="auto">
                    {turn.question}
                  </p>
                  <CopilotAnswer answer={turn.answer} copy={c} />
                </div>
              ))}
              <form onSubmit={submit} className="copilot-form">
                <label>
                  {c.title}
                  <textarea
                    dir="auto"
                    value={message}
                    maxLength={4000}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={c.placeholder}
                    required
                    rows={3}
                  />
                </label>
                <Button
                  type="submit"
                  disabled={
                    !datesValid ||
                    busy ||
                    !message.trim() ||
                    (scope === "branch" && !branchId) ||
                    (threadId && thread.isPending)
                  }
                >
                  {busy ? c.loading : c.send}
                </Button>
              </form>
            </div>
          </div>
        </>
      )}
    </>
  );
}
export function DailyReportPage() {
  return <CopilotPage report />;
}

export function ReportDetails({ report, copy: c, language }) {
  const actions = actionCopy[language] || actionCopy.en;
  const digits = new Intl.NumberFormat("en", {
    style: "currency",
    currency: report.currencyCode || "SAR"
  }).resolvedOptions().maximumFractionDigits;
  const money = (value) =>
    value == null
      ? c.noData
      : new Intl.NumberFormat(language, { style: "currency", currency: report.currencyCode || "SAR" }).format(
          value / 10 ** digits
        );
  return (
    <section className="report-details">
      <h2>{c.topActions}</h2>
      <p>{c.ranking}</p>
      {report.actionsStatus === "select_branch" ? (
        <p>{c.actionScope}</p>
      ) : !report.topActions?.length ? (
        <p>{c.noActions}</p>
      ) : (
        <ol>
          {report.topActions.map((action) => (
            <li key={`${action.branchId}-${action.key}`}>
              <h3>{actions[action.recommendedAction] || c.reviewAction}</h3>
              {action.item?.name && <p>{action.item.name}</p>}
              <p>
                {c.branch}: {action.branchName || action.branchId}
              </p>
              {action.sourceIds.map((id) => (
                <a key={id} href={`#${report.generatedAt}-${id}`}>
                  {c.sources} {id}
                </a>
              ))}{" "}
              <Link to="/app/recommendations">{c.reviewAction}</Link>
            </li>
          ))}
        </ol>
      )}
      {report.trend?.length > 0 && (
        <>
          <h2>{c.trend}</h2>
          <div className="report-table">
            <table>
              <thead>
                <tr>
                  <th>{c.date}</th>
                  <th>{c.revenue}</th>
                  <th>{c.profit}</th>
                  <th>{c.sources}</th>
                </tr>
              </thead>
              <tbody>
                {report.trend.map((day) => (
                  <tr key={day.date}>
                    <th>{day.date}</th>
                    <td>{money(day.revenueMinor)}</td>
                    <td>{money(day.profitMinor)}</td>
                    <td>
                      {day.sourceIds.map((id) => (
                        <a key={id} href={`#${report.generatedAt}-${id}`}>
                          {id}
                        </a>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
