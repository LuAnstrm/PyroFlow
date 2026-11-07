import { useEffect, useState } from "react"
import { ArrowDownRight, ArrowUpRight, ChevronDown, ChevronLeft, ChevronRight, Loader2, Sparkles, X } from "lucide-react"
import { fmtDateTime, initials, paymentLabel, peso, type Sale, type Settings } from "./lib"
import { ProductArt } from "./productArt"

export function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <div className={`logo-lockup ${dark ? "logo-dark" : ""}`}>
      <div className="logo-mark">
        <Sparkles size={20} />
      </div>
      <div>
        <strong>PyroFlow</strong>
        <span>Fireworks POS</span>
      </div>
    </div>
  )
}

export function Button({
  children,
  variant = "primary",
  size,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger"
  size?: "sm"
}) {
  return (
    <button type="button" className={`btn btn-${variant} ${size === "sm" ? "btn-sm" : ""} ${className}`} {...props}>
      {children}
    </button>
  )
}

export function Field({
  icon: Icon,
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { icon?: React.ElementType }) {
  return (
    <label className={`field ${className}`}>
      {Icon && <Icon size={17} />}
      <input {...props} />
    </label>
  )
}

export function Select({ children, className = "", ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className={`select-wrap ${className}`}>
      <select {...props}>{children}</select>
      <ChevronDown size={16} />
    </label>
  )
}

export function FormGroup({ label, hint, wide, children }: { label: string; hint?: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={`form-group ${wide ? "wide" : ""}`}>
      <label>{label}</label>
      {children}
      {hint && <small>{hint}</small>}
    </div>
  )
}

export type Tone = "success" | "warning" | "danger" | "info" | "neutral"
/** Roles are named by the owner, so each one gets a steady colour from its name. */
export function roleTone(role: string | null, isOwner = false): Tone {
  if (isOwner) return "warning"
  if (!role) return "neutral"
  const tones: Tone[] = ["info", "success", "neutral"]
  let h = 0
  for (const ch of role) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return tones[h % tones.length]
}
export function RoleBadge({ role, isOwner = false }: { role: string | null; isOwner?: boolean }) {
  return <Badge tone={roleTone(role, isOwner)}>{role ?? "Not in the shop"}</Badge>
}
export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>
}

export function CardHead({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="card-head">
      <div>
        <h3>{title}</h3>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

// Fixed star field and skyline for the page banners, so they look the same on every visit.
const SKY_RAND = (() => {
  let seed = 11
  return () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
})()
const HERO_STARS = Array.from({ length: 46 }, () => ({ x: SKY_RAND() * 1200, y: SKY_RAND() * 150, r: 0.6 + SKY_RAND() * 1.3, o: 0.3 + SKY_RAND() * 0.6 }))
const HERO_CITY = (() => {
  const blocks: { x: number; w: number; h: number; lit: [number, number][] }[] = []
  let x = 0
  while (x < 1200) {
    const w = 22 + SKY_RAND() * 46
    // taller towers towards the right, where the banner has free space
    const h = 14 + SKY_RAND() * (x > 700 ? 62 : 34)
    const lit: [number, number][] = []
    for (let wy = 220 - h + 6; wy < 214; wy += 8) for (let wx = x + 4; wx < x + w - 5; wx += 7) if (SKY_RAND() < 0.16) lit.push([wx, wy])
    blocks.push({ x, w, h, lit })
    x += w + SKY_RAND() * 4
  }
  return blocks
})()
const HERO_BURSTS = [
  { x: 1010, y: 62, r: 34, c: "#ffc233", d: "0s" },
  { x: 1120, y: 36, r: 22, c: "#ff6b9a", d: "1.6s" },
  { x: 880, y: 34, r: 16, c: "#4BB8FA", d: "3.1s" },
]

/** Night-sky decoration behind page banners: stars, a skyline and a few soft bursts. */
export function HeroSky() {
  return (
    <svg className="hero-sky" viewBox="0 0 1200 220" preserveAspectRatio="xMaxYMax slice" aria-hidden="true">
      {HERO_STARS.map((st, i) => (
        <circle key={i} cx={st.x} cy={st.y} r={st.r} fill="#fff" opacity={st.o} />
      ))}
      {HERO_BURSTS.map((b) => (
        <g key={b.x} className="hero-burst" style={{ animationDelay: b.d }}>
          <circle cx={b.x} cy={b.y} r={b.r * 0.85} fill={b.c} opacity=".12" />
          {Array.from({ length: 14 }, (_, i) => {
            const a = (i / 14) * Math.PI * 2
            const len = i % 2 ? b.r * 0.62 : b.r
            return <line key={i} x1={b.x + Math.cos(a) * b.r * 0.25} y1={b.y + Math.sin(a) * b.r * 0.25} x2={b.x + Math.cos(a) * len} y2={b.y + Math.sin(a) * len} stroke={b.c} strokeWidth="2" strokeLinecap="round" />
          })}
          <circle cx={b.x} cy={b.y} r="2.4" fill="#fff" />
        </g>
      ))}
      {HERO_CITY.map((bl) => (
        <g key={bl.x}>
          <rect x={bl.x} y={220 - bl.h} width={bl.w} height={bl.h} fill="#061430" opacity=".78" />
          {bl.lit.map(([wx, wy]) => (
            <rect key={wx + "-" + wy} x={wx} y={wy} width="2.6" height="3.2" fill="#ffd98a" opacity=".55" />
          ))}
        </g>
      ))}
    </svg>
  )
}

export function PageIntro({ eyebrow, title, subtitle, children }: { eyebrow: string; title: string; subtitle: string; children?: React.ReactNode }) {
  return (
    <div className="page-intro">
      <HeroSky />
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {children && <div className="intro-actions">{children}</div>}
    </div>
  )
}

export function Metric({
  icon: Icon,
  label,
  value,
  note,
  change,
  goodWhenUp = true,
  tone = "orange",
  onClick,
}: {
  icon: React.ElementType
  label: string
  value: string
  note?: string
  change?: number | null
  goodWhenUp?: boolean
  tone?: string
  onClick?: () => void
}) {
  const Tag = onClick ? "button" : "article"
  const good = (change ?? 0) >= 0 === goodWhenUp
  return (
    <Tag className={`metric-card ${onClick ? "clickable" : ""}`} onClick={onClick} type={onClick ? "button" : undefined}>
      <div className="metric-top">
        <span>{label}</span>
        <div className={`metric-icon tone-${tone}`}>
          <Icon size={18} />
        </div>
      </div>
      <strong>{value}</strong>
      <div className="metric-foot">
        {change !== undefined && change !== null && (
          <span className={good ? "up" : "down"}>
            {change >= 0 ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
            {Math.abs(change).toFixed(1)}%
          </span>
        )}
        {note && <small>{note}</small>}
      </div>
    </Tag>
  )
}

export function Modal({
  eyebrow,
  title,
  onClose,
  children,
  width,
}: {
  eyebrow?: string
  title: string
  onClose: () => void
  children: React.ReactNode
  width?: number
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={width ? { width: `min(${width}px, 100%)` } : undefined} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-title">
          <div>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h2>{title}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Confirm({
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: {
  title: string
  message: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void | Promise<void>
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  return (
    <Modal title={title} onClose={onClose} width={440}>
      <p className="modal-text">{message}</p>
      <div className="modal-actions">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant={danger ? "danger" : "primary"}
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            await onConfirm()
            setBusy(false)
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}

export function FormError({ message }: { message: string }) {
  return message ? <div className="error-message">{message}</div> : null
}

export function Pagination({ page, size, total, onPage, label }: { page: number; size: number; total: number; onPage: (p: number) => void; label: string }) {
  const pages = Math.max(1, Math.ceil(total / size))
  const first = total ? (page - 1) * size + 1 : 0
  return (
    <div className="table-footer">
      <span>
        Showing {first}–{Math.min(page * size, total)} of {total.toLocaleString()} {label}
      </span>
      <div>
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft size={16} />
        </button>
        <span className="page-count">
          Page {page} of {pages}
        </span>
        <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="state-box">
      <Loader2 className="spin" size={24} />
      <p>{label}</p>
    </div>
  )
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state-box state-error">
      <p>{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="state-box">
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  )
}

export function Avatar({ name, large }: { name: string; large?: boolean }) {
  return <div className={`avatar ${large ? "avatar-lg" : ""}`}>{initials(name)}</div>
}

/** Small rounded product picture for tables, lists and the cart. */
export function ProductTile({ category, name, size = 42 }: { category: string; name?: string; size?: number }) {
  return (
    <div className="product-tile" style={{ width: size, height: size }}>
      <ProductArt name={name ?? category} category={category} />
    </div>
  )
}

export function StockBar({ stock, min }: { stock: number; min: number }) {
  // The bar's full width is twice the minimum, so the marker always sits halfway.
  const pct = Math.min(100, (stock / Math.max(min * 2, 1)) * 100)
  const tone = stock === 0 ? "danger" : stock <= min ? "warning" : "success"
  return (
    <div className="stock-bar" title={`${stock} in stock, minimum ${min}`}>
      <i className={tone} style={{ width: `${pct}%` }} />
      <em />
    </div>
  )
}

export function Receipt({ sale, settings }: { sale: Sale; settings: Settings }) {
  const units = (sale.items ?? []).reduce((s, i) => s + i.qty, 0)
  return (
    <div className="receipt-paper">
      <div className="receipt-logo">
        <h2>{settings.business_name}</h2>
        <p>
          {settings.business_address}
          <br />
          {settings.contact_number}
          {settings.receipt_show_tin === "1" && settings.tin && (
            <>
              <br />
              TIN: {settings.tin}
            </>
          )}
        </p>
      </div>
      {sale.status === "Refunded" && <div className="receipt-void">REFUNDED</div>}
      <div className="receipt-meta">
        <span>Receipt no.</span>
        <b>{sale.txnNo}</b>
        <span>Date</span>
        <b>{fmtDateTime(sale.soldAt)}</b>
        {settings.receipt_show_cashier === "1" && (
          <>
            <span>Cashier</span>
            <b>{sale.cashier}</b>
          </>
        )}
      </div>
      <div className="receipt-items">
        {(sale.items ?? []).map((i) => (
          <div key={i.productId}>
            <span>
              {i.name}
              <small>
                {i.qty} × {peso(i.price)}
              </small>
            </span>
            <b>{peso(i.lineTotal)}</b>
          </div>
        ))}
      </div>
      <div className="receipt-totals">
        <div>
          <span>Subtotal ({units} items)</span>
          <b>{peso(sale.subtotal)}</b>
        </div>
        {sale.discountAmount > 0 && (
          <div>
            <span>Discount ({sale.discountPct}%)</span>
            <b>-{peso(sale.discountAmount)}</b>
          </div>
        )}
        <div>
          <span>VAT ({sale.taxRate}%)</span>
          <b>{peso(sale.taxAmount)}</b>
        </div>
        <div className="receipt-grand">
          <span>TOTAL</span>
          <b>{peso(sale.total)}</b>
        </div>
        <div>
          <span>Paid by</span>
          <b>{paymentLabel(sale)}</b>
        </div>
        {sale.method === "Cash" ? (
          <>
            <div>
              <span>Cash received</span>
              <b>{peso(sale.tendered ?? 0)}</b>
            </div>
            <div>
              <span>Change</span>
              <b>{peso(sale.changeDue ?? 0)}</b>
            </div>
          </>
        ) : (
          <>
            {sale.reference && (
              <div>
                <span>{sale.method === "Card" ? "Approval code" : "Reference no."}</span>
                <b>{sale.reference}</b>
              </div>
            )}
            {sale.payerAccount && (
              <div>
                <span>{sale.method === "Card" ? "Card no." : "Paid from"}</span>
                <b>{sale.method === "Card" ? `**** ${sale.payerAccount}` : sale.payerAccount}</b>
              </div>
            )}
          </>
        )}
      </div>
      <div className="receipt-thanks">
        <strong>{settings.receipt_header}</strong>
        <span>{settings.receipt_footer}</span>
      </div>
    </div>
  )
}
