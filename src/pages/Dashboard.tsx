import { useState } from "react"
import { AlertTriangle, ArrowDownRight, ArrowUpRight, ChevronRight, CircleDollarSign, Package, ReceiptText, ShoppingCart, Target, TrendingUp } from "lucide-react"
import { fmtDayLong, fmtDateTime, num, peso, peso0, useApp, useFetch, type ForecastPoint, type HistoryPoint, type ProductForecast, type Sale } from "../lib"
import { Badge, Button, Card, CardHead, ErrorBox, Loading, Metric, ProductTile } from "../ui"
import { BarChart, ForecastChart } from "../charts"

type DashboardData = {
  shopWide: boolean
  today: { revenue: number; orders: number; units: number }
  yesterday: { revenue: number; orders: number }
  products: number
  stockUnits: number
  salesDaily: { label: string; value: number }[]
  salesMonthly: { label: string; value: number }[]
  topProducts: { id: number; name: string; category: string; units: number; revenue?: number }[]
  recent: Sale[]
  forecast: null | {
    history: HistoryPoint[]
    points: ForecastPoint[]
    next7: number
    next30: number
    low: number
    high: number
    changePct: number | null
    peakDay: ForecastPoint | null
    accuracy: number | null
    confidence: string
    records: { salesCount: number; firstDay: string; lastSaleAt: string | null }
    toOrder: ProductForecast[]
    toOrderCount: number
  }
}

const pct = (now: number, before: number) => (before > 0 ? ((now - before) / before) * 100 : null)

export function Dashboard() {
  const { user, go, can, alerts } = useApp()
  const { data, error, loading, reload } = useFetch<DashboardData>("/dashboard")
  const [range, setRange] = useState<"7" | "30" | "12m">("30")

  const now = new Date()
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening"
  const attention = alerts.enabled ? alerts.items : []
  const outCount = attention.filter((a) => a.level === "out").length

  if (loading && !data) return <Loading label="Loading your dashboard…" />
  if (error || !data) return <ErrorBox message={error || "Couldn't load the dashboard."} onRetry={reload} />
  const f = data.forecast
  const chartData = range === "12m" ? data.salesMonthly : range === "7" ? data.salesDaily.slice(-7) : data.salesDaily
  const canSell = can("sales.process")
  const canSeeStock = can("inventory.view")
  const allSales = can("transactions.all")
  const salesWord = data.shopWide ? "" : "Your "
  const ranges = (
    [
      ["7", "7 days"],
      ["30", "30 days"],
      ["12m", "12 months"],
    ] as const
  ).filter(([id]) => id !== "12m" || data.salesMonthly.length > 0)
  const intro = f ? "Here's how the shop is doing and what's coming next." : data.shopWide ? "Here's how the shop is doing today." : "Here's your day so far."

  return (
    <div className="page-stack">
      <div className="page-intro">
        <div>
          <span className="eyebrow">{now.toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).toUpperCase()}</span>
          <h1>
            {greeting}, {user.name.split(" ")[0]}
          </h1>
          <p>{intro}</p>
        </div>
        {canSell && (
          <div className="intro-actions">
            <Button onClick={() => go("pos")}>
              <ShoppingCart size={17} /> New sale
            </Button>
          </div>
        )}
      </div>

      {attention.length > 0 && (
        <button type="button" className={`alert-banner ${outCount ? "danger" : "warning"}`} onClick={() => go("inventory", { status: "attention" })}>
          <AlertTriangle size={20} />
          <span>
            <b>{attention.length === 1 ? "1 product needs" : `${attention.length} products need`} restocking</b>
            {outCount > 0 && ` · ${outCount} out of stock`}
            {attention.length - outCount > 0 && ` · ${attention.length - outCount} running low`}
          </span>
          <em>
            Review <ChevronRight size={16} />
          </em>
        </button>
      )}

      {f && (
      <Card className="forecast-hero">
        <div className="forecast-hero-main">
          <div className="card-head">
            <div>
              <span className="eyebrow">SALES FORECAST</span>
              <h3 className="hero-title">
                Next 30 days: about <em>{peso0(f.next30)}</em>
              </h3>
              <p>
                Likely between {peso0(f.low)} and {peso0(f.high)}, based on {num(f.records.salesCount)} recorded sales.
              </p>
            </div>
            {f.changePct !== null && (
              <span className={`change-chip ${f.changePct >= 0 ? "up" : "down"}`}>
                {f.changePct >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                {Math.abs(f.changePct).toFixed(0)}% vs last 30 days
              </span>
            )}
          </div>
          <ForecastChart history={f.history} points={f.points} height={260} />
        </div>
        <div className="forecast-hero-side">
          <dl className="hero-facts">
            <div>
              <dt>Next 7 days</dt>
              <dd>{peso0(f.next7)}</dd>
            </div>
            <div>
              <dt>Busiest day ahead</dt>
              <dd>{f.peakDay ? fmtDayLong(f.peakDay.date) : "—"}</dd>
            </div>
            <div>
              <dt>Forecast accuracy</dt>
              <dd>
                {f.accuracy !== null ? `${f.accuracy}%` : "—"} <Badge tone={f.confidence === "High" ? "success" : f.confidence === "Moderate" ? "warning" : "neutral"}>{f.confidence}</Badge>
              </dd>
            </div>
          </dl>
          <div className="hero-orders">
            <h4>{f.toOrderCount ? `Order soon (${f.toOrderCount})` : "Stock looks enough"}</h4>
            {f.toOrder.map((p) => (
              <div key={p.id}>
                <span>{p.name}</span>
                <b>{p.reorder > 0 ? `+${p.reorder}` : "—"}</b>
              </div>
            ))}
          </div>
          <Button variant="secondary" onClick={() => go("forecast")}>
            <TrendingUp size={16} /> Open full forecast
          </Button>
        </div>
      </Card>
      )}

      <div className="metrics-grid">
        <Metric icon={CircleDollarSign} label={`${salesWord}${data.shopWide ? "Sales" : "sales"} today`} value={peso(data.today.revenue)} change={pct(data.today.revenue, data.yesterday.revenue)} note="vs this time yesterday" onClick={() => go("transactions")} />
        <Metric icon={ReceiptText} label={`${salesWord}${data.shopWide ? "Transactions" : "transactions"} today`} value={num(data.today.orders)} change={pct(data.today.orders, data.yesterday.orders)} note="vs this time yesterday" tone="blue" onClick={() => go("transactions")} />
        {canSeeStock ? (
          <>
            <Metric icon={Package} label="Products" value={num(data.products)} note={`${num(data.stockUnits)} units in stock`} tone="gold" onClick={() => go("inventory")} />
            <Metric icon={AlertTriangle} label="Stock alerts" value={num(attention.length)} note={attention.length ? "Need restocking" : "All products OK"} tone="red" onClick={() => go("inventory", { status: "attention" })} />
          </>
        ) : (
          <Metric icon={Package} label={`${salesWord}${data.shopWide ? "Units" : "units"} sold today`} value={num(data.today.units)} note="Items on completed sales" tone="gold" />
        )}
      </div>

      {data.shopWide && (
      <div className="dashboard-grid">
        <Card>
          <CardHead
            title="Sales overview"
            subtitle="Completed sales, including VAT"
            action={
              <div className="segmented">
                {ranges.map(([id, label]) => (
                  <button type="button" key={id} className={range === id ? "active" : ""} onClick={() => setRange(id)}>
                    {label}
                  </button>
                ))}
              </div>
            }
          />
          <BarChart data={chartData} />
        </Card>
        <Card>
          <CardHead title="Top sellers" subtitle="Units sold, last 30 days" />
          <div className="rank-list">
            {data.topProducts.map((p, i) => (
              <div key={p.id}>
                <span className="rank">{i + 1}</span>
                <ProductTile category={p.category} size={38} />
                <span className="rank-name">
                  <b>{p.name}</b>
                  <small>{p.category}</small>
                </span>
                <span className="rank-value">
                  <b>{num(Number(p.units))} units</b>
                  <small>{peso0(Number(p.revenue))}</small>
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      )}

      <Card>
        <CardHead
          title={allSales ? "Recent transactions" : "Your recent sales"}
          action={
            <button type="button" className="text-link" onClick={() => go("transactions")}>
              View all <ChevronRight size={15} />
            </button>
          }
        />
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Transaction</th>
                <th>When</th>
                <th>Cashier</th>
                <th>Payment</th>
                <th className="num">Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((s) => (
                <tr key={s.id} className="row-link" onClick={() => go("transactions", { saleId: s.id })}>
                  <td>
                    <b>{s.txnNo}</b>
                  </td>
                  <td>{fmtDateTime(s.soldAt)}</td>
                  <td>{s.cashier}</td>
                  <td>{s.method}</td>
                  <td className="num">
                    <b>{peso(s.total)}</b>
                  </td>
                  <td>
                    <Badge tone={s.status === "Completed" ? "success" : "danger"}>{s.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {f && (
        <p className="foot-note">
          <Target size={14} /> Forecasts are estimates from your own sales records, updated every time a sale is recorded.
        </p>
      )}
    </div>
  )
}
