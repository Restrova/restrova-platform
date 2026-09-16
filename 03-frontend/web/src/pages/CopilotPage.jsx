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
        <h1>{report ? c.report : c.title}</h1>
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
    [message, setMessage] = useState(""),
    [fromDate, setFrom] = useState(""),
    [toDate, setTo] = useState(""),
    [threadId, setThread] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
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
    queryKey: ["daily-report", scopeKey, filters],
    queryFn: ({ signal }) => api(`/reports/daily?${new URLSearchParams(filters)}`, { signal }),
    enabled: report && (scope !== "branch" || Boolean(branchId)),
    retry: false
  });
  async function submit(e) {
    e.preventDefault();
    if (!message.trim()) return;
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
      <div className="intelligence-toolbar">
        <label>
          {c.from}
          <input type="date" value={fromDate} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          {c.to}
          <input type="date" value={toDate} onChange={(e) => setTo(e.target.value)} />
        </label>
        <Button onClick={() => (report ? daily.refetch() : threads.refetch())}>{c.retry}</Button>
      </div>
      {(error || daily.isError || threads.isError || thread.isError) && <p role="alert">{c.error}</p>}
      {report ? (
        daily.isPending ? (
          <p role="status">{c.loading}</p>
        ) : (
          daily.data && <CopilotAnswer answer={daily.data} copy={c} />
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
                  <p className="copilot-question">{turn.question}</p>
                  <CopilotAnswer answer={turn.answer} copy={c} />
                </div>
              ))}
              <form onSubmit={submit} className="copilot-form">
                <label>
                  {c.title}
                  <textarea
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
                    busy || !message.trim() || (scope === "branch" && !branchId) || (threadId && thread.isPending)
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
