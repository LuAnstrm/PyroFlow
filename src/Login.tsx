import { useEffect, useRef, useState } from "react"
import { AlertTriangle, ChevronRight, Database, Eye, EyeOff, IdCard, KeyRound, Lock, LogIn, LogOut, UserPlus, UserRound } from "lucide-react"
import { api, type User } from "./lib"
import { Button, Field, FormGroup, Logo, Modal } from "./ui"

// Colours of real pyrotechnic stars, by the metal salt that makes them:
// strontium red, barium green, copper blue, strontium+copper purple,
// calcium orange, sodium yellow and magnesium/titanium silver-white.
const COLORS = ["#FF3B30", "#7CFF6B", "#3DA5FF", "#C77DFF", "#FF9A3C", "#FFE066", "#EEF2FF"]
const GOLD = ["#FFD54A", "#FFC233", "#FFE58A", "#FFB300"]

type Spark = { x: number; y: number; vx: number; vy: number; life: number; decay: number; color: string; size: number; twinkle: boolean; trailLen: number; trail: [number, number][] }
type Rocket = { x: number; y: number; vx: number; vy: number; targetY: number; color: string; trail: [number, number][] }

// Higher gravity = rockets climb faster and the show feels snappier.
const ROCKET_GRAVITY = 0.2
// Overall playback speed: 1 = normal, lower = slower, longer-lasting fireworks.
const SHOW_SPEED = 0.5

// Small seeded random so the skyline keeps the same shape between resizes.
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]

function FireworksSky() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    let w = 0
    let h = 0
    let stars: { x: number; y: number; r: number; phase: number; speed: number }[] = []
    const skyline = document.createElement("canvas")

    // Twinkling stars and a city skyline, rebuilt whenever the canvas resizes.
    let beacons: { x: number; y: number; phase: number }[] = []
    const glows: { x: number; y: number; color: string; life: number }[] = []
    const buildScene = (dpr: number) => {
      const r = seeded(7)
      stars = Array.from({ length: Math.round((w * h) / 7000) }, () => ({
        x: r() * w, y: r() * h * 0.7, r: 0.4 + r() * 1.1, phase: r() * Math.PI * 2, speed: 0.6 + r() * 1.6,
      }))
      beacons = []
      skyline.width = w * dpr
      skyline.height = h * dpr
      const g = skyline.getContext("2d")
      if (!g) return
      g.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Warm light pollution sitting on the horizon.
      const glow = g.createLinearGradient(0, h * 0.6, 0, h)
      glow.addColorStop(0, "rgba(255,140,80,0)")
      glow.addColorStop(0.7, "rgba(255,150,90,0.10)")
      glow.addColorStop(1, "rgba(255,170,110,0.16)")
      g.fillStyle = glow
      g.fillRect(0, h * 0.6, w, h * 0.4)

      type Win = { floor: number; col: number; ww: number; wh: number; alpha: number; dark?: boolean }
      const WARM = ["255,217,138", "255,196,107", "255,241,201", "255,206,150"]
      const windows = (x: number, top: number, bw: number, win: Win) => {
        for (let wy = top + win.floor * 0.8; wy < h - win.floor * 0.6; wy += win.floor) {
          // Whole floors tend to be lit or dark together, like real offices and flats.
          const floorLit = r() < 0.3 ? 0.7 : 0.07
          for (let wx = x + win.col * 0.6; wx < x + bw - win.col * 0.6; wx += win.col) {
            if (r() < floorLit) {
              const tone = r() < 0.9 ? WARM[Math.floor(r() * WARM.length)] : "160,215,255"
              g.fillStyle = "rgba(" + tone + "," + (win.alpha * (0.55 + r() * 0.45)) + ")"
              g.fillRect(wx, wy, win.ww, win.wh)
            } else if (win.dark) {
              g.fillStyle = "rgba(150,180,240,0.045)"
              g.fillRect(wx, wy, win.ww, win.wh)
            }
          }
        }
      }

      type Style = "flat" | "setback" | "spire" | "slant" | "dome"
      const building = (x: number, bw: number, bh: number, color: string, style: Style, win: Win, rim: string) => {
        const top = h - bh
        g.fillStyle = color
        g.fillRect(x, top, bw, bh)
        let peakX = x + bw / 2
        let peakY = top
        if (style === "setback" || style === "spire") {
          g.fillRect(x + bw * 0.14, top - bh * 0.1, bw * 0.72, bh * 0.1 + 1)
          g.fillRect(x + bw * 0.3, top - bh * 0.17, bw * 0.4, bh * 0.07 + 1)
          peakY = top - bh * 0.17
          if (style === "spire") {
            g.beginPath()
            g.moveTo(peakX - bw * 0.08, peakY)
            g.lineTo(peakX, peakY - bh * 0.32)
            g.lineTo(peakX + bw * 0.08, peakY)
            g.fill()
            peakY -= bh * 0.32
            beacons.push({ x: peakX, y: peakY, phase: r() * 6 })
          }
        } else if (style === "slant") {
          g.beginPath()
          const left = r() < 0.5
          g.moveTo(x, top)
          g.lineTo(x + bw, top)
          g.lineTo(left ? x : x + bw, top - bw * 0.45)
          g.fill()
        } else if (style === "dome") {
          g.beginPath()
          g.arc(peakX, top, bw * 0.32, Math.PI, 0)
          g.fill()
          g.fillRect(peakX - 0.75, top - bw * 0.32 - 7, 1.5, 7)
        } else {
          // rooftop clutter: AC units and the odd water tower
          g.fillRect(x + bw * 0.15, top - 4, bw * 0.22, 4)
          if (r() < 0.35 && bw > 34) {
            const tx = x + bw * 0.58
            g.fillRect(tx, top - 16, 10, 9)
            g.beginPath()
            g.moveTo(tx - 1, top - 16)
            g.lineTo(tx + 5, top - 21)
            g.lineTo(tx + 11, top - 16)
            g.fill()
            g.fillRect(tx + 1, top - 7, 1.2, 7)
            g.fillRect(tx + 7.8, top - 7, 1.2, 7)
          }
          if (r() < 0.2) {
            g.fillRect(x + bw * 0.7, top - 18, 1.5, 18)
            beacons.push({ x: x + bw * 0.7 + 0.75, y: top - 18, phase: r() * 6 })
          }
        }
        // faint rim light where the sky catches the roof edge
        g.fillStyle = rim
        g.fillRect(x, top, bw, 1)
        // a slightly lighter column gives each building a lit side
        g.fillStyle = "rgba(140,170,230,0.035)"
        g.fillRect(x, top, Math.max(2, bw * 0.28), bh)
        windows(x, top, bw, win)
        return { peakX, peakY }
      }

      const layer = (color: string, minH: number, maxH: number, minW: number, maxW: number, styles: Style[], win: Win, rim: string) => {
        let x = -20
        while (x < w + 20) {
          const bw = minW + r() * (maxW - minW)
          const bh = h * (minH + r() * (maxH - minH))
          building(x, bw, bh, color, styles[Math.floor(r() * styles.length)], win, rim)
          x += bw + (r() < 0.3 ? r() * 10 : 0)
        }
      }

      // Far: hazy, tall and pale.
      layer("#1a3460", 0.12, 0.25, 22, 52, ["flat", "flat", "setback", "spire", "dome"], { floor: 6, col: 5, ww: 1.6, wh: 2, alpha: 0.32 }, "rgba(140,180,255,0.18)")
      // Two landmark towers that anchor the skyline.
      building(w * 0.16, 44, h * 0.34, "#14294f", "spire", { floor: 7, col: 6, ww: 2, wh: 3, alpha: 0.45 }, "rgba(140,180,255,0.2)")
      building(w * 0.8, 52, h * 0.29, "#14294f", "setback", { floor: 7, col: 6, ww: 2, wh: 3, alpha: 0.45 }, "rgba(140,180,255,0.2)")
      // Mist between the layers for depth.
      const mist = g.createLinearGradient(0, h * 0.72, 0, h)
      mist.addColorStop(0, "rgba(12,30,62,0)")
      mist.addColorStop(1, "rgba(12,30,62,0.55)")
      g.fillStyle = mist
      g.fillRect(0, h * 0.72, w, h * 0.28)
      // Mid.
      layer("#0f2346", 0.08, 0.18, 28, 66, ["flat", "flat", "setback", "slant", "dome"], { floor: 8, col: 7, ww: 2.6, wh: 3, alpha: 0.6 }, "rgba(120,165,250,0.16)")
      // Near: darkest, biggest windows.
      layer("#060d1f", 0.04, 0.11, 36, 92, ["flat", "flat", "flat", "slant"], { floor: 10, col: 9, ww: 4, wh: 5, alpha: 0.9, dark: true }, "rgba(110,150,240,0.14)")
    }

    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      buildScene(dpr)
    }
    const drawStars = (now: number) => {
      ctx.globalCompositeOperation = "source-over"
      ctx.fillStyle = "#ffffff"
      for (const st of stars) {
        ctx.globalAlpha = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin((now / 1000) * st.speed + st.phase))
        ctx.beginPath()
        ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }
    const drawSkyline = (now: number, step: number) => {
      // Each burst briefly lights up the sky, so the buildings stand out against it.
      ctx.globalCompositeOperation = "lighter"
      for (let i = glows.length - 1; i >= 0; i--) {
        const gl = glows[i]
        gl.life -= 0.012 * step
        if (gl.life <= 0) {
          glows.splice(i, 1)
          continue
        }
        const radius = 320 * scale()
        const grad = ctx.createRadialGradient(gl.x, gl.y, 0, gl.x, gl.y, radius)
        grad.addColorStop(0, gl.color)
        grad.addColorStop(1, "rgba(0,0,0,0)")
        ctx.globalAlpha = gl.life * 0.09
        ctx.fillStyle = grad
        ctx.fillRect(gl.x - radius, gl.y - radius, radius * 2, radius * 2)
      }
      ctx.globalCompositeOperation = "source-over"
      ctx.globalAlpha = 1
      ctx.drawImage(skyline, 0, 0, w, h)
      // Red aircraft-warning lights on the tall towers.
      ctx.globalCompositeOperation = "lighter"
      for (const bc of beacons) {
        const on = Math.max(0, Math.sin(now / 700 + bc.phase)) ** 6
        if (on < 0.02) continue
        const grad = ctx.createRadialGradient(bc.x, bc.y, 0, bc.x, bc.y, 7)
        grad.addColorStop(0, "rgba(255,70,60," + on + ")")
        grad.addColorStop(1, "rgba(255,40,40,0)")
        ctx.globalAlpha = 1
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(bc.x, bc.y, 7, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }
    fit()
    const resize = new ResizeObserver(fit)
    resize.observe(canvas)

    const rockets: Rocket[] = []
    const sparks: Spark[] = []
    const scale = () => Math.max(0.6, Math.min(w, h) / 700)

    type Shape = "scatter" | "peony" | "willow" | "brocade"
    const explode = (x: number, y: number, color: string, forced?: Shape) => {
      const s = scale()
      const power = rand(9, 12) * s
      const second = pick(COLORS.filter((c) => c !== color))
      const add = (vx: number, vy: number, c: string, decay: number, twinkle = false, size = rand(1.4, 2.6) * s, trailLen = 6) =>
        sparks.push({ x, y, vx, vy, life: 1, decay, color: c, size, twinkle, trailLen, trail: [] })
      // Gold glitter: slow, lingering, twinkling sparks with long brushed tails.
      const goldDust = (n: number) => {
        for (let i = 0; i < n; i++) {
          const a = rand(0, Math.PI * 2)
          const speed = power * rand(0.15, 0.75)
          add(Math.cos(a) * speed, Math.sin(a) * speed, pick(GOLD), rand(0.008, 0.012), true, rand(0.9, 1.5) * s, 12)
        }
      }

      const shape: Shape = forced ?? pick<Shape>(["scatter", "scatter", "brocade", "brocade", "peony", "peony", "willow"])
      if (shape === "scatter") {
        // Uneven, multicoloured spray with a few long fast streaks.
        const n = Math.round(rand(110, 150))
        for (let i = 0; i < n; i++) {
          const a = rand(0, Math.PI * 2)
          const speed = power * (Math.random() < 0.15 ? rand(1, 1.4) : rand(0.2, 0.95))
          add(Math.cos(a) * speed, Math.sin(a) * speed, pick(COLORS), rand(0.013, 0.026), Math.random() < 0.4)
        }
      } else if (shape === "brocade") {
        // All-gold "brush" burst: long curved golden tails that droop as they fade.
        const n = Math.round(rand(100, 130))
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + rand(-0.04, 0.04)
          const speed = power * rand(0.55, 1)
          add(Math.cos(a) * speed, Math.sin(a) * speed, pick(GOLD), rand(0.009, 0.012), Math.random() < 0.5, rand(1.4, 2) * s, 18)
        }
      } else {
        const willow = shape === "willow"
        const n = Math.round(rand(120, 170))
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + rand(-0.05, 0.05)
          const speed = power * Math.sqrt(Math.random())
          add(Math.cos(a) * speed, Math.sin(a) * speed, i % 3 === 0 ? second : color, willow ? rand(0.008, 0.011) : rand(0.013, 0.019), Math.random() < 0.3)
        }
      }
      // A gold shimmer on top of every coloured burst.
      if (shape !== "brocade") goldDust(45)
      // bright flash at the centre
      sparks.push({ x, y, vx: 0, vy: 0, life: 1, decay: 0.06, color: "#ffffff", size: 22 * s, twinkle: false, trailLen: 0, trail: [] })
      glows.push({ x, y, color, life: 1 })
    }

    const launch = () => {
      const x = rand(w * 0.1, w * 0.9)
      // Burst high in the sky; keep clear of the logo in the top-left corner.
      const targetY = rand(x < w * 0.35 ? h * 0.26 : h * 0.2, h * 0.42)
      // Launch speed that just reaches targetY under ROCKET_GRAVITY.
      const vy = -Math.sqrt(2 * ROCKET_GRAVITY * (h + 10 - targetY)) * 1.05
      rockets.push({ x, y: h + 10, vx: rand(-0.6, 0.6), vy, targetY, color: pick(COLORS), trail: [] })
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduced) {
      // Still picture: a few bursts frozen mid-bloom.
      ;[[0.25, 0.25], [0.68, 0.2], [0.78, 0.48], [0.4, 0.5]].forEach(([fx, fy], i) => explode(w * fx, h * fy, COLORS[i]))
      drawStars(0)
      ctx.globalCompositeOperation = "lighter"
      for (const p of sparks) {
        if (p.color === "#ffffff") continue
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x + p.vx * 22, p.y + p.vy * 22, p.size, 0, Math.PI * 2)
        ctx.fill()
      }
      drawSkyline(0, 0)
      return () => resize.disconnect()
    }

    let frame = 0
    let last = performance.now()
    let nextLaunch = 0
    // Open with bursts already in the sky so the page never starts empty.
    explode(w * 0.3, h * 0.32, COLORS[0], "peony")
    explode(w * 0.6, h * 0.24, COLORS[3], "scatter")
    explode(w * 0.82, h * 0.36, GOLD[0], "brocade")
    const tick = (now: number) => {
      const dt = Math.min(now - last, 50)
      last = now
      nextLaunch -= dt
      if (nextLaunch <= 0) {
        // Calm pacing: mostly one rocket at a time, an occasional pair.
        const volley = Math.random() < 0.2 ? 2 : 1
        for (let i = 0; i < volley; i++) launch()
        nextLaunch = rand(1400, 2600)
      }
      const step = (dt / 16.67) * SHOW_SPEED

      ctx.globalCompositeOperation = "source-over"
      ctx.clearRect(0, 0, w, h)
      drawStars(now)
      ctx.globalCompositeOperation = "lighter"
      ctx.lineCap = "round"

      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i]
        r.trail.push([r.x, r.y])
        if (r.trail.length > 10) r.trail.shift()
        r.x += r.vx * step
        r.y += r.vy * step
        r.vy += ROCKET_GRAVITY * step
        ctx.strokeStyle = GOLD[0]
        ctx.lineWidth = 2 * scale()
        ctx.globalAlpha = 0.8
        ctx.beginPath()
        ctx.moveTo(r.trail[0][0], r.trail[0][1])
        ctx.lineTo(r.x, r.y)
        ctx.stroke()
        ctx.globalAlpha = 1
        ctx.fillStyle = "#fff4d6"
        ctx.beginPath()
        ctx.arc(r.x, r.y, 2 * scale(), 0, Math.PI * 2)
        ctx.fill()
        if (r.y <= r.targetY || r.vy >= -1) {
          explode(r.x, r.y, r.color)
          rockets.splice(i, 1)
        }
      }

      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i]
        p.trail.push([p.x, p.y])
        if (p.trail.length > p.trailLen) p.trail.shift()
        p.vx *= 0.972 ** step
        p.vy = p.vy * 0.972 ** step + 0.05 * step
        p.x += p.vx * step
        p.y += p.vy * step
        p.life -= p.decay * step
        if (p.life <= 0) {
          sparks.splice(i, 1)
          continue
        }
        // Gentle shimmer instead of a hard flicker.
        const alpha = p.twinkle && Math.random() < 0.15 ? p.life * 0.55 : p.life
        if (p.color === "#ffffff") {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size)
          g.addColorStop(0, `rgba(255,255,255,${p.life * 0.9})`)
          g.addColorStop(1, "rgba(255,255,255,0)")
          ctx.globalAlpha = 1
          ctx.fillStyle = g
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
          ctx.fill()
          continue
        }
        ctx.globalAlpha = alpha * 0.55
        ctx.strokeStyle = p.color
        ctx.lineWidth = p.size
        ctx.beginPath()
        ctx.moveTo(p.trail[0][0], p.trail[0][1])
        for (let k = 1; k < p.trail.length; k++) ctx.lineTo(p.trail[k][0], p.trail[k][1])
        ctx.lineTo(p.x, p.y)
        ctx.stroke()
        ctx.globalAlpha = alpha
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * 0.9, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      // Skyline last, so rockets rise from behind the buildings.
      drawSkyline(now, step)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
    }
  }, [])

  return <canvas ref={ref} className="fireworks-sky" aria-hidden="true" />
}

function LoginLayout({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main className="login-page">
      <FireworksSky />
      <header className="login-top">
        <Logo />
      </header>
      <section className="login-center">
        <div className={`login-card-shell ${wide ? "wide" : ""}`}>
          <div className="login-glow" aria-hidden="true" />
          <div className="login-card">{children}</div>
        </div>
        <p className="login-tagline">Every sale starts a celebration.</p>
      </section>
      <footer className="login-footer">© {new Date().getFullYear()} PyroFlow · Celebrate safely.</footer>
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
      <Field icon={Lock} type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete={autoComplete} minLength={minLength} maxLength={72} required />
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
    <LoginLayout wide>
      <form className="auth-grid" onSubmit={submit}>
        <div className="auth-main">
          <h2>{registering ? "Create your account" : "Welcome back"}</h2>
          <p className="login-subtitle">{registering ? "Make your own login, then join your shop with the invite code from the owner." : "Sign in to your fireworks shop account."}</p>
          {dbDown && <DatabaseNotice />}
          <div className="auth-fields">
            {registering && (
              <FormGroup label="Full name">
                <Field icon={IdCard} value={name} onChange={(e) => setName(e.target.value)} placeholder="Juan Dela Cruz" autoComplete="name" maxLength={120} required />
              </FormGroup>
            )}
            <FormGroup label="Username">
              <Field icon={UserRound} value={username} onChange={(e) => setUsername(e.target.value)} placeholder={registering ? "Letters, numbers, dots or dashes" : "Enter your username"} autoComplete="username" maxLength={60} required />
            </FormGroup>
            <FormGroup label="Password">
              <PasswordField value={password} onChange={setPassword} autoComplete={registering ? "new-password" : "current-password"} placeholder={registering ? "At least 8 characters" : "Enter your password"} minLength={registering ? 8 : undefined} />
            </FormGroup>
            {registering ? (
              <FormGroup label="Confirm password">
                <PasswordField value={confirm} onChange={setConfirm} autoComplete="new-password" placeholder="Type it again" />
              </FormGroup>
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
          </div>
        </div>

        <div className="auth-side">
          {registering && (
            <div className="auth-code">
              <FormGroup label="Invite code (optional)">
                <Field icon={KeyRound} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. 7KQ2M9X" maxLength={14} className="code-field" autoComplete="off" />
              </FormGroup>
              <p className="login-hint">No code yet? Create your account now and enter it after you sign in.</p>
            </div>
          )}
          <ErrorLine message={error} />
          <Button type="submit" className="login-button" disabled={busy}>
            {registering ? (busy ? "Creating account…" : "Create account") : busy ? "Signing in…" : "Sign in"} <ChevronRight size={18} />
          </Button>
          <div className="auth-or">
            <span>or</span>
          </div>
          <button type="button" className="auth-alt" onClick={() => switchMode(registering ? "signin" : "register")}>
            {registering ? <LogIn size={17} /> : <UserPlus size={17} />}
            {registering ? "Sign in instead" : "Create an account"}
          </button>
          <p className="auth-note">{registering ? "Already have an account? Sign in with your username." : "New to the shop? Make an account, then join with the owner's invite code."}</p>
        </div>
      </form>
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
