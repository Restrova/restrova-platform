import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Send,
  TrendingUp,
  Package,
  Utensils,
  LogOut,
  ShieldCheck,
  CircleDollarSign,
  Database,
  X,
  ThumbsUp,
  ThumbsDown,
  Check,
  Building2,
  Users,
  Plus
} from "lucide-react";
import { ErrorState } from "../ui/ErrorState.jsx";
import { api } from "../../lib/api.js";
import { useAuth } from "../../contexts/AuthContext.jsx";

const safeMessage = (message, fallback = "I could not read that response safely. Please try again.") => ({
  role: message?.role === "user" ? "user" : "assistant",
  content: typeof message?.content === "string" && message.content.trim() ? message.content : fallback,
  id: message?.id,
  toolsUsed: Array.isArray(message?.toolsUsed) ? message.toolsUsed : []
});

const money = (value, currency = "CNY") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(
    Number(value) || 0
  );

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    if (import.meta.env.DEV) console.error("Restrova Platform display error", error, info);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="login">
        <section>
          <div className="brand">
            <span>
              <Bot />
            </span>
            <b>Restrova Platform</b>
          </div>
          <ErrorState
            onRetry={() => window.location.reload()}
            description={
              import.meta.env.DEV
                ? String(this.state.error?.message || this.state.error || "Unknown display error")
                : undefined
            }
          />
        </section>
        <aside>
          <div className="quote">No white screens on my watch.</div>
          <div className="answer">
            <ShieldCheck size={18} />
            <div>
              <b>Safe recovery</b>
              <br />
              Your backend data is not deleted by this reset.
            </div>
          </div>
        </aside>
      </main>
    );
  }
}

function ManagementPanel({ onClose, me, onUpdated }) {
  const [branches, setBranches] = useState(me?.branches || []);
  const [users, setUsers] = useState([]);
  const [branch, setBranch] = useState({
    name: "",
    code: "",
    city: "Guangzhou",
    operatingDayStart: "10:00",
    operatingDayEnd: "02:00"
  });
  const [invite, setInvite] = useState({ email: "", name: "", role: "viewer", branchId: "" });
  const [status, setStatus] = useState("");
  const owner = me?.user?.role === "owner";

  const load = useCallback(async () => {
    const nextBranches = await api("/branches");
    setBranches(nextBranches);
    if (owner) setUsers(await api("/users"));
  }, [owner]);

  useEffect(() => {
    load().catch((err) => setStatus(err.message));
  }, [load]);

  const createBranch = async (event) => {
    event.preventDefault();
    setStatus("");
    try {
      await api("/branches", { method: "POST", body: JSON.stringify(branch) });
      setBranch({ name: "", code: "", city: "Guangzhou", operatingDayStart: "10:00", operatingDayEnd: "02:00" });
      await load();
      onUpdated?.();
      setStatus("Branch created.");
    } catch (err) {
      setStatus(err.message);
    }
  };

  const inviteUser = async (event) => {
    event.preventDefault();
    setStatus("");
    try {
      const payload = {
        ...invite,
        branchId: invite.role === "branch_manager" ? Number(invite.branchId) : undefined
      };
      const result = await api("/users/invite", { method: "POST", body: JSON.stringify(payload) });
      setInvite({ email: "", name: "", role: "viewer", branchId: "" });
      await load();
      setStatus(`User invited. Temporary password: ${result.temporaryPassword}`);
    } catch (err) {
      setStatus(err.message);
    }
  };

  return (
    <div className="modal-backdrop">
      <section className="data-panel management-panel">
        <header>
          <div>
            <small>ORGANIZATION SETUP</small>
            <h2>{me?.organization?.name || "Restaurant access"}</h2>
          </div>
          <button onClick={onClose} aria-label="Close">
            <X />
          </button>
        </header>
        <p>
          Currency is {me?.organization?.currency || "CNY"}, timezone is {me?.organization?.timezone || "Asia/Shanghai"}
          . Branch managers only see their assigned branch.
        </p>
        <div className="connection-grid">
          {branches.map((item) => (
            <article key={item.id}>
              <Building2 />
              <div>
                <b>{item.name}</b>
                <small>
                  {item.code} - {item.city} - operating day {item.operating_day_start}-{item.operating_day_end}
                </small>
              </div>
            </article>
          ))}
        </div>
        {owner ? (
          <div className="management-grid">
            <form onSubmit={createBranch}>
              <h3>
                <Plus /> Add branch
              </h3>
              <label>
                Branch name
                <input
                  value={branch.name}
                  onChange={(event) => setBranch({ ...branch, name: event.target.value })}
                  required
                />
              </label>
              <div className="form-grid">
                <label>
                  Code
                  <input
                    value={branch.code}
                    onChange={(event) => setBranch({ ...branch, code: event.target.value })}
                    required
                  />
                </label>
                <label>
                  City
                  <input
                    value={branch.city}
                    onChange={(event) => setBranch({ ...branch, city: event.target.value })}
                    required
                  />
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Day start
                  <input
                    type="time"
                    value={branch.operatingDayStart}
                    onChange={(event) => setBranch({ ...branch, operatingDayStart: event.target.value })}
                  />
                </label>
                <label>
                  Day end
                  <input
                    type="time"
                    value={branch.operatingDayEnd}
                    onChange={(event) => setBranch({ ...branch, operatingDayEnd: event.target.value })}
                  />
                </label>
              </div>
              <button className="import-button">
                <Building2 /> Create branch
              </button>
            </form>
            <form onSubmit={inviteUser}>
              <h3>
                <Users /> Invite user
              </h3>
              <label>
                Name
                <input value={invite.name} onChange={(event) => setInvite({ ...invite, name: event.target.value })} />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={invite.email}
                  onChange={(event) => setInvite({ ...invite, email: event.target.value })}
                  required
                />
              </label>
              <div className="form-grid">
                <label>
                  Role
                  <select value={invite.role} onChange={(event) => setInvite({ ...invite, role: event.target.value })}>
                    <option value="viewer">Viewer</option>
                    <option value="branch_manager">Branch manager</option>
                  </select>
                </label>
                <label>
                  Branch
                  <select
                    value={invite.branchId}
                    onChange={(event) => setInvite({ ...invite, branchId: event.target.value })}
                    disabled={invite.role !== "branch_manager"}
                  >
                    <option value="">Select branch</option>
                    {branches.map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.code} - {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button className="import-button">
                <Users /> Invite user
              </button>
            </form>
          </div>
        ) : (
          <div className="import-success">
            Your role is {me?.user?.role}. You can view your assigned branch, but only owners can add branches or users.
          </div>
        )}
        {owner && (
          <div className="user-table">
            <h3>Team access</h3>
            {users.map((user) => (
              <div key={user.id}>
                <span>
                  {user.name || user.email}
                  <small>{user.email}</small>
                </span>
                <b>{user.role}</b>
                <em>{user.branch_name || "All branches"}</em>
              </div>
            ))}
          </div>
        )}
        {status && <div className={/created|invited/i.test(status) ? "import-success" : "import-error"}>{status}</div>}
      </section>
    </div>
  );
}

function FeedbackCollector() {
  const [answer, setAnswer] = useState();
  const [correcting, setCorrecting] = useState(false);
  const [correction, setCorrection] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const receive = (event) => {
      const detail = safeMessage(event.detail);
      setAnswer({ ...detail, sessionId: event.detail?.sessionId, question: event.detail?.question });
      setCorrecting(false);
      setCorrection(detail.content);
      setSaved(false);
    };
    window.addEventListener("answer-ready", receive);
    return () => window.removeEventListener("answer-ready", receive);
  }, []);

  if (!answer || saved) return null;

  const submit = async (rating) => {
    try {
      if (!answer.sessionId || !answer.id) return;
      await api("/feedback", {
        method: "POST",
        body: JSON.stringify({
          sessionId: answer.sessionId,
          messageId: answer.id,
          question: answer.question || "",
          originalAnswer: answer.content,
          rating,
          correctedAnswer: rating === "needs_correction" ? correction : undefined,
          correctTools: answer.toolsUsed || []
        })
      });
    } finally {
      setSaved(true);
    }
  };

  if (!answer.id || !answer.sessionId) return null;

  return (
    <aside className="feedback-card">
      <button className="feedback-close" onClick={() => setSaved(true)}>
        <X />
      </button>
      <b>Was this manager answer correct?</b>
      <small>Your feedback creates expert training examples.</small>
      {!correcting ? (
        <div>
          <button onClick={() => submit("approved")}>
            <ThumbsUp /> Approve
          </button>
          <button onClick={() => setCorrecting(true)}>
            <ThumbsDown /> Correct
          </button>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit("needs_correction");
          }}
        >
          <label>
            Manager-approved answer
            <textarea value={correction} onChange={(event) => setCorrection(event.target.value)} rows="5" />
          </label>
          <button>
            <Check /> Save correction
          </button>
        </form>
      )}
    </aside>
  );
}

function App() {
  const auth = useAuth();
  const initialMessages = useMemo(
    () => [
      {
        role: "assistant",
        content:
          "Good afternoon. I can summarize today, find menu profit leaks, or flag inventory risks. Where should we start?"
      }
    ],
    []
  );
  const [messages, setMessages] = useState(initialMessages);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState();
  const [stats, setStats] = useState();
  const [me, setMe] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("me") || "null");
    } catch {
      return null;
    }
  });
  const [showManage, setShowManage] = useState(false);
  const [workspaceError, setWorkspaceError] = useState("");
  const bottom = useRef();
  const currency = stats?.currency || me?.organization?.currency || "CNY";

  const refreshContext = useCallback(async () => {
    const context = await api("/auth/me");
    setMe(context);
    localStorage.setItem("me", JSON.stringify(context));
    localStorage.setItem("restaurant", context.restaurant.name);
  }, []);

  useEffect(() => {
    if (!auth.isAuthenticated) return;
    let active = true;
    setWorkspaceError("");
    Promise.allSettled([api("/dashboard").then(setStats), refreshContext()]).then((results) => {
      if (!active || !results.some((result) => result.status === "rejected") || !localStorage.getItem("token")) return;
      setWorkspaceError("Some live data could not be loaded. Your signed-in session is still active; retry shortly.");
    });
    return () => {
      active = false;
    };
  }, [auth.isAuthenticated, refreshContext]);
  useEffect(() => {
    const node = bottom.current;
    if (node && typeof node.scrollIntoView === "function") node.scrollIntoView();
  }, [messages, loading]);

  const send = async (event, preset) => {
    event?.preventDefault();
    const value = (preset || text).trim();
    if (!value || loading) return;
    setText("");
    setMessages((items) => [...items, safeMessage({ role: "user", content: value })]);
    setLoading(true);
    try {
      const data = await api("/chat", { method: "POST", body: JSON.stringify({ message: value, sessionId }) });
      const assistant = safeMessage(data.message);
      setSessionId(data.sessionId);
      setMessages((items) => [...items, assistant]);
      window.dispatchEvent(
        new CustomEvent("answer-ready", { detail: { ...assistant, sessionId: data.sessionId, question: value } })
      );
      api("/dashboard")
        .then(setStats)
        .catch(() => {});
    } catch (err) {
      setMessages((items) => [
        ...items,
        safeMessage({ role: "assistant", content: `I couldn't complete that: ${err.message}` })
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="shell">
      {showManage && (
        <ErrorBoundary>
          <ManagementPanel me={me} onClose={() => setShowManage(false)} onUpdated={refreshContext} />
        </ErrorBoundary>
      )}
      <aside className="sidebar">
        <div className="brand">
          <span>
            <Bot />
          </span>
          <b>Decision AI</b>
        </div>
        <div className="restaurant">
          <small>YOUR RESTAURANT</small>
          <h2>{localStorage.getItem("restaurant")}</h2>
          <i>● Data connected</i>
        </div>
        <nav>
          <b>{stats?.source === "imports" ? "Current month decision brief" : "Today's decision brief"}</b>
          {stats?.branchName && <p>{stats.branchName}</p>}
          <article>
            <TrendingUp />
            <div>
              <small>NET SALES</small>
              <strong>
                {stats?.sales?.has_sales === false
                  ? "—"
                  : money(stats?.sales?.net_revenue ?? stats?.sales?.revenue, currency)}
              </strong>
              <p>
                {stats?.sales?.has_sales === false
                  ? "No sales records for this period"
                  : `${stats?.sales?.orders || 0} orders`}
              </p>
            </div>
          </article>
          <article>
            <CircleDollarSign />
            <div>
              <small>EST. PROFIT</small>
              <strong>{stats?.sales?.profit == null ? "—" : money(stats.sales.profit, currency)}</strong>
              <p>
                {stats?.sales?.margin_percent == null ? "Margin unavailable" : `${stats.sales.margin_percent}% margin`}
              </p>
            </div>
          </article>
          <article>
            <Package />
            <div>
              <small>STOCK RISKS</small>
              <strong>{stats?.inventory?.items?.length ? stats.inventory.low_stock_count : "—"}</strong>
              <p>{stats?.inventory?.items?.length ? "need attention" : "Inventory not connected"}</p>
            </div>
          </article>
          <article>
            <Utensils />
            <div>
              <small>TOP DISH</small>
              <strong className="dish">{stats?.topDishes?.[0]?.name || "-"}</strong>
              <p>{money(stats?.topDishes?.[0]?.revenue, currency)} revenue</p>
            </div>
          </article>
        </nav>
        <button className="manage-button" onClick={() => setShowManage(true)}>
          <Building2 size={16} /> Manage branches & users
        </button>
        <div className="approval-note">
          <ShieldCheck />
          <div>
            <b>Owner approval required</b>
            <small>AI cannot change operations without you.</small>
          </div>
        </div>
        <button className="logout" onClick={() => auth.logout()}>
          <LogOut size={16} /> Sign out
        </button>
      </aside>
      <main className="chat">
        <header>
          <div>
            <small>AI DECISION COPILOT</small>
            <h1>Decision center</h1>
          </div>
          <span>
            <i /> {stats?.source === "imports" ? "Imported data connected" : "Live data ready"}
          </span>
        </header>
        {workspaceError && (
          <p className="quiet-note" role="status">
            {workspaceError}
          </p>
        )}
        <section className="messages">
          {messages.map((raw, index) => {
            const message = safeMessage(raw);
            return (
              <div key={index} className={`message ${message.role}`}>
                <div className="avatar">{message.role === "assistant" ? <Bot /> : "YO"}</div>
                <div>
                  <small>{message.role === "assistant" ? "DECISION AI" : "YOU"}</small>
                  <p>{message.content}</p>
                </div>
              </div>
            );
          })}
          {loading && (
            <div className="message assistant">
              <div className="avatar">
                <Bot />
              </div>
              <div className="typing">
                <i />
                <i />
                <i />
              </div>
            </div>
          )}
          <div ref={bottom} />
        </section>
        <footer>
          <div className="prompts">
            {[
              "Give me today's business summary",
              "Which dishes hurt my profit?",
              "What inventory needs attention?"
            ].map((prompt) => (
              <button type="button" onClick={() => send(null, prompt)} key={prompt}>
                {prompt}
              </button>
            ))}
          </div>
          <form onSubmit={send}>
            <textarea
              rows="1"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Ask for a decision about sales, menu profit, or stock..."
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send(event);
                }
              }}
            />
            <button type="submit" disabled={loading || !text.trim()}>
              <Send />
            </button>
          </form>
          <small>AI recommends. You approve. Every number comes from restaurant data.</small>
        </footer>
      </main>
    </div>
  );
}

function Root() {
  const [authenticated, setAuthenticated] = useState(!!localStorage.getItem("token"));
  useEffect(() => {
    const sync = () => setAuthenticated(!!localStorage.getItem("token"));
    window.addEventListener("auth-change", sync);
    return () => window.removeEventListener("auth-change", sync);
  }, []);
  return (
    <>
      {authenticated && (
        <>
          <button className="data-fab" onClick={() => window.location.assign("/app/imports")}>
            <Database /> Import & manage data
          </button>
        </>
      )}
      <FeedbackCollector />
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </>
  );
}

export default function LegacyApplication() {
  return <Root />;
}
