import { useEffect, useState } from "react"
import { AlertTriangle, ChevronRight, Database, Eye, EyeOff, ShieldCheck, ShoppingCart, TrendingUp } from "lucide-react"
import { api, type User } from "./lib"
import { Button, Field, FormGroup, Logo, Modal } from "./ui"

const BURSTS = [
  { x: 22, y: 26, r: 92, color: "#ff8a3d", delay: 0 },
  { x: 64, y: 18, r: 64, color: "#ffc247", delay: 1.1 },
  { x: 78, y: 44, r: 110, color: "#ff5d5d", delay: 2.2 },
  { x: 38, y: 52, r: 54, color: "#ffd98a", delay: 3 },
]

function FireworksSky() {
  return (
    <svg className="fireworks-sky" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {BURSTS.map((b, n) => (
        <g key={n} className="burst" style={{ animationDelay: `${b.delay}s`, transformOrigin: `${b.x}px ${b.y}px` }}>
          {Array.from({ length: 18 }, (_, i) => {
            const a = (i / 18) * Math.PI * 2
            const len = (b.r / 6) * (i % 2 ? 0.72 : 1)
            return (
              <line
                key={i}
                x1={b.x + Math.cos(a) * len * 0.35}
                y1={b.y + Math.sin(a) * len * 0.35}
                x2={b.x + Math.cos(a) * len}
                y2={b.y + Math.sin(a) * len}
                stroke={b.color}
                strokeWidth={0.35}
                strokeLinecap="round"
              />
            )
          })}
        </g>
      ))}
    </svg>
  )
}

export function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [remember, setRemember] = useState(false)
  const [show, setShow] = useState(false)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [forgot, setForgot] = useState(false)
  const [dbDown, setDbDown] = useState(false)

  // Keeps checking, so the notice clears by itself once MySQL and the API are up.
  useEffect(() => {
    const check = () =>
      api("/health")
        .then(() => setDbDown(false))
        .catch((e) => setDbDown(e.code === "DB_DOWN"))
    const first = setTimeout(check, 800)
    const timer = setInterval(check, 4000)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError("")
    try {
      const r = await api<{ user: User }>("/auth/login", { method: "POST", body: { username, password, remember } })
      onLogin(r.user)
    } catch (err: any) {
      if (err.code === "DB_DOWN") setDbDown(true)
      else setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  const useDemo = (u: string, p: string) => {
    setUsername(u)
    setPassword(p)
    setError("")
  }

  return (
    <main className="login-page">
      <section className="login-visual">
        <FireworksSky />
        <Logo />
        <div className="visual-copy">
          <h1>Every sale starts a celebration.</h1>
          <p>Sell, track your stock, and see what next week's demand looks like, all from one screen.</p>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-form-wrap">
          <div className="mobile-logo">
            <Logo dark />
          </div>
          <h2>Welcome back</h2>
          <p className="login-subtitle">Sign in to your fireworks shop account.</p>
          {dbDown && (
            <div className="setup-notice">
              <Database size={18} />
              <div>
                <b>The database isn't ready</b>
                <span>
                  Start your MySQL server, then run <code>npm run db:setup</code> and reload this page.
                </span>
              </div>
            </div>
          )}
          <form onSubmit={submit}>
            <FormGroup label="Username">
              <Field value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter your username" autoComplete="username" required />
            </FormGroup>
            <FormGroup label="Password">
              <div className="password-field">
                <Field
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                />
                <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}>
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </FormGroup>
            <div className="login-options">
              <label className="check">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> <span>Keep me signed in</span>
              </label>
              <button type="button" onClick={() => setForgot(true)}>
                Forgot password?
              </button>
            </div>
            {error && (
              <div className="error-message">
                <AlertTriangle size={17} />
                {error}
              </div>
            )}
            <Button type="submit" className="login-button" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"} <ChevronRight size={18} />
            </Button>
          </form>
          <div className="demo-section">
            <div className="demo-label">
              <span>Demo accounts</span>
            </div>
            <div className="demo-grid">
              <button type="button" onClick={() => useDemo("Admin123", "Admin")}>
                <ShieldCheck size={18} />
                <span>
                  <b>Admin</b>Full access
                </span>
              </button>
              <button type="button" onClick={() => useDemo("Owner123", "Owner")}>
                <TrendingUp size={18} />
                <span>
                  <b>Owner</b>Business view
                </span>
              </button>
              <button type="button" onClick={() => useDemo("Staff", "Staff")}>
                <ShoppingCart size={18} />
                <span>
                  <b>Staff</b>Cashier
                </span>
              </button>
            </div>
            <p>Click an account to fill in its login, then press Sign in.</p>
          </div>
        </div>
      </section>
      {forgot && (
        <Modal title="Forgot your password?" onClose={() => setForgot(false)} width={440}>
          <p className="modal-text">
            Passwords can only be reset by an administrator. Ask your admin to open <b>Accounts &amp; Logins</b>, find your name, and choose <b>Reset password</b>. They'll give you a new one to sign in
            with.
          </p>
          <div className="modal-actions">
            <Button onClick={() => setForgot(false)}>Got it</Button>
          </div>
        </Modal>
      )}
    </main>
  )
}
