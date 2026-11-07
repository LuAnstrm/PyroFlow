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
  KeyRound,
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
  Users,
  X,
} from "lucide-react"
import { api, AppContext, fmtDateTime, peso, type Alerts, type AppContextValue, type CartItem, type Page, type PageParams, type Permission, type Product, type Sale, type Settings, type User } from "./lib"
import { Avatar, Badge, Button, ErrorBox, Field, Loading, Logo, Modal, ProductTile, RoleBadge } from "./ui"
import { Dashboard } from "./pages/Dashboard"
import { POS } from "./pages/POS"
import { Inventory } from "./pages/Inventory"
import { ForecastPage } from "./pages/Forecast"
import { Transactions } from "./pages/Transactions"
import { Reports } from "./pages/Reports"
import { Team } from "./pages/Team"
import { SecurityPage } from "./pages/Security"
import { SettingsPage } from "./pages/Settings"
import { StaffOperations } from "./pages/StaffOperations"

type Can = AppContextValue["can"]
const NAV: { id: Page; label: string; icon: React.ElementType; show: (can: Can, isOwner: boolean) => boolean }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, show: () => true },
  { id: "pos", label: "Point of Sale", icon: ShoppingCart, show: (can) => can("sales.process") },
  { id: "inventory", label: "Inventory", icon: Boxes, show: (can) => can("inventory.view") },
  { id: "forecast", label: "Sales Forecasting", icon: TrendingUp, show: (can) => can("forecast.view") },
  { id: "transactions", label: "Transactions", icon: ReceiptText, show: (can) => can("transactions.all") || can("sales.process") },
  { id: "reports", label: "Reports & Analytics", icon: FileBarChart, show: (can) => can("reports.view") },
  { id: "staff", label: "Staff Operations", icon: Users, show: (can) => can("staff.operations") },
  { id: "team", label: "Team & Roles", icon: ShieldCheck, show: (_can, isOwner) => isOwner },
  { id: "security", label: "Security", icon: KeyRound, show: (_can, isOwner) => isOwner },
  { id: "settings", label: "Settings", icon: SettingsIcon, show: () => true },
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

function Notifications({ alerts, go, canRestock, isOwner }: { alerts: Alerts; go: AppContextValue["go"]; canRestock: boolean; isOwner: boolean }) {
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
          go("inventory", canRestock ? { stockFor: a.id } : { search: a.sku })
        }}
      >
        {canRestock ? "Restock" : "View"}
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
              {isOwner && (
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

function ProfileMenu({ user, go, logout, isOwner }: { user: User; go: AppContextValue["go"]; logout: () => void; isOwner: boolean }) {
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
              <RoleBadge role={user.role} isOwner={user.isOwner} />
            </div>
          </div>
          {user.lastLoginAt && <p className="profile-last">Signed in {fmtDateTime(user.lastLoginAt)}</p>}
          <button type="button" onClick={() => nav("settings", { section: "account" })}>
            <UserCog size={17} /> My account
          </button>
          {isOwner && (
            <button type="button" onClick={() => nav("team", { tab: "logins" })}>
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

function HelpDialog({ can, isOwner, onClose }: { can: Can; isOwner: boolean; onClose: () => void }) {
  const tips: [string, string][] = []
  if (can("sales.process")) tips.push(["Ring up a sale", "Open Point of Sale, click products to fill the cart, choose Cash, Online Payment or Card. For online and card payments, pick the exact name (GCash, Maya, Visa…), type the reference or approval code and add a photo of the payment. Then press Complete sale. The receipt opens ready to print."])
  if (can("sales.process") || can("transactions.all")) tips.push(["Reprint a receipt", "Open Transactions, press View on the sale, then Print receipt."])
  if (can("inventory.manage")) tips.push(["Restock a product", "Open Inventory and press Stock in on the product's row. Every change appears under Recent inventory movement."])
  if (can("forecast.view")) tips.push(["Plan your orders", "Sales Forecasting lists which products will run out and how many to order, based on your recorded sales."])
  if (can("staff.operations")) tips.push(["Check on your cashiers", "Staff Operations shows each cashier's sales for the day. Press Sales to see their transactions, or end their shift when they finish."])
  if (isOwner) tips.push(["Add someone to the shop", "They create their own account first. Then open Team & Roles, go to Invite codes, make a code for their role (for example Cashier), and give it to them. They enter it after signing in."], ["Make a role or change what it can do", "Open Team & Roles, then Roles. Add a role or edit one, and tick only the features that job needs."])
  tips.push(["Change your password", "Click your name at the top right, then My account."])
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
  const isOwner = user.isOwner
  const can = useCallback<Can>((permission: Permission) => user.permissions.includes(permission), [user.permissions])
  const nav = useMemo(() => NAV.filter((n) => n.show(can, isOwner)), [can, isOwner])
  const allowed = useMemo(() => nav.map((n) => n.id), [nav])
  const [requestedPage, setPage] = useState<Page>(() => readHash(allowed))
  // If an admin removes access while this page is open, fall back to the dashboard.
  const page = allowed.includes(requestedPage) ? requestedPage : "dashboard"
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

  // Picks up permission changes an admin has made since this person signed in.
  useEffect(() => {
    api<{ user: User | null }>("/auth/me")
      .then((r) => {
        if (r.user && r.user.permissions.join() + r.user.role + r.user.isOwner !== user.permissions.join() + user.role + user.isOwner) setUser(r.user)
      })
      .catch(() => {})
  }, [page, setUser, user.permissions, user.role])

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
    can,
    isOwner,
  }
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
              {can("inventory.view") && <Notifications alerts={alerts} go={go} canRestock={can("inventory.manage")} isOwner={isOwner} />}
              <ProfileMenu user={user} go={go} logout={logout} isOwner={isOwner} />
            </div>
          </header>
          <main className={`main-content ${page === "pos" ? "pos-content" : ""}`}>
            {page === "dashboard" && <Dashboard />}
            {page === "pos" && <POS cart={cart} setCart={setCart} />}
            {page === "inventory" && <Inventory key={paramKey} params={params} />}
            {page === "forecast" && <ForecastPage />}
            {page === "transactions" && <Transactions key={paramKey} params={params} />}
            {page === "reports" && <Reports />}
            {page === "staff" && <StaffOperations />}
            {page === "team" && <Team key={paramKey} params={params} />}
            {page === "security" && <SecurityPage />}
            {page === "settings" && <SettingsPage key={paramKey} params={params} />}
          </main>
        </div>
        {search && <SearchDialog onClose={() => setSearch(false)} go={go} />}
        {help && <HelpDialog can={can} isOwner={isOwner} onClose={() => setHelp(false)} />}
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
