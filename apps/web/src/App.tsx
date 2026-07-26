import { useState } from 'react';

const api = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://127.0.0.1:3000';

export function App() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('');
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      const response = await fetch(`${api}/auth/${mode}`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error('Authentication failed');
      setAuthenticated(true);
    } catch { setMessage('Unable to sign in. Check your details and try again.'); } finally { setBusy(false); }
  }

  if (authenticated) return <main><p className="eyebrow">SECURE SESSION</p><h1>Restaurant Decision AI</h1><p>Your tenant workspace is ready.</p><button onClick={() => setAuthenticated(false)}>Sign out</button></main>;
  return <main className="auth-shell"><section><p className="eyebrow">RESTAURANT DECISION AI</p><h1>{mode === 'login' ? 'Welcome back' : 'Create your workspace'}</h1><p>Secure access for restaurant owners and managers.</p><form onSubmit={submit}>
    <label>Email<input name="email" type="email" required autoComplete="email" /></label>
    <label>Password<input name="password" type="password" minLength={12} required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
    {mode === 'register' && <><label>Your name<input name="displayName" required /></label><label>Organization<input name="organizationName" required /></label><label>Restaurant<input name="restaurantName" required /></label></>}
    <button disabled={busy} type="submit">{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Register'}</button>
    {message && <p role="alert">{message}</p>}
  </form><button className="link-button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setMessage(''); }}>{mode === 'login' ? 'Create an account' : 'I already have an account'}</button></section></main>;
}
