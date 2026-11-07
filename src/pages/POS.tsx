import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { Camera, Check, CreditCard, Globe, LayoutGrid, Minus, Plus, Printer, Search, ShoppingCart, Trash2, Wallet, X } from "lucide-react"
import { api, fmtTime, money, peso, useApp, useFetch, type AlertItem, type CartItem, type PaymentMethod, type Product, type Sale } from "../lib"
import { Badge, Button, ErrorBox, Field, FormError, Loading, Modal, ProductTile, Receipt, Select, Empty } from "../ui"
import { ProductArt } from "../productArt"

type PaymentOptions = { online: string[]; card: string[] }
const OTHER = "__other"
const BANKS = new Set(["BDO", "BPI", "UnionBank", "Metrobank", "Landbank", "Security Bank"])
// Kept under the server's limit, which is small because XAMPP's MySQL takes 1 MB per statement.
const MAX_PHOTO_BYTES = 550 * 1024

/** Reads a photo or screenshot and shrinks it to a JPEG small enough to store with the sale. */
async function shrinkPhoto(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error("Couldn't read that file."))
    reader.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = () => reject(new Error("That file isn't a photo the browser can open. Use a JPEG or PNG."))
    i.src = dataUrl
  })
  let longest = 1400
  for (let attempt = 0; attempt < 6; attempt++) {
    const scale = Math.min(1, longest / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    const ctx = canvas.getContext("2d")!
    ctx.fillStyle = "#fff"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const out = canvas.toDataURL("image/jpeg", 0.8)
    if ((out.length - out.indexOf(",") - 1) * 0.75 <= MAX_PHOTO_BYTES) return out
    longest = Math.round(longest * 0.75)
  }
  throw new Error("That photo is too large. Try a screenshot instead.")
}

function PhotoPicker({ value, onChange, required, label }: { value: string; onChange: (v: string) => void; required: boolean; label: string }) {
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setBusy(true)
    setError("")
    try {
      onChange(await shrinkPhoto(file))
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="proof-picker">
      {value ? (
        <div className="proof-thumb">
          <img src={value} alt="Payment proof" />
          <span>
            <b>Photo added</b>
            <small>Saved with the sale</small>
          </span>
          <button type="button" onClick={() => onChange("")} aria-label="Remove photo">
            <X size={16} />
          </button>
        </div>
      ) : (
        <label className={`proof-button ${busy ? "busy" : ""}`}>
          <Camera size={17} />
          <span>{busy ? "Preparing photo…" : label}</span>
          {required ? <em>Required</em> : <small>Optional</small>}
          <input type="file" accept="image/*" onChange={pick} disabled={busy} />
        </label>
      )}
      {error && <small className="proof-error">{error}</small>}
    </div>
  )
}

const METHODS: { id: PaymentMethod; icon: React.ElementType }[] = [
  { id: "Cash", icon: Wallet },
  { id: "Online Payment", icon: Globe },
  { id: "Card", icon: CreditCard },
]

export function ReceiptDialog({ sale, onClose, autoPrint = false }: { sale: Sale; onClose: () => void; autoPrint?: boolean }) {
  const { settings } = useApp()
  useEffect(() => {
    if (!autoPrint) return
    const t = setTimeout(() => window.print(), 300)
    return () => clearTimeout(t)
  }, [autoPrint])
  return (
    <Modal eyebrow={sale.status === "Refunded" ? "REFUNDED SALE" : "RECEIPT"} title={sale.txnNo} onClose={onClose} width={420}>
      <Receipt sale={sale} settings={settings} />
      {createPortal(
        <div className="print-root">
          <Receipt sale={sale} settings={settings} />
        </div>,
        document.body,
      )}
      <div className="modal-actions">
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
        <Button onClick={() => window.print()}>
          <Printer size={17} /> Print receipt
        </Button>
      </div>
    </Modal>
  )
}

export function POS({ cart, setCart }: { cart: CartItem[]; setCart: React.Dispatch<React.SetStateAction<CartItem[]>> }) {
  const { user, settings, toast, reloadAlerts } = useApp()
  const { data: products, error, loading, reload } = useFetch<Product[]>("/products")
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("All")
  const [sort, setSort] = useState("popular")
  const [discount, setDiscount] = useState(0)
  const [method, setMethod] = useState<PaymentMethod>("Cash")
  const [cash, setCash] = useState("")
  const [reference, setReference] = useState("")
  const { data: options } = useFetch<PaymentOptions>("/payment-options")
  const [provider, setProvider] = useState("GCash")
  const [otherProvider, setOtherProvider] = useState("")
  const [card, setCard] = useState("Visa")
  const [account, setAccount] = useState("")
  const [proof, setProof] = useState("")
  const [formError, setFormError] = useState("")
  const [busy, setBusy] = useState(false)
  const [receipt, setReceipt] = useState<Sale | null>(null)

  // The cart outlives this page, so a price or stock change made in Inventory, or a
  // sale elsewhere, has to reach it. The server always charges the current price.
  useEffect(() => {
    if (!products || !cart.length) return
    const next = cart.flatMap((item) => {
      const p = products.find((x) => x.id === item.id)
      if (!p || p.stock === 0) return []
      return [{ ...item, ...p, qty: Math.min(item.qty, p.stock) }]
    })
    const changed = next.length !== cart.length || next.some((item, i) => item.qty !== cart[i].qty || item.price !== cart[i].price)
    if (changed) toast("Your cart was updated to the current prices and stock.", "warning")
    setCart(next)
    // Only runs when fresh product data arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products])

  const all = products ?? []
  const categories = useMemo(() => ["All", ...new Set(all.map((p) => p.category))], [all])
  const countIn = (c: string) => (c === "All" ? all.length : all.filter((p) => p.category === c).length)
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = all.filter((p) => (category === "All" || p.category === category) && (p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)))
    const sorters: Record<string, (a: Product, b: Product) => number> = {
      popular: (a, b) => Number(b.sold30) - Number(a.sold30),
      priceAsc: (a, b) => a.price - b.price,
      priceDesc: (a, b) => b.price - a.price,
      stock: (a, b) => b.stock - a.stock,
      name: (a, b) => a.name.localeCompare(b.name),
    }
    return [...list].sort(sorters[sort])
  }, [all, search, category, sort])

  const add = (p: Product) => {
    setFormError("")
    setCart((c) => {
      const found = c.find((i) => i.id === p.id)
      if (found) return c.map((i) => (i.id === p.id ? { ...i, qty: Math.min(i.qty + 1, p.stock) } : i))
      return [...c, { ...p, qty: 1 }]
    })
  }
  const changeQty = (id: number, d: number) =>
    setCart((c) =>
      c
        .map((i) => {
          const stock = all.find((p) => p.id === id)?.stock ?? i.stock
          return i.id === id ? { ...i, qty: Math.min(stock, i.qty + d) } : i
        })
        .filter((i) => i.qty > 0),
    )

  const taxRate = Number(settings.tax_rate)
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0)
  // Rounded step by step exactly like the server, or "Exact" cash could come up ₱0.01 short.
  const discountAmt = money((subtotal * discount) / 100)
  const tax = money(((subtotal - discountAmt) * taxRate) / 100)
  const total = money(subtotal - discountAmt + tax)
  const cashValue = Number(cash)
  const short = method === "Cash" && cash !== "" && cashValue < total
  const proofRequired = method === "Online Payment" && settings.require_payment_proof === "1"
  const providerName = method === "Card" ? card : provider === OTHER ? otherProvider.trim() : provider
  const last4Bad = method === "Card" && account !== "" && !/^\d{4}$/.test(account)
  const ready = cart.length > 0 && (method === "Cash" ? cashValue >= total : providerName !== "" && reference.trim() !== "" && !last4Bad && (!proofRequired || proof !== ""))

  const complete = async () => {
    setBusy(true)
    setFormError("")
    try {
      const { sale, newAlerts } = await api<{ sale: Sale; newAlerts: AlertItem[] }>("/sales", {
        method: "POST",
        body: {
          items: cart.map((i) => ({ productId: i.id, qty: i.qty })),
          discountPct: discount,
          method,
          tendered: cashValue,
          ...(method === "Cash" ? {} : { provider: providerName, reference, account, proof: proof || undefined }),
        },
      })
      setReceipt(sale)
      setCart([])
      setCash("")
      setReference("")
      setAccount("")
      setProof("")
      setDiscount(0)
      reload()
      reloadAlerts()
      for (const a of newAlerts) {
        toast(a.stock === 0 ? `${a.name} just sold out.` : `${a.name} is low: ${a.stock} left (minimum ${a.min}).`, a.stock === 0 ? "danger" : "warning")
      }
    } catch (e: any) {
      setFormError(e.message)
      reload()
    } finally {
      setBusy(false)
    }
  }

  if (loading && !products) return <Loading />
  if (error && !products) return <ErrorBox message={error} onRetry={reload} />

  return (
    <div className="pos-layout">
      <div className="catalog">
        <div className="catalog-head">
          <div>
            <h1>Point of sale</h1>
            <p>
              {user.name} · signed in {user.lastLoginAt ? fmtTime(user.lastLoginAt) : ""}
            </p>
          </div>
          <div className="catalog-tools">
            <Field icon={Search} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or SKU…" />
            <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort products">
              <option value="popular">Best sellers first</option>
              <option value="name">Name A–Z</option>
              <option value="priceAsc">Price: low to high</option>
              <option value="priceDesc">Price: high to low</option>
              <option value="stock">Most stock first</option>
            </Select>
          </div>
        </div>
        <div className="category-tabs" role="tablist" aria-label="Categories">
          {categories.map((c) => (
            <button type="button" role="tab" aria-selected={category === c} className={category === c ? "active" : ""} onClick={() => setCategory(c)} key={c}>
              {c === "All" ? (
                <span className="all-icon">
                  <LayoutGrid size={16} />
                </span>
              ) : (
                <ProductTile category={c} size={32} />
              )}
              <span>{c === "All" ? "All items" : c}</span>
              <em>{countIn(c)}</em>
            </button>
          ))}
        </div>
        {shown.length === 0 ? (
          <Empty title="No products found">Try a different search or category.</Empty>
        ) : (
          <div className="product-grid">
            {shown.map((p) => {
              const inCart = cart.find((i) => i.id === p.id)?.qty ?? 0
              const left = p.stock - inCart
              return (
                <button type="button" className={`product-card ${inCart ? "in-cart" : ""}`} key={p.id} disabled={left <= 0} onClick={() => add(p)} aria-label={`Add ${p.name}, ${peso(p.price)}`}>
                  <div className="product-photo">
                    <ProductArt name={p.name} category={p.category} />
                    {p.stock > 0 && p.stock <= p.min && <Badge tone="warning">Only {p.stock} left</Badge>}
                    {inCart > 0 && <span className="qty-bubble">{inCart}</span>}
                    {p.stock === 0 && <span className="sold-out-veil">Sold out</span>}
                  </div>
                  <div className="product-info">
                    <h3>{p.name}</h3>
                    <small>
                      {p.sku} · {p.stock} in stock
                    </small>
                    <div className="product-card-foot">
                      <strong>{peso(p.price)}</strong>
                      <span className="add-chip">
                        <Plus size={16} />
                      </span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <aside className="cart-panel">
        <div className="cart-head">
          <h2>
            Current order <b>{cart.reduce((s, i) => s + i.qty, 0)}</b>
          </h2>
          {cart.length > 0 && (
            <button type="button" onClick={() => setCart([])}>
              Clear all
            </button>
          )}
        </div>
        <div className="cart-items">
          {!cart.length ? (
            <div className="empty-cart">
              <ShoppingCart size={30} />
              <h3>Cart is empty</h3>
              <p>Click a product to add it.</p>
            </div>
          ) : (
            cart.map((item) => (
              <div className="cart-item" key={item.id}>
                <ProductTile category={item.category} name={item.name} size={48} />
                <div className="cart-item-main">
                  <strong>{item.name}</strong>
                  <span>{peso(item.price)} each</span>
                </div>
                <div className="quantity">
                  <button type="button" onClick={() => changeQty(item.id, -1)} aria-label={`Remove one ${item.name}`}>
                    <Minus size={14} />
                  </button>
                  <b>{item.qty}</b>
                  <button type="button" onClick={() => changeQty(item.id, 1)} aria-label={`Add one ${item.name}`}>
                    <Plus size={14} />
                  </button>
                </div>
                <strong className="cart-line-total">{peso(item.price * item.qty)}</strong>
                <button type="button" className="cart-remove" onClick={() => setCart((c) => c.filter((i) => i.id !== item.id))} aria-label={`Remove ${item.name} from cart`}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          )}
        </div>
        <div className="cart-summary">
          <div className="sum-line discount-row">
            <span>Discount</span>
            <div className="segmented small">
              {[0, 5, 10].map((d) => (
                <button type="button" key={d} className={discount === d ? "active" : ""} onClick={() => setDiscount(d)}>
                  {d ? `${d}%` : "None"}
                </button>
              ))}
            </div>
          </div>
          <div className="sum-line">
            <span>Subtotal</span>
            <b>{peso(subtotal)}</b>
          </div>
          {discount > 0 && (
            <div className="sum-line">
              <span>Discount ({discount}%)</span>
              <b>-{peso(discountAmt)}</b>
            </div>
          )}
          <div className="sum-line">
            <span>VAT ({taxRate}%)</span>
            <b>{peso(tax)}</b>
          </div>
          <div className="grand-total">
            <span>Total</span>
            <strong>{peso(total)}</strong>
          </div>
          <div className="payment-methods" role="radiogroup" aria-label="Payment method">
            {METHODS.map((m) => (
              <button
                type="button"
                role="radio"
                aria-checked={method === m.id}
                className={method === m.id ? "active" : ""}
                onClick={() => {
                  setMethod(m.id)
                  setFormError("")
                }}
                key={m.id}
              >
                <m.icon size={18} />
                <span>{m.id}</span>
              </button>
            ))}
          </div>
          {method === "Cash" ? (
            <>
              <div className="cash-row">
                <Field value={cash} onChange={(e) => setCash(e.target.value)} type="number" min="0" step="0.01" placeholder="Cash received" aria-label="Cash received" />
                <Button size="sm" variant="secondary" disabled={!cart.length} onClick={() => setCash(total.toFixed(2))}>
                  Exact
                </Button>
                <Button size="sm" variant="secondary" disabled={!cart.length} onClick={() => setCash(String(Math.ceil(total / 100) * 100))}>
                  Round up
                </Button>
              </div>
              <div className={`sum-line change-line ${short ? "short" : ""}`}>
                <span>{short ? "Still short by" : "Change"}</span>
                <strong>{peso(short ? total - cashValue : Math.max(0, cashValue - total))}</strong>
              </div>
            </>
          ) : method === "Online Payment" ? (
            <div className="pay-details">
              <Select value={provider} onChange={(e) => setProvider(e.target.value)} aria-label="Paid with">
                <optgroup label="E-wallets">
                  {(options?.online ?? ["GCash", "Maya"]).filter((p) => !BANKS.has(p)).map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </optgroup>
                <optgroup label="Bank transfer">
                  {(options?.online ?? []).filter((p) => BANKS.has(p)).map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </optgroup>
                <option value={OTHER}>Other…</option>
              </Select>
              {provider === OTHER && <Field value={otherProvider} onChange={(e) => setOtherProvider(e.target.value)} maxLength={40} placeholder="Name of the e-wallet or bank" aria-label="Name of the payment" />}
              <Field value={reference} onChange={(e) => setReference(e.target.value)} maxLength={60} placeholder={`${providerName || "Payment"} reference no.`} aria-label="Reference number" />
              <Field value={account} onChange={(e) => setAccount(e.target.value)} maxLength={80} placeholder="Sender name or number (optional)" aria-label="Sender name or number" />
              <PhotoPicker value={proof} onChange={setProof} required={proofRequired} label="Photo of the payment screen" />
            </div>
          ) : (
            <div className="pay-details">
              <Select value={card} onChange={(e) => setCard(e.target.value)} aria-label="Card type">
                {(options?.card ?? ["Visa", "Mastercard"]).map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
              <div className="pay-pair">
                <Field value={reference} onChange={(e) => setReference(e.target.value)} maxLength={60} placeholder="Approval code" aria-label="Card approval code" />
                <Field value={account} onChange={(e) => setAccount(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" placeholder="Last 4 digits" aria-label="Last 4 digits of the card" className={last4Bad ? "field-bad" : ""} />
              </div>
              <PhotoPicker value={proof} onChange={setProof} required={false} label="Photo of the terminal slip" />
            </div>
          )}
          <FormError message={formError} />
          <Button className="complete-button" onClick={complete} disabled={!ready || busy}>
            <Check size={18} /> {busy ? "Saving…" : `Complete sale${cart.length ? ` · ${peso(total)}` : ""}`}
          </Button>
        </div>
      </aside>
      {receipt && <ReceiptDialog sale={receipt} onClose={() => setReceipt(null)} autoPrint={settings.receipt_auto_print === "1"} />}
    </div>
  )
}
