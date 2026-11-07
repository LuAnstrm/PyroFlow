import { useEffect, useState } from "react"
import { AlertTriangle, ChevronRight, Database, Eye, EyeOff, KeyRound, LogOut, UserPlus } from "lucide-react"
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

function LoginLayout({ children }: { children: React.ReactNode }) {
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
          {children}
        </div>
      </section>
    </main>
  )
}

function ErrorLine({ message }: { message: string }) {
  if (!message) return null
  return (
    <div className="error-message">
      <AlertTriangle size={17} />
      {message}
    </div>
  )
}

function PasswordField({ value, onChange, autoComplete, placeholder, minLength }: { value: string; onChange: (v: string) => void; autoComplete: string; placeholder: string; minLength?: number }) {
  const [show, setShow] = useState(false)
  return (
    <div className="password-field">
      <Field type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete={autoComplete} minLength={minLength} maxLength={72} required />
      <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}>
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  )
}

/** Shows a notice while MySQL or the API is down, and clears it by itself once they're up. */
function useDatabaseCheck() {
  const [dbDown, setDbDown] = useState(false)
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
  return [dbDown, setDbDown] as const
}

function DatabaseNotice() {
  return (
    <div className="setup-notice">
      <Database size={18} />
      <div>
        <b>The database isn't ready</b>
        <span>
          Start your MySQL server, then run <code>npm run db:setup</code> and reload this page.
        </span>
      </div>
    </div>
  )
}

export function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [mode, setMode] = useState<"signin" | "register">("signin")
  const [name, setName] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [code, setCode] = useState("")
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [forgot, setForgot] = useState(false)
  const [dbDown, setDbDown] = useDatabaseCheck()
  const registering = mode === "register"

  const switchMode = (next: "signin" | "register") => {
    setMode(next)
    setError("")
    setPassword("")
    setConfirm("")
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (registering && password !== confirm) {
      setError("The two passwords don't match.")
      return
    }
    setBusy(true)
    setError("")
    try {
      const r = registering
        ? await api<{ user: User }>("/auth/register", { method: "POST", body: { name, username, password, code } })
        : await api<{ user: User }>("/auth/login", { method: "POST", body: { username, password, remember } })
      onLogin(r.user)
    } catch (err: any) {
      if (err.code === "DB_DOWN") setDbDown(true)
      else setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <LoginLayout>
      <h2>{registering ? "Create your account" : "Welcome back"}</h2>
      <p className="login-subtitle">{registering ? "Make your own login, then join your shop with the invite code from the owner." : "Sign in to your fireworks shop account."}</p>
      {dbDown && <DatabaseNotice />}
      <form onSubmit={submit}>
        {registering && (
          <FormGroup label="Full name">
            <Field value={name} onChange={(e) => setName(e.target.value)} placeholder="Juan Dela Cruz" autoComplete="name" maxLength={120} required />
          </FormGroup>
        )}
        <FormGroup label="Username">
          <Field value={username} onChange={(e) => setUsername(e.target.value)} placeholder={registering ? "Letters, numbers, dots or dashes" : "Enter your username"} autoComplete="username" maxLength={60} required />
        </FormGroup>
        <FormGroup label="Password">
          <PasswordField value={password} onChange={setPassword} autoComplete={registering ? "new-password" : "current-password"} placeholder={registering ? "At least 8 characters" : "Enter your password"} minLength={registering ? 8 : undefined} />
        </FormGroup>
        {registering ? (
          <>
            <FormGroup label="Confirm password">
              <PasswordField value={confirm} onChange={setConfirm} autoComplete="new-password" placeholder="Type it again" />
            </FormGroup>
            <FormGroup label="Invite code (optional)">
              <Field icon={KeyRound} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. 7KQ2M9X" maxLength={14} className="code-field" autoComplete="off" />
            </FormGroup>
            <p className="login-hint">No code yet? Create your account now and enter the code after you sign in.</p>
          </>
        ) : (
          <div className="login-options">
            <label className="check">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> <span>Keep me signed in</span>
            </label>
            <button type="button" onClick={() => setForgot(true)}>
              Forgot password?
            </button>
          </div>
        )}
        <ErrorLine message={error} />
        <Button type="submit" className="login-button" disabled={busy}>
          {registering ? (busy ? "Creating account…" : "Create account") : busy ? "Signing in…" : "Sign in"} <ChevronRight size={18} />
        </Button>
      </form>
      <p className="login-switch">
        {registering ? "Already have an account?" : "New to the shop?"}{" "}
        <button type="button" onClick={() => switchMode(registering ? "signin" : "register")}>
          {registering ? "Sign in" : "Create an account"}
        </button>
      </p>
      {forgot && (
        <Modal title="Forgot your password?" onClose={() => setForgot(false)} width={440}>
          <p className="modal-text">
            Ask the shop owner to open <b>Team &amp; Roles</b>, find your name, and choose <b>Reset password</b>. They'll give you a new one to sign in with.
          </p>
          <div className="modal-actions">
            <Button onClick={() => setForgot(false)}>Got it</Button>
          </div>
        </Modal>
      )}
    </LoginLayout>
  )
}

/** Shown after sign-in to anyone who hasn't joined the shop yet, like entering a class code. */
export function JoinShop({ user, onJoined, onLogout }: { user: User; onJoined: (u: User) => void; onLogout: () => void }) {
  const [code, setCode] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError("")
    try {
      const r = await api<{ user: User }>("/join", { method: "POST", body: { code } })
      onJoined(r.user)
    } catch (err: any) {
      setError(err.message)
      setBusy(false)
    }
  }
  return (
    <LoginLayout>
      <div className="join-icon">
        <UserPlus size={24} />
      </div>
      <h2>Join your shop</h2>
      <p className="login-subtitle">Hi {user.name.split(" ")[0]}! Enter the invite code the shop owner gave you. The code decides your role, like Cashier or Inventory Clerk.</p>
      <form onSubmit={submit}>
        <FormGroup label="Invite code">
          <Field icon={KeyRound} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. 7KQ2M9X" maxLength={14} className="code-field" autoComplete="off" autoFocus required />
        </FormGroup>
        <ErrorLine message={error} />
        <Button type="submit" className="login-button" disabled={busy}>
          {busy ? "Joining…" : "Join shop"} <ChevronRight size={18} />
        </Button>
      </form>
      <p className="login-hint">No code? Ask the owner to open Team &amp; Roles, then Invite codes, and make one for your role.</p>
      <p className="login-switch">
        Signed in as @{user.username}.{" "}
        <button type="button" onClick={onLogout}>
          <LogOut size={14} /> Log out
        </button>
      </p>
    </LoginLayout>
  )
}
