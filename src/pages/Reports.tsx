import { useState } from "react"
import { Boxes, CircleDollarSign, Download, Package, Percent, ReceiptText, RotateCcw, ShoppingBag, TrendingUp, Wallet } from "lucide-react"
import { downloadCsv, fmtDay, fmtMonth, num, peso, peso0, stockStatus, toKey, useFetch } from "../lib"
import { Badge, Button, Card, CardHead, Empty, ErrorBox, Field, Loading, Metric, PageIntro, Select } from "../ui"
import { BarChart, ShareBars } from "../charts"

type Summary = { orders: number; gross: number; discounts: number; net: number; vat: number; collected: number; cogs: number; profit: number; units: number; avgOrder: number; refunds: number; refundAmount: number }
type ReportData = {
  from: string
  to: string
  summary: Summary
  previous: Summary
  bucket: "day" | "month"
  trend: { label: string; value: number; orders: number }[]
  byMethod: { name: string; orders: number; value: number }[]
  byCashier: { name: string; orders: number; value: number }[]
  products: { id: number; name: string; sku: string; category: string; units: number; revenue: number; cogs: number }[]
  inventory: { id: number; name: string; sku: string; category: string; stock: number; min: number; cost: number; price: number; costValue: number; retailValue: number }[]
  movements: { type: string; entries: number; units: number }[]
}
type Tab = "Sales" | "Products" | "Inventory" | "Revenue"

function periodRange(period: string, customFrom: string, customTo: string): [string, string] {
  const now = new Date()
  const today = toKey(now)
  if (period === "custom") return [customFrom || today, customTo || today]
  if (period === "30d") {
    const d = new Date(now)
    d.setDate(d.getDate() - 29)
    return [toKey(d), today]
  }
  if (period === "90d") {
    const d = new Date(now)
    d.setDate(d.getDate() - 89)
    return [toKey(d), today]
  }
  if (period === "year") return [`${now.getFullYear()}-01-01`, today]
  if (period === "lastMonth") {
    return [toKey(new Date(now.getFullYear(), now.getMonth() - 1, 1)), toKey(new Date(now.getFullYear(), now.getMonth(), 0))]
  }
  return [toKey(new Date(now.getFullYear(), now.getMonth(), 1)), today]
}

const change = (now: number, before: number) => (before > 0 ? ((now - before) / before) * 100 : null)

export function Reports() {
  const [tab, setTab] = useState<Tab>("Sales")
  const [period, setPeriod] = useState("month")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [from, to] = periodRange(period, customFrom, customTo)
  const { data: r, error, loading, reload } = useFetch<ReportData>(`/reports?from=${from}&to=${to}`)

  const download = () => {
    if (!r) return
    const base = `${tab.toLowerCase()}-report-${r.from}-to-${r.to}.csv`
    const s = r.summary
    if (tab === "Sales") {
      downloadCsv(base, [[r.bucket === "month" ? "Month" : "Date", "Transactions", "Sales"], ...r.trend.map((t) => [t.label, t.orders, t.value]), [], ["Payment method", "Transactions", "Sales"], ...r.byMethod.map((m) => [m.name, m.orders, m.value]), [], ["Cashier", "Transactions", "Sales"], ...r.byCashier.map((c) => [c.name, c.orders, c.value])])
    } else if (tab === "Products") {
      downloadCsv(base, [["Product", "SKU", "Category", "Units", "Sales", "Cost", "Profit"], ...r.products.map((p) => [p.name, p.sku, p.category, p.units, p.revenue, p.cogs, p.revenue - p.cogs])])
    } else if (tab === "Inventory") {
      downloadCsv(base, [["Product", "SKU", "Category", "Stock", "Minimum", "Value at cost", "Value at price", "Status"], ...r.inventory.map((p) => [p.name, p.sku, p.category, p.stock, p.min, p.costValue, p.retailValue, stockStatus(p).label])])
    } else {
      downloadCsv(base, [["Item", "Amount"], ["Gross sales", s.gross], ["Discounts", -s.discounts], ["Net sales", s.net], ["Cost of goods", -s.cogs], ["Gross profit", s.profit], ["VAT collected", s.vat], ["Total collected", s.collected], ["Refunded", s.refundAmount]])
    }
  }

  const productTotal = r?.products.reduce((max, p) => Math.max(max, p.revenue), 0) || 1

  return (
    <div className="page-stack">
      <PageIntro eyebrow="BUSINESS INSIGHT" title="Reports & analytics" subtitle="Clear numbers on your sales, products, stock and profit.">
        <Select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Report period">
          <option value="month">This month</option>
          <option value="lastMonth">Last month</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
          <option value="year">This year</option>
          <option value="custom">Custom dates</option>
        </Select>
        {period === "custom" && (
          <>
            <Field type="date" value={customFrom} max={customTo || undefined} onChange={(e) => setCustomFrom(e.target.value)} aria-label="From date" />
            <Field type="date" value={customTo} min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)} aria-label="To date" />
          </>
        )}
        <Button onClick={download} disabled={!r}>
          <Download size={17} /> Download CSV
        </Button>
      </PageIntro>

      <div className="segmented tabs">
        {(["Sales", "Products", "Inventory", "Revenue"] as Tab[]).map((x) => (
          <button type="button" className={tab === x ? "active" : ""} key={x} onClick={() => setTab(x)}>
            {x}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : loading && !r ? (
        <Loading label="Building your report…" />
      ) : !r ? null : (
        <>
          {tab === "Sales" && (
            <>
              <div className="metrics-grid">
                <Metric icon={CircleDollarSign} label="Total sales" value={peso0(r.summary.collected)} change={change(r.summary.collected, r.previous.collected)} note="vs previous period" />
                <Metric icon={ReceiptText} label="Transactions" value={num(r.summary.orders)} change={change(r.summary.orders, r.previous.orders)} note="vs previous period" tone="blue" />
                <Metric icon={ShoppingBag} label="Average sale" value={peso(r.summary.avgOrder)} change={change(r.summary.avgOrder, r.previous.avgOrder)} note="vs previous period" tone="gold" />
                <Metric icon={RotateCcw} label="Refunds" value={num(r.summary.refunds)} note={`${peso0(r.summary.refundAmount)} returned`} tone="red" />
              </div>
              <div className="dashboard-grid">
                <Card>
                  <CardHead title="Sales over time" subtitle={r.bucket === "month" ? "By month" : "By day"} />
                  {r.trend.length ? <BarChart data={r.trend} height={280} /> : <Empty title="No sales in this period" />}
                </Card>
                <div className="side-stack">
                  <Card>
                    <CardHead title="By payment method" />
                    <ShareBars data={r.byMethod.map((m) => ({ name: m.name, value: m.value }))} />
                  </Card>
                  <Card>
                    <CardHead title="By cashier" />
                    <ShareBars data={r.byCashier.map((c) => ({ name: c.name, value: c.value }))} />
                  </Card>
                </div>
              </div>
            </>
          )}

          {tab === "Products" && (
            <>
              <div className="metrics-grid three">
                <Metric icon={Package} label="Units sold" value={num(r.summary.units)} change={change(r.summary.units, r.previous.units)} note="vs previous period" tone="blue" />
                <Metric icon={Boxes} label="Products sold" value={num(r.products.length)} note={`of ${r.inventory.length} in the catalog`} tone="gold" />
                <Metric icon={TrendingUp} label="Best seller" value={r.products[0]?.name ?? "—"} note={r.products[0] ? `${peso0(r.products[0].revenue)} in sales` : undefined} tone="green" />
              </div>
              <Card>
                <CardHead title="Product performance" subtitle="Sorted by sales before VAT and discounts" />
                {r.products.length === 0 ? (
                  <Empty title="No sales in this period" />
                ) : (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Category</th>
                          <th className="num">Units</th>
                          <th className="num">Sales</th>
                          <th>Share</th>
                          <th className="num">Profit</th>
                          <th className="num">Margin</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.products.map((p) => (
                          <tr key={p.id}>
                            <td>
                              <b>{p.name}</b>
                              <small className="cell-sub">{p.sku}</small>
                            </td>
                            <td>{p.category}</td>
                            <td className="num">{num(p.units)}</td>
                            <td className="num">
                              <b>{peso0(p.revenue)}</b>
                            </td>
                            <td>
                              <div className="share-track table-bar">
                                <i style={{ width: `${(p.revenue / productTotal) * 100}%` }} />
                              </div>
                            </td>
                            <td className="num">{peso0(p.revenue - p.cogs)}</td>
                            <td className="num">{p.revenue ? Math.round(((p.revenue - p.cogs) / p.revenue) * 100) : 0}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </>
          )}

          {tab === "Inventory" && (
            <>
              <div className="metrics-grid three">
                <Metric icon={Wallet} label="Stock value at cost" value={peso0(r.inventory.reduce((s, p) => s + p.costValue, 0))} note="What you paid" />
                <Metric icon={CircleDollarSign} label="Stock value at price" value={peso0(r.inventory.reduce((s, p) => s + p.retailValue, 0))} note="If everything sold" tone="green" />
                <Metric icon={Boxes} label="Need restocking" value={num(r.inventory.filter((p) => p.stock <= p.min).length)} note={`of ${r.inventory.length} products`} tone="red" />
              </div>
              <div className="dashboard-grid">
                <Card>
                  <CardHead title="Stock by product" subtitle="Current levels and value" />
                  <div className="table-scroll compact">
                    <table>
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Status</th>
                          <th className="num">Stock</th>
                          <th className="num">Minimum</th>
                          <th className="num">Value at cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.inventory.map((p) => {
                          const st = stockStatus(p)
                          return (
                            <tr key={p.id}>
                              <td>
                                <b>{p.name}</b>
                              </td>
                              <td>
                                <Badge tone={st.tone}>{st.label}</Badge>
                              </td>
                              <td className="num">{p.stock}</td>
                              <td className="num">{p.min}</td>
                              <td className="num">{peso0(p.costValue)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
                <Card>
                  <CardHead title="Stock changes" subtitle="In this period" />
                  {r.movements.length === 0 ? (
                    <Empty title="No stock changes" />
                  ) : (
                    <div className="line-list">
                      {r.movements.map((m) => (
                        <div key={m.type}>
                          <span>{m.type === "Restock" ? "Stock in" : m.type === "Initial" ? "Opening stock" : m.type}</span>
                          <b>
                            {m.units > 0 ? "+" : ""}
                            {num(m.units)} {Math.abs(m.units) === 1 ? "unit" : "units"}
                          </b>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            </>
          )}

          {tab === "Revenue" && (
            <>
              <div className="metrics-grid">
                <Metric icon={CircleDollarSign} label="Net sales" value={peso0(r.summary.net)} change={change(r.summary.net, r.previous.net)} note="vs previous period" />
                <Metric icon={Wallet} label="Cost of goods" value={peso0(r.summary.cogs)} change={change(r.summary.cogs, r.previous.cogs)} goodWhenUp={false} note="vs previous period" tone="blue" />
                <Metric icon={TrendingUp} label="Gross profit" value={peso0(r.summary.profit)} change={change(r.summary.profit, r.previous.profit)} note="vs previous period" tone="green" />
                <Metric icon={Percent} label="Profit margin" value={`${r.summary.net ? Math.round((r.summary.profit / r.summary.net) * 100) : 0}%`} note="Profit ÷ net sales" tone="gold" />
              </div>
              <div className="dashboard-grid lower">
                <Card>
                  <CardHead title="Income statement" subtitle={`${fmtDay(r.from)} – ${fmtDay(r.to)}, completed sales only`} />
                  <div className="line-list statement">
                    <div>
                      <span>Gross sales</span>
                      <b>{peso(r.summary.gross)}</b>
                    </div>
                    <div>
                      <span>Less discounts</span>
                      <b>-{peso(r.summary.discounts)}</b>
                    </div>
                    <div className="subtotal">
                      <span>Net sales</span>
                      <b>{peso(r.summary.net)}</b>
                    </div>
                    <div>
                      <span>Less cost of goods</span>
                      <b>-{peso(r.summary.cogs)}</b>
                    </div>
                    <div className="subtotal strong">
                      <span>Gross profit</span>
                      <b>{peso(r.summary.profit)}</b>
                    </div>
                    <div>
                      <span>VAT collected (not income)</span>
                      <b>{peso(r.summary.vat)}</b>
                    </div>
                    <div>
                      <span>Total collected from customers</span>
                      <b>{peso(r.summary.collected)}</b>
                    </div>
                  </div>
                </Card>
                <Card>
                  <CardHead title="Sales trend" subtitle={r.bucket === "month" ? "By month" : "By day"} />
                  {r.trend.length ? <BarChart data={r.trend} height={280} /> : <Empty title="No sales in this period" />}
                  {r.bucket === "month" && r.trend.length > 0 && <p className="muted-text">Latest: {fmtMonth(r.trend[r.trend.length - 1].label)}</p>}
                </Card>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
