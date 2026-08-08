import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Bot, ShieldCheck, Sparkles } from "lucide-react";
import { useAuth } from "../contexts/AuthContext.jsx";

const defaultProfile = {
  name: "Restaurant Owner",
  organizationName: "Sana'a Hospitality",
  restaurantName: "مطعم صنعاء",
  branchName: "Guangzhou Main",
  branchCode: "GZ-01",
  city: "Guangzhou"
};

export function LoginPage({ mode = "login" }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [profile, setProfile] = useState(defaultProfile);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isRegister = mode === "register";
  const next = searchParams.get("next") || "/app/workspace";

  useEffect(() => {
    if (auth.isAuthenticated && !isRegister) navigate(next, { replace: true });
  }, [auth.isAuthenticated, isRegister, navigate, next]);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setBusy(true);

    try {
      if (isRegister) {
        await auth.register({ ...profile, email, password });
      } else {
        await auth.login({ email, password });
      }
      navigate(next, { replace: true });
    } catch (err) {
      setError(err.message || "Unable to complete request");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <section>
        <div className="brand"><span><Bot /></span><b>Restaurant Decision AI</b></div>
        <h1>Daily profit decisions.<br/><em>In seconds.</em></h1>
        <p>The AI decision layer for restaurant owners - ask, understand, then approve.</p>
        <div className="superpowers"><span>Daily summary</span><span>Menu profit</span><span>Stock warnings</span></div>
        <form onSubmit={submit}>
          <div className="auth-tabs">
            <Link className={!isRegister ? "active" : ""} to="/login">Login</Link>
            <Link className={isRegister ? "active" : ""} to="/register">Create restaurant</Link>
          </div>
          {isRegister && (
            <>
              <label>Your name<input value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} required /></label>
              <label>Organization<input value={profile.organizationName} onChange={(event) => setProfile({ ...profile, organizationName: event.target.value })} required /></label>
              <label>Restaurant<input value={profile.restaurantName} onChange={(event) => setProfile({ ...profile, restaurantName: event.target.value })} required /></label>
              <div className="form-grid">
                <label>First branch<input value={profile.branchName} onChange={(event) => setProfile({ ...profile, branchName: event.target.value })} required /></label>
                <label>Code<input value={profile.branchCode} onChange={(event) => setProfile({ ...profile, branchCode: event.target.value })} required /></label>
              </div>
              <label>City<input value={profile.city} onChange={(event) => setProfile({ ...profile, city: event.target.value })} required /></label>
              <small className="quiet-note">Defaults: CNY, Asia/Shanghai, Arabic, operating day 10:00-02:00.</small>
            </>
          )}
          <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required /></label>
          {error && <small role="alert">{error}</small>}
          <button disabled={busy}>{busy ? "Working..." : isRegister ? "Create organization" : "Open decision center"}</button>
        </form>
      </section>
      <aside>
        <div className="quote">"What deserves my attention tonight?"</div>
        <div className="answer"><Sparkles size={18}/><div><b>Your next best move</b><br/>Two inventory items are below threshold. Review them before dinner service.</div></div>
        <div className="boundary"><ShieldCheck/> You stay in control. AI recommends; you approve every operational change.</div>
      </aside>
    </main>
  );
}
