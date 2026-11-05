import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { Check, CreditCard, Globe, Minus, Plus, Printer, Search, ShoppingCart, Trash2, Wallet } from "lucide-react"
import { api, fmtTime, money, peso, useApp, useFetch, type AlertItem, type CartItem, type PaymentMethod, type Product, type Sale } from "../lib"
import { Badge, Button, ErrorBox, Field, FormError, Loading, Modal, ProductTile, Receipt, Select, Empty } from "../ui"

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
  const needsRef = method !== "Cash"
  const short = method === "Cash" && cash !== "" && cashValue < total
  const ready = cart.length > 0 && (method === "Cash" ? cashValue >= total : reference.trim() !== "")

  const complete = async () => {
    setBusy(true)
    setFormError("")
    try {
      const { sale, newAlerts } = await api<{ sale: Sale; newAlerts: AlertItem[] }>("/sales", {
        method: "POST",
        body: { items: cart.map((i) => ({ productId: i.id, qty: i.qty })), discountPct: discount, method, tendered: cashValue, reference },
      })
      setReceipt(sale)
      setCart([])
      setCash("")
      setReference("")
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
        <div className="category-scroll">
          {categories.map((c) => (
            <button type="button" className={category === c ? "active" : ""} onClick={() => setCategory(c)} key={c}>
              {c}
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
                <button type="button" className={`product-card ${inCart ? "in-cart" : ""}`} key={p.id} disabled={left <= 0} onClick={() => add(p)}>
                  <div className="product-card-top">
                    <ProductTile category={p.category} size={44} />
                    {p.stock === 0 ? <Badge tone="danger">Sold out</Badge> : p.stock <= p.min ? <Badge tone="warning">Low: {p.stock}</Badge> : inCart > 0 ? <Badge tone="info">{inCart} in cart</Badge> : null}
                  </div>
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
          ) : (
            needsRef && (
              <Field
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                maxLength={60}
                placeholder={method === "Card" ? "Approval code from the card terminal" : "Reference no. (GCash, Maya, bank…)"}
                aria-label={method === "Card" ? "Card approval code" : "Online payment reference number"}
              />
            )
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
