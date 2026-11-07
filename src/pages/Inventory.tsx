import { useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, ArrowDown, ArrowUp, Boxes, Check, CircleDollarSign, Download, PackageCheck, PackagePlus, PackageX, Pencil, Plus, Search, SlidersHorizontal, Trash2 } from "lucide-react"
import { api, downloadCsv, fmtDateTime, num, peso, peso0, stockStatus, timeAgo, useApp, useFetch, type PageParams, type Paged, type Product } from "../lib"
import { Badge, Button, Card, CardHead, Confirm, Empty, ErrorBox, Field, FormError, FormGroup, Loading, Modal, PageIntro, Pagination, ProductTile, Select, StockBar, type Tone } from "../ui"

type Movement = { id: number; type: string; change_qty: number; stockAfter: number; note: string | null; createdAt: string; product: string; sku: string; user: string }
const MOVE_TONE: Record<string, Tone> = { Restock: "success", Initial: "success", Sale: "info", Refund: "info", Adjustment: "warning", Damaged: "danger" }
const PAGE_SIZE = 8

function ProductForm({ product, categories, canPrice, onClose, onSaved }: { product: Product | null; categories: string[]; canPrice: boolean; onClose: () => void; onSaved: () => void }) {
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const body = Object.fromEntries(new FormData(e.currentTarget))
    setBusy(true)
    setError("")
    try {
      if (product) await api(`/products/${product.id}`, { method: "PUT", body })
      else await api("/products", { method: "POST", body })
      onSaved()
    } catch (err: any) {
      setError(err.message)
      setBusy(false)
    }
  }
  return (
    <Modal eyebrow="PRODUCT DETAILS" title={product ? `Edit ${product.name}` : "Add new product"} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <FormGroup label="Product name" wide>
            <Field name="name" defaultValue={product?.name} maxLength={120} required autoFocus />
          </FormGroup>
          <FormGroup label="SKU / product code">
            <Field name="sku" defaultValue={product?.sku} maxLength={30} required />
          </FormGroup>
          <FormGroup label="Category" hint="Pick one or type a new one.">
            <Field name="category" defaultValue={product?.category} list="category-options" maxLength={60} required />
            <datalist id="category-options">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </FormGroup>
          {!product || canPrice ? (
            <>
              <FormGroup label="Selling price (₱)">
                <Field name="price" type="number" min="0" step="0.01" defaultValue={product?.price} required />
              </FormGroup>
              <FormGroup label="Cost price (₱)">
                <Field name="cost" type="number" min="0" step="0.01" defaultValue={product?.cost} required />
              </FormGroup>
            </>
          ) : (
            <FormGroup label="Selling price (₱)" hint="Only someone with the Manage pricing permission can change prices.">
              <Field value={product.price} disabled />
            </FormGroup>
          )}
          {!product && (
            <FormGroup label="Opening stock">
              <Field name="stock" type="number" min="0" step="1" defaultValue={0} required />
            </FormGroup>
          )}
          <FormGroup label="Minimum stock" hint="You get an alert at or below this.">
            <Field name="min" type="number" min="0" step="1" defaultValue={product?.min ?? 10} required />
          </FormGroup>
        </div>
        {product && <p className="form-note">To change the stock count, close this and use Stock in or Adjust. That way every change is recorded.</p>}
        <FormError message={error} />
        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            <Check size={17} /> Save product
          </Button>
        </div>
      </form>
    </Modal>
  )
}

const STOCK_ACTIONS = {
  Restock: { label: "Stock in", help: "New stock received from a supplier." },
  Damaged: { label: "Damaged / lost", help: "Units that can no longer be sold." },
  Adjustment: { label: "Count correction", help: "Fix the count after a physical check. Use a negative number to remove." },
} as const
type StockAction = keyof typeof STOCK_ACTIONS

function StockForm({ product, initial, onClose, onSaved }: { product: Product; initial: StockAction; onClose: () => void; onSaved: (type: StockAction, after: number) => void }) {
  const [type, setType] = useState<StockAction>(initial)
  const [qty, setQty] = useState("")
  const [note, setNote] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const n = Number(qty) || 0
  const after = product.stock + (type === "Damaged" ? -n : n)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError("")
    try {
      const r = await api(`/products/${product.id}/stock`, { method: "POST", body: { type, qty: n, note } })
      onSaved(type, r.stock)
    } catch (err: any) {
      setError(err.message)
      setBusy(false)
    }
  }
  return (
    <Modal eyebrow="UPDATE STOCK" title={product.name} onClose={onClose} width={480}>
      <form onSubmit={submit}>
        <div className="segmented full">
          {(Object.keys(STOCK_ACTIONS) as StockAction[]).map((t) => (
            <button type="button" key={t} className={type === t ? "active" : ""} onClick={() => setType(t)}>
              {STOCK_ACTIONS[t].label}
            </button>
          ))}
        </div>
        <p className="form-note">{STOCK_ACTIONS[type].help}</p>
        <div className="form-grid">
          <FormGroup label={type === "Adjustment" ? "Units (+ or −)" : "Units"}>
            <Field type="number" step="1" min={type === "Adjustment" ? undefined : 1} value={qty} onChange={(e) => setQty(e.target.value)} required autoFocus />
          </FormGroup>
          <FormGroup label={type === "Restock" ? "Note (optional)" : "Reason"}>
            <Field value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={type === "Restock" ? "Supplier, delivery no." : "What happened?"} required={type !== "Restock"} />
          </FormGroup>
        </div>
        <div className="stock-preview">
          <div>
            <span>Now</span>
            <b>{product.stock}</b>
          </div>
          <i>→</i>
          <div>
            <span>After</span>
            <b className={after < 0 ? "bad" : ""}>{after}</b>
          </div>
          <div>
            <span>Minimum</span>
            <b>{product.min}</b>
          </div>
        </div>
        <FormError message={error} />
        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || n === 0 || after < 0}>
            <Check size={17} /> Save
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export function Inventory({ params }: { params: PageParams }) {
  const { can, toast, reloadAlerts } = useApp()
  const canStock = can("inventory.manage")
  const canEdit = can("products.edit")
  const canPrice = can("products.pricing")
  const canRemove = can("products.remove")
  const hasActions = canStock || canEdit || canRemove
  const { data: products, error, loading, reload } = useFetch<Product[]>("/products")
  const [search, setSearch] = useState(params.search ?? "")
  const [status, setStatus] = useState(params.status ?? "all")
  const [category, setCategory] = useState("All")
  const [page, setPage] = useState(1)
  const [form, setForm] = useState<Product | null | undefined>(undefined)
  const [stockTarget, setStockTarget] = useState<{ product: Product; action: StockAction } | null>(null)
  const [deleting, setDeleting] = useState<Product | null>(null)
  const [moveType, setMoveType] = useState("")
  const [movePage, setMovePage] = useState(1)
  const moves = useFetch<Paged<Movement>>(`/movements?page=${movePage}&size=8${moveType ? `&type=${moveType}` : ""}`)

  const all = products ?? []
  // Opens once per visit. Without this it reopened itself every time the list reloaded,
  // including straight after saving.
  const stockForOpened = useRef(false)
  useEffect(() => {
    if (!params.stockFor || !products || !canStock || stockForOpened.current) return
    stockForOpened.current = true
    const p = products.find((x) => x.id === params.stockFor)
    if (p) setStockTarget({ product: p, action: "Restock" })
  }, [params.stockFor, products, canStock])

  const counts = useMemo(
    () => ({
      total: all.length,
      in: all.filter((p) => p.stock > p.min).length,
      low: all.filter((p) => p.stock > 0 && p.stock <= p.min).length,
      out: all.filter((p) => p.stock === 0).length,
    }),
    [all],
  )
  const categories = useMemo(() => [...new Set(all.map((p) => p.category))].sort(), [all])
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return all
      .filter((p) => {
        if (q && !p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q)) return false
        if (category !== "All" && p.category !== category) return false
        if (status === "in") return p.stock > p.min
        if (status === "low") return p.stock > 0 && p.stock <= p.min
        if (status === "out") return p.stock === 0
        if (status === "attention") return p.stock <= p.min
        return true
      })
      .sort((a, b) => (a.stock <= a.min ? 0 : 1) - (b.stock <= b.min ? 0 : 1) || a.stock / Math.max(a.min, 1) - b.stock / Math.max(b.min, 1))
  }, [all, search, status, category])
  // Removing the only product on the last page must not leave an empty page behind.
  const currentPage = Math.min(page, Math.max(1, Math.ceil(shown.length / PAGE_SIZE)))
  const pageRows = shown.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const refresh = () => {
    reload()
    moves.reload()
    reloadAlerts()
  }
  const setFilter = (s: string) => {
    setStatus(s)
    setPage(1)
  }
  const exportProducts = () => {
    const head = ["Product", "SKU", "Category", "Price", ...(canPrice ? ["Cost"] : []), "Stock", "Minimum", "Status", "Sold (30 days)"]
    downloadCsv("inventory.csv", [head, ...shown.map((p) => [p.name, p.sku, p.category, p.price, ...(canPrice ? [p.cost] : []), p.stock, p.min, stockStatus(p).label, p.sold30])])
  }
  const exportMoves = async () => {
    try {
      const r = await api<Paged<Movement>>(`/movements?size=5000${moveType ? `&type=${moveType}` : ""}`)
      downloadCsv("stock-movements.csv", [["Date", "Product", "SKU", "Type", "Change", "Stock after", "Note", "By"], ...r.rows.map((m) => [fmtDateTime(m.createdAt), m.product, m.sku, m.type, m.change_qty, m.stockAfter, m.note, m.user])])
    } catch (e: any) {
      toast(e.message, "danger")
    }
  }

  if (loading && !products) return <Loading label="Loading inventory…" />
  if (error && !products) return <ErrorBox message={error} onRetry={reload} />

  const filters: { id: string; label: string; value: number; icon: React.ElementType; tone: string }[] = [
    { id: "all", label: "All products", value: counts.total, icon: Boxes, tone: "blue" },
    { id: "in", label: "In stock", value: counts.in, icon: PackageCheck, tone: "green" },
    { id: "low", label: "Low stock", value: counts.low, icon: AlertTriangle, tone: "gold" },
    { id: "out", label: "Out of stock", value: counts.out, icon: PackageX, tone: "red" },
  ]

  return (
    <div className="page-stack">
      <PageIntro eyebrow="STOCK CONTROL" title="Inventory" subtitle={canStock ? "See what's running low, then restock in one click." : "See what's in stock and what's running low."}>
        {canEdit && (
          <Button onClick={() => setForm(null)}>
            <Plus size={17} /> Add product
          </Button>
        )}
      </PageIntro>

      <div className="filter-cards">
        {filters.map((f) => (
          <button type="button" key={f.id} className={status === f.id || (status === "attention" && (f.id === "low" || f.id === "out")) ? "active" : ""} onClick={() => setFilter(f.id)}>
            <div className={`metric-icon tone-${f.tone}`}>
              <f.icon size={18} />
            </div>
            <span>
              <b>{f.value}</b>
              {f.label}
            </span>
          </button>
        ))}
        {canPrice && (
          <div className="value-card">
            <div className="metric-icon tone-orange">
              <CircleDollarSign size={18} />
            </div>
            <span>
              <b>{peso0(all.reduce((s, p) => s + p.stock * (p.cost ?? 0), 0))}</b>
              Stock value at cost
            </span>
          </div>
        )}
      </div>

      <Card>
        <div className="table-toolbar">
          <Field
            icon={Search}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder="Search name or SKU…"
          />
          <div>
            <Select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value)
                setPage(1)
              }}
              aria-label="Filter by category"
            >
              <option value="All">All categories</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
            <Button variant="secondary" onClick={exportProducts}>
              <Download size={16} /> Export CSV
            </Button>
          </div>
        </div>
        {status === "attention" && (
          <p className="filter-note">
            Showing products at or below minimum stock.{" "}
            <button type="button" className="text-link" onClick={() => setFilter("all")}>
              Show all
            </button>
          </p>
        )}
        {shown.length === 0 ? (
          <Empty title="No products match">Try clearing the search or filters.</Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Status</th>
                  <th className="num">In stock</th>
                  <th>Level vs minimum</th>
                  <th className="num">Sold, 30 days</th>
                  <th className="num">Price</th>
                  {hasActions && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((p) => {
                  const st = stockStatus(p)
                  return (
                    <tr key={p.id}>
                      <td>
                        <div className="table-product">
                          <ProductTile category={p.category} name={p.name} size={38} />
                          <span>
                            <b>{p.name}</b>
                            <small>
                              {p.sku} · {p.category}
                            </small>
                          </span>
                        </div>
                      </td>
                      <td>
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </td>
                      <td className="num">
                        <strong className="stock-num">{p.stock}</strong>
                      </td>
                      <td>
                        <StockBar stock={p.stock} min={p.min} />
                        <small className="cell-sub">Minimum {p.min}</small>
                      </td>
                      <td className="num">{num(Number(p.sold30))}</td>
                      <td className="num">
                        {peso(p.price)}
                        {canPrice && <small className="cell-sub">Cost {peso(p.cost ?? 0)}</small>}
                      </td>
                      {hasActions && (
                        <td>
                          <div className="row-actions">
                            {canStock && (
                              <>
                                <Button size="sm" variant="secondary" onClick={() => setStockTarget({ product: p, action: "Restock" })}>
                                  <PackagePlus size={15} /> Stock in
                                </Button>
                                <button type="button" title="Adjust stock" aria-label={`Adjust stock for ${p.name}`} onClick={() => setStockTarget({ product: p, action: "Adjustment" })}>
                                  <SlidersHorizontal size={16} />
                                </button>
                              </>
                            )}
                            {canEdit && (
                              <button type="button" title="Edit product" aria-label={`Edit ${p.name}`} onClick={() => setForm(p)}>
                                <Pencil size={16} />
                              </button>
                            )}
                            {canRemove && (
                              <button type="button" title="Remove product" aria-label={`Remove ${p.name}`} onClick={() => setDeleting(p)}>
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={currentPage} size={PAGE_SIZE} total={shown.length} onPage={setPage} label="products" />
      </Card>

      <Card>
        <CardHead
          title="Recent inventory movement"
          subtitle="Latest stock changes across your catalog"
          action={
            <div className="head-actions">
              <Select
                value={moveType}
                onChange={(e) => {
                  setMoveType(e.target.value)
                  setMovePage(1)
                }}
                aria-label="Filter by movement type"
              >
                <option value="">All changes</option>
                <option value="Sale">Sales</option>
                <option value="Restock">Stock in</option>
                <option value="Damaged">Damaged</option>
                <option value="Adjustment">Corrections</option>
                <option value="Refund">Refunds</option>
                <option value="Initial">Opening stock</option>
              </Select>
              <Button variant="secondary" onClick={exportMoves}>
                <Download size={16} /> Export
              </Button>
            </div>
          }
        />
        {moves.error && !moves.data ? (
          <ErrorBox message={moves.error} onRetry={moves.reload} />
        ) : moves.data && moves.data.rows.length === 0 ? (
          <Empty title="No stock changes yet" />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Product</th>
                  <th>Type</th>
                  <th className="num">Change</th>
                  <th className="num">Stock after</th>
                  <th>Note</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {moves.data?.rows.map((m) => (
                  <tr key={m.id}>
                    <td title={fmtDateTime(m.createdAt)}>{timeAgo(m.createdAt)}</td>
                    <td>
                      <b>{m.product}</b>
                    </td>
                    <td>
                      <Badge tone={MOVE_TONE[m.type]}>{m.type === "Restock" ? "Stock in" : m.type === "Initial" ? "Opening stock" : m.type}</Badge>
                    </td>
                    <td className="num">
                      <span className={`move-change ${m.change_qty >= 0 ? "up" : "down"}`}>
                        {m.change_qty >= 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                        {Math.abs(m.change_qty)}
                      </span>
                    </td>
                    <td className="num">{m.stockAfter}</td>
                    <td className="cell-note">{m.note ?? "—"}</td>
                    <td>{m.user}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {moves.data && <Pagination page={moves.data.page} size={moves.data.size} total={moves.data.total} onPage={setMovePage} label="changes" />}
      </Card>

      {form !== undefined && (
        <ProductForm
          canPrice={canPrice}
          product={form}
          categories={categories}
          onClose={() => setForm(undefined)}
          onSaved={() => {
            toast(form ? "Product updated." : "Product added.")
            setForm(undefined)
            refresh()
          }}
        />
      )}
      {stockTarget && (
        <StockForm
          product={stockTarget.product}
          initial={stockTarget.action}
          onClose={() => setStockTarget(null)}
          onSaved={(_type, after) => {
            toast(`${stockTarget.product.name} now has ${after} in stock.`)
            setStockTarget(null)
            refresh()
          }}
        />
      )}
      {deleting && (
        <Confirm
          title={`Remove ${deleting.name}?`}
          message="It will disappear from the POS and inventory. Past sales and reports keep their records."
          confirmLabel="Remove product"
          danger
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            try {
              await api(`/products/${deleting.id}`, { method: "DELETE" })
              toast("Product removed.")
              refresh()
            } catch (e: any) {
              toast(e.message, "danger")
            }
            setDeleting(null)
          }}
        />
      )}
    </div>
  )
}
