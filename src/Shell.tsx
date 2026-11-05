import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  Bell,
  Boxes,
  Check,
  ChevronDown,
  ChevronRight,
  FileBarChart,
  Flame,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageX,
  ReceiptText,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  ShoppingCart,
  TrendingUp,
  UserCog,
  X,
} from "lucide-react"
import { api, AppContext, fmtDateTime, peso, type Alerts, type AppContextValue, type CartItem, type Page, type PageParams, type Product, type Role, type Sale, type Settings, type User } from "./lib"
import { Avatar, Badge, Button, ErrorBox, Field, Loading, Logo, Modal, ProductTile } from "./ui"
import { Dashboard } from "./pages/Dashboard"
import { POS } from "./pages/POS"
import { Inventory } from "./pages/Inventory"
import { ForecastPage } from "./pages/Forecast"
import { Transactions } from "./pages/Transactions"
import { Reports } from "./pages/Reports"
import { Accounts } from "./pages/Accounts"
import { SettingsPage } from "./pages/Settings"

const ALL: Role[] = ["Administrator", "Owner", "Staff"]
const NAV: { id: Page; label: string; icon: React.ElementType; roles: Role[] }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ALL },
  { id: "pos", label: "Point of Sale", icon: ShoppingCart, roles: ALL },
  { id: "inventory", label: "Inventory", icon: Boxes, roles: ALL },
  { id: "forecast", label: "Sales Forecasting", icon: TrendingUp, roles: ["Administrator", "Owner"] },
  { id: "transactions", label: "Transactions", icon: ReceiptText, roles: ALL },
  { id: "reports", label: "Reports & Analytics", icon: FileBarChart, roles: ["Administrator", "Owner"] },
  { id: "accounts", label: "Accounts & Logins", icon: ShieldCheck, roles: ["Administrator"] },
  { id: "settings", label: "Settings", icon: SettingsIcon, roles: ALL },
]

function usePopover() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])
  return { open, setOpen, ref }
}

function Notifications({ alerts, go, isManager }: { alerts: Alerts; go: AppContextValue["go"]; isManager: boolean }) {
  const { open, setOpen, ref } = usePopover()
  const out = alerts.items.filter((a) => a.level === "out")
  const low = alerts.items.filter((a) => a.level === "low")
  const count = alerts.enabled ? alerts.items.length : 0
  const row = (a: Alerts["items"][number]) => (
    <div className="notif-row" key={a.id}>
      <ProductTile category={a.category} size={36} />
      <div>
        <strong>{a.name}</strong>
        <span>
          {a.stock === 0 ? "None left" : `${a.stock} left`} · minimum {a.min}
          {a.stock > 0 && a.daysLeft !== null && ` · about ${a.daysLeft} ${a.daysLeft === 1 ? "day" : "days"} of sales`}
        </span>
      </div>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => {
          setOpen(false)
          go("inventory", isManager ? { stockFor: a.id } : { search: a.sku })
        }}
      >
        {isManager ? "Restock" : "View"}
      </Button>
    </div>
  )
  return (
    <div className="popover-anchor" ref={ref}>
      <button type="button" className="icon-button notification" onClick={() => setOpen(!open)} aria-label={`Notifications, ${count} stock alerts`} aria-expanded={open}>
        <Bell size={19} />
        {count > 0 && <b>{count}</b>}
      </button>
      {open && (
        <div className="popover notif-panel">
          <div className="popover-head">
            <strong>Stock alerts</strong>
            {count > 0 && <Badge tone="danger">{count} need action</Badge>}
          </div>
          {!alerts.enabled ? (
            <div className="popover-empty">
              <Bell size={22} />
              <p>Low-stock alerts are turned off.</p>
              {isManager && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setOpen(false)
                    go("settings", { section: "alerts" })
                  }}
                >
                  Turn on in Settings
                </Button>
              )}
            </div>
          ) : !count ? (
            <div className="popover-empty">
              <Check size={22} />
              <p>All products are above their minimum stock.</p>
            </div>
          ) : (
            <div className="notif-list">
              {out.length > 0 && (
                <>
                  <div className="notif-group danger">
                    <PackageX size={15} /> Out of stock ({out.length}): can't be sold
                  </div>
                  {out.map(row)}
                </>
              )}
              {low.length > 0 && (
                <>
                  <div className="notif-group warning">
                    <AlertTriangle size={15} /> Low stock ({low.length}): at or below minimum
                  </div>
                  {low.map(row)}
                </>
              )}
            </div>
          )}
          <button
            type="button"
            className="popover-foot"
            onClick={() => {
              setOpen(false)
              go("inventory", { status: "attention" })
            }}
          >
            Open inventory <ChevronRight size={15} />
          </button>
        </div>
      )}
    </div>
  )
}

function ProfileMenu({ user, go, logout, isAdmin }: { user: User; go: AppContextValue["go"]; logout: () => void; isAdmin: boolean }) {
  const { open, setOpen, ref } = usePopover()
  const nav = (page: Page, params?: PageParams) => {
    setOpen(false)
    go(page, params)
  }
  return (
    <div className="popover-anchor" ref={ref}>
      <button type="button" className="profile" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Account menu">
        <Avatar name={user.name} />
        <span>
          <strong>{user.name}</strong>
          <small>{user.role}</small>
        </span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="popover profile-menu">
          <div className="profile-summary">
            <Avatar name={user.name} large />
            <div>
              <strong>{user.name}</strong>
              <span>@{user.username}</span>
              <Badge tone={user.role === "Administrator" ? "danger" : user.role === "Owner" ? "warning" : "info"}>{user.role}</Badge>
            </div>
          </div>
          {user.lastLoginAt && <p className="profile-last">Signed in {fmtDateTime(user.lastLoginAt)}</p>}
          <button type="button" onClick={() => nav("settings", { section: "account" })}>
            <UserCog size={17} /> My account
          </button>
          {isAdmin && (
            <button type="button" onClick={() => nav("accounts", { tab: "logins" })}>
              <ShieldCheck size={17} /> Login history
            </button>
          )}
          <button type="button" className="danger" onClick={logout}>
            <LogOut size={17} /> Log out
          </button>
        </div>
      )}
    </div>
  )
}

function SearchDialog({ onClose, go }: { onClose: () => void; go: AppContextValue["go"] }) {
  const [q, setQ] = useState("")
  const [results, setResults] = useState<{ products: Product[]; sales: Sale[] }>({ products: [], sales: [] })
  useEffect(() => {
    if (!q.trim()) {
      setResults({ products: [], sales: [] })
      return
    }
    const t = setTimeout(() => {
      api(`/search?q=${encodeURIComponent(q)}`)
        .then(setResults)
        .catch(() => {})
    }, 200)
    return () => clearTimeout(t)
  }, [q])
  const nothing = q.trim() && !results.products.length && !results.sales.length
  return (
    <Modal title="Search" onClose={onClose} width={520}>
      <Field icon={Search} autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Product name, SKU, category or transaction no." />
      <div className="search-results">
        {nothing && <p className="search-empty">Nothing matches "{q}".</p>}
        {results.products.map((p) => (
          <button
            type="button"
            key={p.id}
            onClick={() => {
              onClose()
              go("inventory", { search: p.sku })
            }}
          >
            <ProductTile category={p.category} size={34} />
            <span>
              <b>{p.name}</b>
              <small>
                {p.sku} · {p.stock} in stock
              </small>
            </span>
            <ChevronRight size={15} />
          </button>
        ))}
        {results.sales.map((s) => (
          <button
            type="button"
            key={s.id}
            onClick={() => {
              onClose()
              go("transactions", { saleId: s.id })
            }}
          >
            <div className="search-icon">
              <ReceiptText size={17} />
            </div>
            <span>
              <b>{s.txnNo}</b>
              <small>
                {peso(s.total)} · {fmtDateTime(s.soldAt)}
              </small>
            </span>
            <ChevronRight size={15} />
          </button>
        ))}
      </div>
    </Modal>
  )
}

function HelpDialog({ role, onClose }: { role: Role; onClose: () => void }) {
  const tips: [string, string][] = [
    ["Ring up a sale", "Open Point of Sale, click products to fill the cart, choose Cash, Online Payment or Card, then press Complete sale. The receipt opens ready to print."],
    ["Reprint a receipt", "Open Transactions, press View on the sale, then Print receipt."],
    ["Change your password", "Click your name at the top right, then My account."],
  ]
  if (role !== "Staff") {
    tips.push(
      ["Restock a product", "Open Inventory and press Stock in on the product's row. Every change appears under Recent inventory movement."],
      ["Plan your orders", "Sales Forecasting lists which products will run out and how many to order, based on your recorded sales."],
    )
  }
  if (role === "Administrator") tips.push(["Add an account", "Open Accounts & Logins and press Add account. The Login history tab shows everyone who has signed in."])
  return (
    <Modal eyebrow="HELP" title="How do I…?" onClose={onClose} width={520}>
      <div className="help-list">
        {tips.map(([t, d]) => (
          <div key={t}>
            <b>{t}</b>
            <p>{d}</p>
          </div>
        ))}
      </div>
      <div className="modal-actions">
        <Button onClick={onClose}>Close</Button>
      </div>
    </Modal>
  )
}

function readHash(allowed: Page[]): Page {
  const page = window.location.hash.slice(1) as Page
  return allowed.includes(page) ? page : "dashboard"
}

export function Shell({ user, setUser, onLoggedOut }: { user: User; setUser: (u: User) => void; onLoggedOut: () => void }) {
  const allowed = useMemo(() => NAV.filter((n) => n.roles.includes(user.role)).map((n) => n.id), [user.role])
  const [page, setPage] = useState<Page>(() => readHash(allowed))
  const [params, setParams] = useState<PageParams>({})
  const [sidebar, setSidebar] = useState(false)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [alerts, setAlerts] = useState<Alerts>({ enabled: true, items: [] })
  const [toasts, setToasts] = useState<{ id: number; message: string; tone: string }[]>([])
  const [search, setSearch] = useState(false)
  const [help, setHelp] = useState(false)
  const [cart, setCart] = useState<CartItem[]>([])
  const [loadError, setLoadError] = useState("")

  const reloadSettings = useCallback(() => {
    api<Settings>("/settings")
      .then(setSettings)
      .catch((e) => setLoadError(e.message))
  }, [])
  const reloadAlerts = useCallback(() => {
    api<Alerts>("/alerts")
      .then(setAlerts)
      .catch(() => {})
  }, [])
  useEffect(() => {
    reloadSettings()
    reloadAlerts()
  }, [reloadSettings, reloadAlerts])

  useEffect(() => {
    const onHash = () => setPage(readHash(allowed))
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [allowed])

  const toast = useCallback<AppContextValue["toast"]>((message, tone = "success") => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, message, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000)
  }, [])
  const go = useCallback<AppContextValue["go"]>((next, nextParams = {}) => {
    setParams({ ...nextParams, nonce: Date.now() })
    setPage(next)
    setSidebar(false)
    window.location.hash = next
    window.scrollTo(0, 0)
  }, [])
  const logout = useCallback(async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {})
    onLoggedOut()
  }, [onLoggedOut])

  if (!settings) {
    return (
      <div className="boot-screen">
        {loadError ? (
          <ErrorBox
            message={loadError}
            onRetry={() => {
              setLoadError("")
              reloadSettings()
              reloadAlerts()
            }}
          />
        ) : (
          <Loading />
        )}
      </div>
    )
  }

  const ctx: AppContextValue = {
    user,
    setUser,
    settings,
    reloadSettings,
    alerts,
    reloadAlerts,
    toast,
    go,
    logout,
    isManager: user.role !== "Staff",
    isAdmin: user.role === "Administrator",
  }
  const nav = NAV.filter((n) => n.roles.includes(user.role))
  const alertCount = alerts.enabled ? alerts.items.length : 0
  const paramKey = JSON.stringify(params)

  return (
    <AppContext.Provider value={ctx}>
      <div className="app-shell">
        <aside className={`sidebar ${sidebar ? "sidebar-open" : ""}`}>
          <div className="sidebar-brand">
            <Logo />
            <button type="button" onClick={() => setSidebar(false)} className="mobile-close" aria-label="Close menu">
              <X size={20} />
            </button>
          </div>
          <div className="store-status">
            <div className="store-icon">
              <Flame size={18} />
            </div>
            <div>
              <strong>{settings.branch_name}</strong>
              <span>{settings.business_name}</span>
            </div>
          </div>
          <nav>
            {nav.map((item) => (
              <button type="button" key={item.id} className={page === item.id ? "active" : ""} onClick={() => go(item.id)}>
                <item.icon size={19} />
                <span>{item.label}</span>
                {item.id === "inventory" && alertCount > 0 && <b>{alertCount}</b>}
              </button>
            ))}
          </nav>
          <button type="button" className="sidebar-help" onClick={() => setHelp(true)}>
            <HelpCircle size={19} />
            <span>Help</span>
            <ChevronRight size={16} />
          </button>
          <button type="button" className="logout" onClick={logout}>
            <LogOut size={19} />
            <span>Log out</span>
          </button>
        </aside>
        {sidebar && <div className="sidebar-backdrop" onClick={() => setSidebar(false)} />}
        <div className="main-shell">
          <header className="topbar">
            <div className="topbar-title">
              <button type="button" className="menu-button" onClick={() => setSidebar(true)} aria-label="Open menu">
                <Menu size={22} />
              </button>
              <h2>{NAV.find((n) => n.id === page)?.label}</h2>
            </div>
            <div className="topbar-actions">
              <button type="button" className="icon-button" onClick={() => setSearch(true)} aria-label="Search">
                <Search size={19} />
              </button>
              <Notifications alerts={alerts} go={go} isManager={ctx.isManager} />
              <ProfileMenu user={user} go={go} logout={logout} isAdmin={ctx.isAdmin} />
            </div>
          </header>
          <main className={`main-content ${page === "pos" ? "pos-content" : ""}`}>
            {page === "dashboard" && <Dashboard />}
            {page === "pos" && <POS cart={cart} setCart={setCart} />}
            {page === "inventory" && <Inventory key={paramKey} params={params} />}
            {page === "forecast" && <ForecastPage />}
            {page === "transactions" && <Transactions key={paramKey} params={params} />}
            {page === "reports" && <Reports />}
            {page === "accounts" && <Accounts key={paramKey} params={params} />}
            {page === "settings" && <SettingsPage key={paramKey} params={params} />}
          </main>
        </div>
        {search && <SearchDialog onClose={() => setSearch(false)} go={go} />}
        {help && <HelpDialog role={user.role} onClose={() => setHelp(false)} />}
        <div className="toasts" role="status">
          {toasts.map((t) => (
            <div className={`toast toast-${t.tone}`} key={t.id}>
              {t.tone === "success" ? <Check size={17} /> : <AlertTriangle size={17} />}
              <span>{t.message}</span>
            </div>
          ))}
        </div>
      </div>
    </AppContext.Provider>
  )
}
