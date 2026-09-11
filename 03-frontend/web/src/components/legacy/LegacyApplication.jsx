import { dataChangedEvent } from "../../lib/dataRefresh.js";
import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bot,
  Send,
  TrendingUp,
  Package,
  Utensils,
  CircleDollarSign,
  Database,
  X,
  ThumbsUp,
  ThumbsDown,
  Check,
  Plus,
  RefreshCw
} from "lucide-react";
import { ErrorState } from "../ui/ErrorState.jsx";
import { Button } from "../ui/Button.jsx";
import { api } from "../../lib/api.js";
import { useRestaurant } from "../../contexts/RestaurantContext.jsx";
import { useLocale } from "../../contexts/LocaleContext.jsx";
import { WorkspaceDataAvailability } from "./WorkspaceDataAvailability.jsx";
import { workspaceCopy } from "./workspaceCopy.js";

class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    return this.state.error ? <ErrorState onRetry={() => window.location.reload()} /> : this.props.children;
  }
}

function Feedback({ answer, sessionId, branchId, copy }) {
  const [correcting, setCorrecting] = useState(false);
  const [correction, setCorrection] = useState(answer.content);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  if (!answer.id || !sessionId || saved) return null;
  async function submit(rating) {
    if (saving) return;
    setSaving(true);
    setError(false);
    try {
      await api("/feedback", {
        method: "POST",
        body: JSON.stringify({
          sessionId,
          branchId: Number(branchId),
          messageId: answer.id,
          rating,
          correctedAnswer: rating === "needs_correction" ? correction.trim() : undefined
        })
      });
      setSaved(true);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }
  return (
    <aside className="decision-feedback">
      <div className="decision-feedback__heading">
        <span>{copy.feedback}</span>
        <Button variant="ghost" size="small" aria-label={copy.dismiss} onClick={() => setSaved(true)}>
          <X size={16} />
        </Button>
      </div>
      {correcting ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit("needs_correction");
          }}
        >
          <label>
            {copy.correction}
            <textarea value={correction} onChange={(event) => setCorrection(event.target.value)} rows={4} required />
          </label>
          <Button size="small" type="submit" disabled={saving || !correction.trim()}>
            <Check size={16} />
            {copy.saveCorrection}
          </Button>
        </form>
      ) : (
        <div className="decision-feedback__actions">
          <Button variant="ghost" size="small" disabled={saving} onClick={() => submit("approved")}>
            <ThumbsUp size={16} />
            {copy.approve}
          </Button>
          <Button variant="ghost" size="small" disabled={saving} onClick={() => setCorrecting(true)}>
            <ThumbsDown size={16} />
            {copy.correct}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="decision-error">
          {copy.feedbackError}
        </p>
      )}
    </aside>
  );
}

function Message({ message, copy }) {
  const assistant = message.role === "assistant";
  return (
    <article className={`decision-message ${assistant ? "is-assistant" : "is-user"}`}>
      <div className="decision-avatar" aria-hidden="true">
        {assistant ? <Bot size={20} /> : copy.you.slice(0, 1)}
      </div>
      <div className="decision-message__body">
        <span className="decision-message__author">{assistant ? copy.assistant : copy.you}</span>
        <div className="decision-message__text" dir="auto">
          {message.content}
        </div>
        {message.evidence?.source === "imports" && (
          <div className="decision-evidence" aria-label={copy.evidence}>
            <Database size={14} aria-hidden="true" /> <span>{copy.connected}</span>
            {message.evidence.branchName && <bdi>{message.evidence.branchName}</bdi>}
          </div>
        )}
      </div>
    </article>
  );
}

function Workspace({ branchId }) {
  const restaurant = useRestaurant();
  const { locale, formatCurrency, formatNumber } = useLocale();
  const copy = workspaceCopy[locale] || workspaceCopy.en;
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState();
  const [stats, setStats] = useState();
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState(false);
  const [sendError, setSendError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const changed = () => setRefresh((value) => value + 1);
    window.addEventListener(dataChangedEvent, changed);
    return () => window.removeEventListener(dataChangedEvent, changed);
  }, []);
  const active = useRef(false);
  const requestLock = useRef(false);
  const messageList = useRef();
  const input = useRef();
  const dashboardPath = `/dashboard?branchId=${encodeURIComponent(branchId)}`;
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (!branchId) {
      setDataLoading(false);
      return undefined;
    }
    let current = true;
    setDataLoading(true);
    setDataError(false);
    api(dashboardPath)
      .then((data) => {
        if (current) setStats(data);
      })
      .catch(() => {
        if (current) setDataError(true);
      })
      .finally(() => {
        if (current) setDataLoading(false);
      });
    return () => {
      current = false;
    };
  }, [branchId, dashboardPath, refresh]);
  useEffect(() => {
    const node = messageList.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, loading]);

  async function send(event, preset) {
    event?.preventDefault();
    const value = (preset || text).trim();
    if (!value || requestLock.current || !branchId) return;
    requestLock.current = true;
    setText("");
    setSendError(false);
    setMessages((items) => [...items, { role: "user", content: value }]);
    setLoading(true);
    try {
      const data = await api("/chat", {
        method: "POST",
        body: JSON.stringify({ message: value, sessionId, branchId: Number(branchId) })
      });
      if (!active.current) return;
      if (typeof data?.message?.content !== "string" || !data.message.content.trim())
        throw new Error("Invalid response");
      setSessionId(data.sessionId);
      setMessages((items) => [...items, { ...data.message, role: "assistant" }]);
    } catch {
      if (!active.current) return;
      setSendError(true);
      setText(value);
    } finally {
      requestLock.current = false;
      if (active.current) {
        setLoading(false);
        input.current?.focus();
      }
    }
  }
  const sales = stats?.sales;
  const imported = stats?.source === "imports" || sales?.source === "imports";
  const hasSales = Boolean(sales && (sales.has_sales ?? sales.orders > 0));
  const currency = stats?.currency;
  const money = (value) => (value == null || dataError ? "—" : formatCurrency(value, currency ? { currency } : {}));
  const lastAnswer = messages.at(-1)?.role === "assistant" ? messages.at(-1) : null;
  const metrics = [
    {
      label: copy.sales,
      icon: TrendingUp,
      value: hasSales ? money(sales.net_revenue ?? sales.revenue) : "—",
      detail: hasSales ? `${formatNumber(sales.orders)} ${copy.orders}` : copy.noSales
    },
    {
      label: copy.profit,
      icon: CircleDollarSign,
      value: hasSales ? money(sales.profit) : "—",
      detail: !hasSales
        ? copy.noSales
        : sales.margin_percent == null
          ? copy.costsMissing
          : `${formatNumber(sales.margin_percent)}% ${copy.margin}`
    },
    {
      label: copy.stock,
      icon: Package,
      value: stats?.inventory?.items?.length ? formatNumber(stats.inventory.low_stock_count) : "—",
      detail: stats?.inventory?.items?.length ? copy.stockAction : copy.noInventory
    },
    {
      label: copy.dish,
      icon: Utensils,
      value: stats?.topDishes?.[0]?.name || "—",
      detail: stats?.topDishes?.length ? money(stats.topDishes[0].revenue) : copy.noSales
    }
  ];
  return (
    <div className="decision-workspace">
      <section className="decision-overview" aria-label={copy.brief}>
        <div className="decision-overview__heading">
          <span>{copy.brief}</span>
          <span>{imported ? copy.month : copy.today}</span>
        </div>
        <div className="decision-metrics" aria-busy={dataLoading}>
          {metrics.map(({ label, icon: Icon, value, detail }) => (
            <article className="decision-metric" key={label}>
              <div className="decision-metric__label">
                <Icon size={18} aria-hidden="true" />
                <span>{label}</span>
              </div>
              <strong dir="auto">{dataLoading || dataError ? "—" : value}</strong>
              <small>{dataLoading ? copy.loading : dataError ? copy.unavailable : detail}</small>
            </article>
          ))}
        </div>
      </section>
      <section className="decision-conversation" aria-label={copy.assistant}>
        <header className="decision-conversation__header">
          <div>
            <h2>{copy.assistant}</h2>
            <span className="decision-data-status">
              <Database size={14} />
              {dataLoading
                ? copy.loading
                : dataError
                  ? copy.unavailable
                  : imported
                    ? copy.connected
                    : hasSales
                      ? copy.recorded
                      : copy.noData}
            </span>
          </div>
          <Button
            variant="ghost"
            size="small"
            disabled={loading || !messages.length}
            onClick={() => {
              setMessages([]);
              setText("");
              setSessionId(undefined);
              setSendError(false);
              input.current?.focus();
            }}
          >
            <Plus size={17} />
            {copy.fresh}
          </Button>
        </header>
        <section className="decision-messages" ref={messageList} aria-label={copy.conversation} tabIndex={0}>
          {dataError && (
            <div className="decision-data-error" role="status">
              <span>{copy.dataError}</span>
              <Button variant="outline" size="small" onClick={() => setRefresh((value) => value + 1)}>
                <RefreshCw size={16} />
                {copy.retry}
              </Button>
            </div>
          )}
          <WorkspaceDataAvailability
            sales={sales}
            onSelectBranch={restaurant.setSelectedBranchId}
            onAnalyze={(question) => send(null, question)}
            loading={loading}
          />
          {!messages.length && (
            <div className="decision-welcome">
              <div className="decision-welcome__mark">
                <Bot size={28} />
              </div>
              <h3>{copy.title}</h3>
              <p>{copy.welcome}</p>
            </div>
          )}
          {messages.map((message, index) => (
            <Message key={`${message.id || index}-${message.role}`} message={message} copy={copy} />
          ))}
          {loading && (
            <p className="decision-thinking" role="status">
              <span className="ui-spinner" aria-hidden="true" />
              {copy.thinking}
            </p>
          )}
          {lastAnswer && (
            <Feedback key={lastAnswer.id} answer={lastAnswer} sessionId={sessionId} branchId={branchId} copy={copy} />
          )}
        </section>
        <footer className="decision-composer">
          <div className="decision-prompts">
            {copy.prompts.map((prompt) => (
              <button type="button" disabled={loading || !branchId} key={prompt} onClick={() => send(null, prompt)}>
                {prompt}
              </button>
            ))}
          </div>
          {sendError && (
            <p className="decision-error" role="alert">
              {copy.sendError}
            </p>
          )}
          <form onSubmit={send}>
            <textarea
              ref={input}
              rows={2}
              value={text}
              maxLength={4000}
              dir="auto"
              aria-label={copy.placeholder}
              placeholder={copy.placeholder}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  send(event);
                }
              }}
            />
            <Button type="submit" aria-label={copy.send} disabled={loading || !text.trim() || !branchId}>
              <Send size={20} />
            </Button>
          </form>
          <div className="decision-composer__note">
            <small>{copy.disclaimer}</small>
            <Link to="/app/imports">
              <Database size={15} />
              {copy.import}
            </Link>
          </div>
        </footer>
      </section>
    </div>
  );
}

export default function LegacyApplication() {
  const { selectedBranchId } = useRestaurant();
  return (
    <ErrorBoundary>
      <Workspace key={selectedBranchId} branchId={selectedBranchId} />
    </ErrorBoundary>
  );
}
