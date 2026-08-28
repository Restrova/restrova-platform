import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Send,
  Sparkles,
  TrendingUp,
  Package,
  Utensils,
  LogOut,
  ShieldCheck,
  CircleDollarSign,
  Database,
  Upload,
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
import { useRestaurant } from "../../contexts/RestaurantContext.jsx";

const safeMessage = (message, fallback = "I could not read that response safely. Please try again.") => ({
  role: message?.role === "user" ? "user" : "assistant",
  content: typeof message?.content === "string" && message.content.trim() ? message.content : fallback,
  id: message?.id,
  toolsUsed: Array.isArray(message?.toolsUsed) ? message.toolsUsed : [],
  pendingAction:
    message?.pendingAction && typeof message?.pendingAction === "object" && message?.pendingAction?.hash
      ? message.pendingAction
      : null
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

function Login({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [profile, setProfile] = useState({
    name: "Restaurant Owner",
    organizationName: "Sana'a Hospitality",
    restaurantName: "مطعم صنعاء",
    branchName: "Guangzhou Main",
    branchCode: "GZ-01",
    city: "Guangzhou"
  });
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    try {
      const body = mode === "login" ? { email, password } : { ...profile, email, password };
      const data = await api(mode === "login" ? "/auth/login" : "/auth/register", {
        method: "POST",
        body: JSON.stringify(body)
      });
      localStorage.setItem("token", data.token);
      localStorage.setItem("restaurant", data.restaurant.name);
      localStorage.setItem("me", JSON.stringify(data));
      window.dispatchEvent(new Event("auth-change"));
      onLogin();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <main className="login">
      <section>
        <div className="brand">
          <span>
            <Bot />
          </span>
          <b>Restrova Platform</b>
        </div>
        <h1>
          Daily profit decisions.
          <br />
          <em>In seconds.</em>
        </h1>
        <p>The AI decision layer for restaurant owners - ask, understand, then approve.</p>
        <div className="superpowers">
          <span>Daily summary</span>
          <span>Menu profit</span>
          <span>Stock warnings</span>
        </div>
        <form onSubmit={submit}>
          <div className="auth-tabs">
            <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>
              Login
            </button>
            <button type="button" className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>
              Create restaurant
            </button>
          </div>
          {mode === "register" && (
            <>
              <label>
                Your name
                <input
                  value={profile.name}
                  onChange={(event) => setProfile({ ...profile, name: event.target.value })}
                />
              </label>
              <label>
                Organization
                <input
                  value={profile.organizationName}
                  onChange={(event) => setProfile({ ...profile, organizationName: event.target.value })}
                />
              </label>
              <label>
                Restaurant
                <input
                  value={profile.restaurantName}
                  onChange={(event) => setProfile({ ...profile, restaurantName: event.target.value })}
                />
              </label>
              <div className="form-grid">
                <label>
                  First branch
                  <input
                    value={profile.branchName}
                    onChange={(event) => setProfile({ ...profile, branchName: event.target.value })}
                  />
                </label>
                <label>
                  Code
                  <input
                    value={profile.branchCode}
                    onChange={(event) => setProfile({ ...profile, branchCode: event.target.value })}
                  />
                </label>
              </div>
              <label>
                City
                <input
                  value={profile.city}
                  onChange={(event) => setProfile({ ...profile, city: event.target.value })}
                />
              </label>
              <small className="quiet-note">Defaults: CNY, Asia/Shanghai, Arabic, operating day 10:00-02:00.</small>
            </>
          )}
          <label>
            Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error && <small>{error}</small>}
          <button>{mode === "login" ? "Open decision center" : "Create organization"}</button>
        </form>
      </section>
      <aside>
        <div className="quote">"What deserves my attention tonight?"</div>
        <div className="answer">
          <Sparkles size={18} />
          <div>
            <b>Your next best move</b>
            <br />
            Two inventory items are below threshold. Review them before dinner service.
          </div>
        </div>
        <div className="boundary">
          <ShieldCheck /> You stay in control. AI recommends; you approve every operational change.
        </div>
      </aside>
    </main>
  );
}

const importOptions = {
  orders: "Orders & historical sales",
  refunds: "Refunds",
  menu_items: "Menu prices & costs",
  inventory: "Inventory levels",
  staff_shifts: "Staff shifts & labor cost"
};

function DataPanel({ onClose, onImported }) {
  const [type, setType] = useState("orders");
  const [file, setFile] = useState();
  const [status, setStatus] = useState();
  const [busy, setBusy] = useState(false);
  const [counts, setCounts] = useState();
  const [preview, setPreview] = useState();

  useEffect(() => {
    api("/data/status")
      .then(setCounts)
      .catch(() => {});
  }, []);

  const upload = async (event) => {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setStatus();
    try {
      const csv = await file.text();
      if (!preview) {
        const nextPreview = await api("/data/import/preview", { method: "POST", body: JSON.stringify({ type, csv }) });
        setPreview({ ...nextPreview, csv });
        setStatus({
          ok: true,
          text: `Preview ready: ${nextPreview.rows} rows. Click confirm import to write live data.`
        });
        return;
      }
      const result = await api("/data/import", {
        method: "POST",
        body: JSON.stringify({ type, csv: preview.csv, confirm: true })
      });
      setStatus({ ok: true, text: `Imported ${result.imported} rows successfully.` });
      setPreview();
      setCounts(await api("/data/status"));
      onImported();
    } catch (err) {
      setStatus({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <section className="data-panel">
        <header>
          <div>
            <small>REAL RESTAURANT DATA</small>
            <h2>Connect your operations</h2>
          </div>
          <button onClick={onClose} aria-label="Close">
            <X />
          </button>
        </header>
        <p>
          Upload CSV exports from your POS, inventory, menu, or scheduling system. Every row stays isolated to this
          restaurant.
        </p>
        <div className="connection-grid">
          {counts &&
            Object.entries(importOptions).map(([key, label]) => (
              <article key={key}>
                <Database />
                <div>
                  <b>{label}</b>
                  <small>{counts[key]} records connected</small>
                </div>
              </article>
            ))}
        </div>
        <form onSubmit={upload}>
          <label>
            Data type
            <select value={type} onChange={(event) => setType(event.target.value)}>
              {Object.entries(importOptions).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            CSV file
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                setFile(event.target.files[0]);
                setPreview();
              }}
            />
          </label>
          <small className="csv-help">Required columns are documented in the repository README.</small>
          {status && <div className={status.ok ? "import-success" : "import-error"}>{status.text}</div>}
          {preview && (
            <div className="import-success">
              Preview confirmed {preview.rows} rows. Duplicate orders/refunds will be skipped by source key or row
              fingerprint.
            </div>
          )}
          <button className="import-button" disabled={!file || busy}>
            <Upload />
            {busy ? "Working..." : preview ? "Confirm import" : "Preview CSV"}
          </button>
        </form>
      </section>
    </div>
  );
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
  const [ready, setReady] = useState(!!localStorage.getItem("token"));
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
  const [actionStates, setActionStates] = useState({});
  const restaurantContext = useRestaurant();
  const selectedBranchId = restaurantContext?.selectedBranchId || "";
  const bottom = useRef();
  const currency = stats?.currency || me?.organization?.currency || "CNY";

  const branchQuery = selectedBranchId ? `?branchId=${encodeURIComponent(selectedBranchId)}` : "";

  const refreshContext = async () => {
    const context = await api("/auth/me");
    setMe(context);
    localStorage.setItem("me", JSON.stringify(context));
    localStorage.setItem("restaurant", context.restaurant.name);
  };

  useEffect(() => {
    if (ready) {
      Promise.all([api(`/dashboard${branchQuery}`).then(setStats), refreshContext()]).catch(() => setReady(false));
    } else {
      setMessages(initialMessages);
      setSessionId();
      setStats();
      setMe(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessages, ready, selectedBranchId]);

  // Owner-approval loop (C1): confirm or cancel a pending executive action.
  const resolveAction = async (pendingAction, decision) => {
    const hash = pendingAction?.hash;
    const state = hash ? actionStates[hash] : null;
    if (!hash || state === "working" || state === "executed" || state === "cancelled") return;
    if (typeof state === "string" && state.startsWith("error") && decision === "confirm") return;
    setActionStates((states) => ({ ...states, [hash]: "working" }));
    try {
      if (decision === "confirm") {
        const result = await api(`/actions/${encodeURIComponent(hash)}/confirm`, { method: "POST" });
        setActionStates((states) => ({ ...states, [hash]: "executed" }));
        setMessages((items) => [
          ...items,
          safeMessage({
            role: "assistant",
            content: `✅ Action executed: ${result.tool}.\n\n${JSON.stringify(result.result, null, 2).slice(0, 600)}`
          })
        ]);
      } else {
        await api(`/actions/${encodeURIComponent(hash)}/cancel`, { method: "POST" });
        setActionStates((states) => ({ ...states, [hash]: "cancelled" }));
      }
      api(`/dashboard${branchQuery}`)
        .then(setStats)
        .catch(() => {});
    } catch (error) {
      setActionStates((states) => ({ ...states, [hash]: `error: ${error.message}` }));
    }
  };
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
      const payload = { message: value, sessionId };
      if (selectedBranchId) payload.branchId = Number(selectedBranchId);
      const data = await api("/chat", { method: "POST", body: JSON.stringify(payload) });
      const assistant = safeMessage(data.message);
      setSessionId(data.sessionId);
      setMessages((items) => [...items, assistant]);
      if (assistant.pendingAction)
        setActionStates((states) => ({ ...states, [assistant.pendingAction.hash]: "pending" }));
      window.dispatchEvent(
        new CustomEvent("answer-ready", { detail: { ...assistant, sessionId: data.sessionId, question: value } })
      );
      api(`/dashboard${branchQuery}`)
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

  if (!ready) return <Login onLogin={() => setReady(true)} />;

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
          <b>Today's decision brief</b>
          <article>
            <TrendingUp />
            <div>
              <small>NET SALES</small>
              <strong>{money(stats?.sales?.net_revenue ?? stats?.sales?.revenue, currency)}</strong>
              <p>{stats?.sales?.orders || 0} orders</p>
            </div>
          </article>
          <article>
            <CircleDollarSign />
            <div>
              <small>EST. PROFIT</small>
              <strong>{money(stats?.sales?.profit, currency)}</strong>
              <p>{stats?.sales?.margin_percent || 0}% margin</p>
            </div>
          </article>
          <article>
            <Package />
            <div>
              <small>STOCK RISKS</small>
              <strong>{stats?.inventory?.low_stock_count ?? "-"}</strong>
              <p>need attention</p>
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
        <button
          className="logout"
          onClick={() => {
            localStorage.clear();
            window.dispatchEvent(new Event("auth-change"));
            setReady(false);
          }}
        >
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
            <i /> Live data ready
          </span>
        </header>
        <section className="messages">
          {messages.map((raw, index) => {
            const message = safeMessage(raw);
            const action = message.pendingAction;
            const actionState = action ? actionStates[action.hash] : null;
            return (
              <div key={index} className={`message ${message.role}`}>
                <div className="avatar">{message.role === "assistant" ? <Bot /> : "YO"}</div>
                <div>
                  <small>{message.role === "assistant" ? "DECISION AI" : "YOU"}</small>
                  <p>{message.content}</p>
                  {action && actionState !== "cancelled" && actionState !== "executed" && (
                    <div
                      className="action-card"
                      style={{
                        border: "1px solid #d4a017",
                        borderRadius: 10,
                        padding: "10px 14px",
                        margin: "8px 0",
                        background: "#fffaf0"
                      }}
                    >
                      <small style={{ fontWeight: 700, color: "#8a6d00", letterSpacing: "0.06em" }}>
                        ⚠ ACTION REQUIRES YOUR APPROVAL
                      </small>
                      <p style={{ margin: "6px 0 10px", fontWeight: 600 }}>{action.description}</p>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          type="button"
                          disabled={actionState === "working" || actionState?.startsWith("error")}
                          onClick={() => resolveAction(action, "confirm")}
                          style={{
                            padding: "6px 16px",
                            borderRadius: 8,
                            border: "none",
                            background: "#166534",
                            color: "#fff",
                            fontWeight: 700,
                            cursor: "pointer"
                          }}
                        >
                          {actionState === "working" ? "…" : "Confirm & execute"}
                        </button>
                        <button
                          type="button"
                          disabled={actionState === "working" || actionState?.startsWith("error")}
                          onClick={() => resolveAction(action, "cancel")}
                          style={{
                            padding: "6px 16px",
                            borderRadius: 8,
                            border: "1px solid #b91c1c",
                            background: "#fff",
                            color: "#b91c1c",
                            fontWeight: 700,
                            cursor: "pointer"
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                      {actionState?.startsWith("error") && (
                        <small style={{ color: "#b91c1c", display: "block", marginTop: 6 }}>
                          {actionState.replace("error: ", "")}
                        </small>
                      )}
                    </div>
                  )}
                  {action && (actionState === "executed" || actionState === "cancelled") && (
                    <small
                      style={{
                        display: "inline-block",
                        marginTop: 4,
                        fontWeight: 700,
                        color: actionState === "executed" ? "#166534" : "#6b7280"
                      }}
                    >
                      {actionState === "executed" ? "✔ Action executed" : "✖ Action cancelled"}
                    </small>
                  )}
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
  const [showData, setShowData] = useState(false);
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
          <button className="data-fab" onClick={() => setShowData(true)}>
            <Database /> Connect real data
          </button>
        </>
      )}
      {showData && (
        <ErrorBoundary>
          <DataPanel onClose={() => setShowData(false)} onImported={() => {}} />
        </ErrorBoundary>
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
