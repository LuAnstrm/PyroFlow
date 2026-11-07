import { useEffect, useState } from "react"
import { Bell, Wallet, Check, ChevronRight, CircleCheck, CircleX, CircleDollarSign, Flame, LogOut, ReceiptText, UserCog } from "lucide-react"
import { api, fmtDateTime, money, useApp, useFetch, type PageParams, type Sale, type Settings as SettingsMap } from "../lib"
import { Avatar, Badge, Button, Card, CardHead, Field, FormError, FormGroup, PageIntro, Receipt, RoleBadge } from "../ui"

const SECTIONS = [
  { id: "shop", label: "Business details", icon: Flame, ownerOnly: true },
  { id: "receipt", label: "Receipts", icon: ReceiptText, ownerOnly: true },
  { id: "tax", label: "Tax", icon: CircleDollarSign, ownerOnly: true },
  { id: "alerts", label: "Inventory alerts", icon: Bell, ownerOnly: true },
  { id: "payments", label: "Payments", icon: Wallet, ownerOnly: true },
  { id: "account", label: "My account", icon: UserCog, ownerOnly: false },
]

const SAMPLE_SALE: Sale = {
  id: 0,
  txnNo: "TXN-SAMPLE",
  soldAt: new Date().toISOString(),
  subtotal: 350,
  discountPct: 0,
  discountAmount: 0,
  taxRate: 12,
  taxAmount: 42,
  total: 392,
  method: "Cash",
  provider: null,
  tendered: 400,
  changeDue: 8,
  reference: null,
  payerAccount: null,
  hasProof: false,
  status: "Completed",
  refundedAt: null,
  refundReason: null,
  cashier: "Sample Cashier",
  items: [
    { productId: 1, name: "Sky Rocket", sku: "RKT-001", price: 150, qty: 2, lineTotal: 300 },
    { productId: 2, name: "Sparkler Pack", sku: "SPK-024", price: 50, qty: 1, lineTotal: 50 },
  ],
}

/** The sample receipt, worked out at the shop's own VAT rate so its figures add up. */
function previewSale(taxRate: number): Sale {
  const taxAmount = money((SAMPLE_SALE.subtotal * taxRate) / 100)
  const total = money(SAMPLE_SALE.subtotal + taxAmount)
  const tendered = Math.ceil(total / 100) * 100
  return { ...SAMPLE_SALE, taxRate, taxAmount, total, tendered, changeDue: money(tendered - total) }
}

function Toggle({ title, help, checked, onChange }: { title: string; help: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="toggle-row">
      <div>
        <b>{title}</b>
        <span>{help}</span>
      </div>
      <label className="toggle">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={title} />
        <i />
      </label>
    </div>
  )
}

function MyAccount() {
  const { user, setUser, toast, logout, settings } = useApp()
  const passwordMin = Number(settings.security_password_min) || 8
  const [name, setName] = useState(user.name)
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const logins = useFetch<{ id: number; success: number; reason: string | null; device: string | null; loginAt: string; logoutAt: string | null }[]>("/account/logins")

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const r = await api("/account", { method: "PUT", body: { name } })
      setUser(r.user)
      toast("Name updated.")
    } catch (err: any) {
      toast(err.message, "danger")
    }
  }
  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (next !== confirm) return setError("The new passwords don't match.")
    try {
      await api("/account/password", { method: "POST", body: { current, next } })
      setCurrent("")
      setNext("")
      setConfirm("")
      toast("Password changed.")
    } catch (err: any) {
      setError(err.message)
    }
  }
  return (
    <>
      <Card className="account-head">
        <Avatar name={user.name} large />
        <div>
          <h3>{user.name}</h3>
          <p>
            @{user.username} · <RoleBadge role={user.role} isOwner={user.isOwner} />
          </p>
        </div>
        <Button variant="danger" onClick={logout}>
          <LogOut size={17} /> Log out
        </Button>
      </Card>
      <Card>
        <CardHead title="Profile" subtitle="Your name appears on receipts you ring up" />
        <form onSubmit={saveName} className="inline-form">
          <FormGroup label="Full name">
            <Field value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
          </FormGroup>
          <Button type="submit" disabled={!name.trim() || name === user.name}>
            Save name
          </Button>
        </form>
      </Card>
      <Card>
        <CardHead title="Change password" />
        <form onSubmit={savePassword}>
          <div className="form-grid">
            <FormGroup label="Current password" wide>
              <Field type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
            </FormGroup>
            <FormGroup label="New password" hint={`At least ${passwordMin} characters.`}>
              <Field type="password" value={next} onChange={(e) => setNext(e.target.value)} minLength={passwordMin} maxLength={72} required autoComplete="new-password" />
            </FormGroup>
            <FormGroup label="Repeat new password">
              <Field type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={passwordMin} maxLength={72} required autoComplete="new-password" />
            </FormGroup>
          </div>
          <FormError message={error} />
          <div className="settings-actions">
            <Button type="submit">Change password</Button>
          </div>
        </form>
      </Card>
      <Card>
        <CardHead title="Your recent logins" subtitle="If you don't recognise one, change your password" />
        <div className="line-list">
          {logins.data?.map((l) => (
            <div key={l.id}>
              <span className="login-line">
                {l.success ? <CircleCheck size={15} className="ok" /> : <CircleX size={15} className="bad" />}
                {fmtDateTime(l.loginAt)}
              </span>
              <small>{l.success ? l.device : l.reason}</small>
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}

export function SettingsPage({ params }: { params: PageParams }) {
  const { isOwner, settings, reloadSettings, reloadAlerts, toast } = useApp()
  const sections = SECTIONS.filter((s) => isOwner || !s.ownerOnly)
  const [section, setSection] = useState(params.section && sections.some((s) => s.id === params.section) ? params.section : sections[0].id)
  const [draft, setDraft] = useState<SettingsMap>(settings)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  useEffect(() => setDraft(settings), [settings])

  const set = (key: string, value: string) => setDraft((d) => ({ ...d, [key]: value }))
  const text = (key: string) => ({ value: draft[key] ?? "", onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(key, e.target.value) })
  const flag = (key: string) => ({ checked: draft[key] === "1", onChange: (v: boolean) => set(key, v ? "1" : "0") })
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError("")
    try {
      await api("/settings", { method: "PUT", body: draft })
      reloadSettings()
      reloadAlerts()
      toast("Settings saved.")
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  const active = sections.find((s) => s.id === section)!
  const saveBar = (
    <div className="settings-actions">
      <FormError message={error} />
      {dirty && (
        <Button variant="ghost" onClick={() => setDraft(settings)}>
          Discard
        </Button>
      )}
      <Button type="submit" disabled={busy || !dirty}>
        <Check size={16} /> Save changes
      </Button>
    </div>
  )

  return (
    <div className="page-stack">
      <PageIntro eyebrow="CONFIGURATION" title="Settings" subtitle={isOwner ? "Manage business details, receipts, alerts, and your account." : "Manage your account."} />
      <div className={`settings-layout ${sections.length === 1 ? "single" : ""}`}>
        {sections.length > 1 && (
          <aside className="settings-nav">
            {sections.map((s) => (
              <button type="button" className={section === s.id ? "active" : ""} key={s.id} onClick={() => setSection(s.id)}>
                <s.icon size={18} />
                <span>{s.label}</span>
                <ChevronRight size={15} />
              </button>
            ))}
          </aside>
        )}
        <div className="settings-content">
          {section === "account" ? (
            <MyAccount />
          ) : (
            <form onSubmit={save}>
              {section === "shop" && (
                <Card>
                  <CardHead title={active.label} subtitle="Shown across the POS and on printed receipts" />
                  <div className="form-grid">
                    <FormGroup label="Business name" wide>
                      <Field {...text("business_name")} required />
                    </FormGroup>
                    <FormGroup label="Business address" wide>
                      <Field {...text("business_address")} />
                    </FormGroup>
                    <FormGroup label="Branch name">
                      <Field {...text("branch_name")} />
                    </FormGroup>
                    <FormGroup label="Contact number">
                      <Field {...text("contact_number")} />
                    </FormGroup>
                    <FormGroup label="Email address">
                      <Field {...text("email")} type="email" />
                    </FormGroup>
                    <FormGroup label="Tax identification no. (TIN)">
                      <Field {...text("tin")} />
                    </FormGroup>
                  </div>
                  {saveBar}
                </Card>
              )}
              {section === "receipt" && (
                <div className="receipt-settings">
                  <Card>
                    <CardHead title={active.label} subtitle="Choose what customers see on their receipt" />
                    <div className="form-grid">
                      <FormGroup label="Thank-you message" wide>
                        <Field {...text("receipt_header")} maxLength={120} />
                      </FormGroup>
                      <FormGroup label="Footer note" wide>
                        <Field {...text("receipt_footer")} maxLength={160} />
                      </FormGroup>
                    </div>
                    <Toggle title="Show cashier name" help="Prints who rang up the sale." {...flag("receipt_show_cashier")} />
                    <Toggle title="Show TIN" help="Prints your tax identification number." {...flag("receipt_show_tin")} />
                    <Toggle title="Print automatically" help="Opens the print window right after each sale." {...flag("receipt_auto_print")} />
                    {saveBar}
                  </Card>
                  <div>
                    <p className="preview-label">Preview</p>
                    <div className="receipt-preview">
                      <Receipt sale={previewSale(Number(draft.tax_rate) || 0)} settings={draft} />
                    </div>
                  </div>
                </div>
              )}
              {section === "tax" && (
                <Card>
                  <CardHead title={active.label} subtitle="Added on top of the discounted price of each new sale" />
                  <div className="form-grid">
                    <FormGroup label="VAT rate (%)" hint="Philippine VAT is normally 12%. Past sales keep the rate they were sold at.">
                      <Field {...text("tax_rate")} type="number" min="0" max="50" step="0.01" required />
                    </FormGroup>
                  </div>
                  {saveBar}
                </Card>
              )}
              {section === "payments" && (
                <Card>
                  <CardHead title={active.label} subtitle="How online and card payments are recorded at the Point of Sale" />
                  <Toggle
                    title="Require a photo of online payments"
                    help="The cashier must take a photo or upload a screenshot of the GCash, Maya or bank confirmation before the sale can be completed. Card payments can always add a photo of the terminal slip."
                    {...flag("require_payment_proof")}
                  />
                  {saveBar}
                </Card>
              )}
              {section === "alerts" && (
                <Card>
                  <CardHead title={active.label} subtitle="Each product's minimum stock is set in Inventory, under Edit" />
                  <Toggle title="Low-stock notifications" help="Shows the bell count, sidebar badge and dashboard banner when a product is at or below its minimum." {...flag("low_stock_alerts")} />
                  <Toggle title="Warn the cashier after a sale" help="Pops up a message when a sale pushes a product to low or out of stock." {...flag("alert_after_sale")} />
                  {saveBar}
                </Card>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
