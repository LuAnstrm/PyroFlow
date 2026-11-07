import { createContext, useCallback, useContext, useEffect, useState } from "react"

export type Page = "dashboard" | "pos" | "inventory" | "forecast" | "transactions" | "reports" | "staff" | "team" | "security" | "settings"
export type Permission =
  | "sales.process"
  | "transactions.all"
  | "transactions.refund"
  | "sales.monitor"
  | "inventory.view"
  | "inventory.manage"
  | "products.edit"
  | "products.pricing"
  | "products.remove"
  | "reports.view"
  | "forecast.view"
  | "staff.operations"
/** role is null until the person joins the shop with an invite code. */
export type User = { id: number; name: string; username: string; role: string | null; roleId: number | null; isOwner: boolean; permissions: Permission[]; lastLoginAt: string | null; createdAt: string }
export type Product = {
  id: number
  name: string
  sku: string
  category: string
  price: number
  cost?: number
  stock: number
  min: number
  sold30: number
}
export type CartItem = Product & { qty: number }
export type SaleItem = { productId: number; name: string; sku: string; price: number; qty: number; lineTotal: number }
export type Sale = {
  id: number
  txnNo: string
  soldAt: string
  subtotal: number
  discountPct: number
  discountAmount: number
  taxRate: number
  taxAmount: number
  total: number
  method: PaymentMethod
  /** GCash, Maya, BDO, Visa, and so on. Empty for cash. */
  provider: string | null
  tendered: number | null
  changeDue: number | null
  reference: string | null
  /** Who paid online (name or number), or the last 4 digits of a card. */
  payerAccount: string | null
  hasProof: number | boolean
  status: "Completed" | "Refunded"
  refundedAt: string | null
  refundReason: string | null
  cashier: string
  units?: number
  items?: SaleItem[]
}
export type PaymentMethod = "Cash" | "Online Payment" | "Card"
export type Settings = Record<string, string>
export type AlertItem = {
  id: number
  name: string
  sku: string
  category: string
  stock: number
  min: number
  level: "out" | "low"
  daysLeft: number | null
  suggested: number
}
export type Alerts = { enabled: boolean; items: AlertItem[] }
export type Paged<T> = { rows: T[]; total: number; page: number; size: number }
export type ForecastPoint = { date: string; predicted: number; low: number; high: number }
export type HistoryPoint = { date: string; actual: number }
export type ProductForecast = {
  id: number
  name: string
  sku: string
  category: string
  stock: number
  min: number
  soldLast28: number
  expectedUnits: number
  daysOfCover: number | null
  runsOutOn: string | null
  reorder: number
  action: "Out of stock" | "Order now" | "Order soon" | "Enough stock"
}

export class ApiError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

let onSessionEnded: () => void = () => {}
export const setSessionEndedHandler = (fn: () => void) => {
  onSessionEnded = fn
}

export async function api<T = any>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method: options.method ?? "GET",
      headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  } catch {
    throw new ApiError("Can't reach the server. Is `npm run dev` still running?", 0, "DB_DOWN")
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    if (!data) throw new ApiError("Can't reach the server. Is `npm run dev` still running?", res.status, "DB_DOWN")
    if (res.status === 401 && !path.startsWith("/auth/")) onSessionEnded()
    throw new ApiError(data.error ?? "Something went wrong.", res.status, data.code)
  }
  return data as T
}

export function useFetch<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!path) return
    let live = true
    setLoading(true)
    api<T>(path)
      .then((d) => {
        if (!live) return
        setData(d)
        setError("")
      })
      .catch((e) => live && setError(e.message))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [path, tick])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, error, loading, reload }
}

export type PageParams = { stockFor?: number; search?: string; saleId?: number; section?: string; status?: string; tab?: string; cashier?: number; date?: string; nonce?: number }
export type AppContextValue = {
  user: User
  setUser: (u: User) => void
  settings: Settings
  reloadSettings: () => void
  alerts: Alerts
  reloadAlerts: () => void
  toast: (message: string, tone?: "success" | "warning" | "danger") => void
  go: (page: Page, params?: PageParams) => void
  logout: () => void
  /** Shapes what the screen offers. The server checks every permission again. */
  can: (permission: Permission) => boolean
  isOwner: boolean
}
export const AppContext = createContext<AppContextValue | null>(null)
export const useApp = () => useContext(AppContext)!

/** Rounds to centavos, the same way the server does when it records a sale. */
export const money = (n: number) => Math.round(n * 100) / 100

const numberFormat = (digits: number) => new Intl.NumberFormat("en-PH", { minimumFractionDigits: digits, maximumFractionDigits: digits })
const two = numberFormat(2)
const zero = numberFormat(0)
export const peso = (n: number) => `₱${two.format(n)}`
export const peso0 = (n: number) => `₱${zero.format(n)}`
export const num = (n: number) => zero.format(n)
export function pesoShort(n: number) {
  if (Math.abs(n) >= 1e6) return `₱${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M`
  if (Math.abs(n) >= 1e3) return `₱${(n / 1e3).toFixed(1).replace(/\.0$/, "")}k`
  return `₱${zero.format(n)}`
}

/** Reads "YYYY-MM-DD" as a local date (new Date() alone would read it as UTC). */
export function fromKey(key: string) {
  const [y, m, d] = key.split("-").map(Number)
  return new Date(y, m - 1, d || 1)
}
export function toKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
export const fmtDay = (key: string) => fromKey(key).toLocaleDateString("en-PH", { month: "short", day: "numeric" })
export const fmtDayLong = (key: string) => fromKey(key).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" })
export const fmtMonth = (key: string) => fromKey(key).toLocaleDateString("en-PH", { month: "short", year: "numeric" })
export const fmtDate = (v: string | Date) => new Date(v).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })
export const fmtTime = (v: string | Date) => new Date(v).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })
export const fmtDateTime = (v: string | Date) => `${fmtDate(v)}, ${fmtTime(v)}`
export function timeAgo(v: string | Date) {
  const mins = Math.round((Date.now() - new Date(v).getTime()) / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins} min ago`
  if (mins < 1440) return `${Math.round(mins / 60)} hr ago`
  if (mins < 2880) return "yesterday"
  return fmtDate(v)
}
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    let s = String(v ?? "")
    // Excel runs text starting with these as a formula. Text like product names and
    // login usernames is typed by people, so it's marked as plain text with a quote.
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  // The BOM makes Excel read the ₱ sign correctly.
  const blob = new Blob(["﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** The payment by name: "GCash", "Visa card", or "Cash". Older sales without a provider show the method. */
export const paymentLabel = (s: { method: PaymentMethod; provider: string | null }) => (!s.provider ? s.method : s.method === "Card" && !/card$/i.test(s.provider) ? `${s.provider} card` : s.provider)

export function stockStatus(p: { stock: number; min: number }) {
  if (p.stock === 0) return { label: "Out of stock", tone: "danger" as const }
  if (p.stock <= p.min) return { label: "Low stock", tone: "warning" as const }
  return { label: "In stock", tone: "success" as const }
}
