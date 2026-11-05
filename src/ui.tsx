import { useEffect, useState } from "react"
import { ArrowDownRight, ArrowUpRight, Box, ChevronDown, ChevronLeft, ChevronRight, CircleDot, Flame, Loader2, Package, Rocket, Sparkles, Star, Wind, X, Zap } from "lucide-react"
import { fmtDateTime, initials, peso, type Sale, type Settings } from "./lib"

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

export function PageIntro({ eyebrow, title, subtitle, children }: { eyebrow: string; title: string; subtitle: string; children?: React.ReactNode }) {
  return (
    <div className="page-intro">
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

const CATEGORY_STYLE: Record<string, [React.ElementType, string]> = {
  Rockets: [Rocket, "t1"],
  "Roman Candles": [Flame, "t2"],
  Sparklers: [Sparkles, "t3"],
  Fountains: [Wind, "t4"],
  "Aerial Fireworks": [Star, "t5"],
  "Ground Fireworks": [CircleDot, "t6"],
  "Assorted Fireworks": [Package, "t7"],
  Firecrackers: [Zap, "t8"],
}
export function ProductTile({ category, size = 42 }: { category: string; size?: number }) {
  const [Icon, tone] = CATEGORY_STYLE[category] ?? [Box, "t0"]
  return (
    <div className={`product-tile ${tone}`} style={{ width: size, height: size }}>
      <Icon size={size * 0.48} />
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
          <b>{sale.method}</b>
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
          sale.reference && (
            <div>
              <span>{sale.method === "Card" ? "Approval code" : "Reference no."}</span>
              <b>{sale.reference}</b>
            </div>
          )
        )}
      </div>
      <div className="receipt-thanks">
        <strong>{settings.receipt_header}</strong>
        <span>{settings.receipt_footer}</span>
      </div>
    </div>
  )
}
