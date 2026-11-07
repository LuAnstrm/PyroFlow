import { useState } from "react"
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, ChevronRight, CircleDollarSign, Package, PackageCheck, ReceiptText, ShoppingCart, Target, TrendingUp } from "lucide-react"
import { fmtDayLong, fmtDateTime, num, paymentLabel, peso, peso0, useApp, useFetch, type ForecastPoint, type HistoryPoint, type ProductForecast, type Sale } from "../lib"
import { Badge, Button, Card, CardHead, ErrorBox, HeroSky, Loading, ProductTile } from "../ui"
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

/** One glass number tile inside the dashboard banner. */
function HeroStat({ icon: Icon, tone, label, value, change, note, onClick }: { icon: React.ElementType; tone: string; label: string; value: string; change?: number | null; note?: string; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div"
  return (
    <Tag className="hero-stat" onClick={onClick} type={onClick ? "button" : undefined}>
      <span className={`hs-icon hs-${tone}`}>
        <Icon size={19} />
      </span>
      <span className="hs-body">
        <small>{label}</small>
        <strong>{value}</strong>
        {change !== undefined && change !== null ? (
          <em className={change >= 0 ? "up" : "down"}>
            {change >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
            {Math.abs(change).toFixed(0)}% {note}
          </em>
        ) : (
          note && <em>{note}</em>
        )}
      </span>
    </Tag>
  )
}

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
  const canRestock = can("inventory.manage")
  const allSales = can("transactions.all")
  const salesWord = data.shopWide ? "Sales" : "Your sales"
  const ranges = (
    [
      ["7", "7 days"],
      ["30", "30 days"],
      ["12m", "12 months"],
    ] as const
  ).filter(([id]) => id !== "12m" || data.salesMonthly.length > 0)
  const intro = f ? "Here's how the shop is doing and what's coming next." : data.shopWide ? "Here's how the shop is doing today." : "Here's your day so far."
  const hasSide = canSeeStock || !!f || data.shopWide

  return (
    <div className="page-stack">
      {/* Banner: greeting, anything urgent, and today's numbers in one place */}
      <section className="page-intro dash-hero">
        <HeroSky />
        <div className="dash-hero-top">
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
          <button type="button" className="hero-alert" onClick={() => go("inventory", { status: "attention" })}>
            <AlertTriangle size={16} />
            <span>
              <b>{attention.length === 1 ? "1 product needs" : `${attention.length} products need`} restocking</b>
              {outCount > 0 && ` · ${outCount} out of stock`}
              {attention.length - outCount > 0 && ` · ${attention.length - outCount} running low`}
            </span>
            <ChevronRight size={16} />
          </button>
        )}
        <div className="hero-stats">
          <HeroStat icon={CircleDollarSign} tone="blue" label={`${salesWord} today`} value={peso(data.today.revenue)} change={pct(data.today.revenue, data.yesterday.revenue)} note="vs yesterday" onClick={() => go("transactions")} />
          <HeroStat icon={ReceiptText} tone="sky" label="Transactions today" value={num(data.today.orders)} change={pct(data.today.orders, data.yesterday.orders)} note="vs yesterday" onClick={() => go("transactions")} />
          {canSeeStock ? (
            <>
              <HeroStat icon={Package} tone="gold" label="Products" value={num(data.products)} note={`${num(data.stockUnits)} units in stock`} onClick={() => go("inventory")} />
              <HeroStat icon={AlertTriangle} tone="red" label="Stock alerts" value={num(attention.length)} note={attention.length ? "Need restocking" : "All products OK"} onClick={() => go("inventory", { status: "attention" })} />
            </>
          ) : (
            <HeroStat icon={Package} tone="gold" label="Units sold today" value={num(data.today.units)} note="On completed sales" />
          )}
        </div>
      </section>

      <div className={`dash-columns ${hasSide ? "" : "single"}`}>
        {/* Left: the two charts */}
        <div className="dash-main">
          {f && (
            <Card className="forecast-card">
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
              <div className="forecast-facts">
                <div>
                  <small>Next 7 days</small>
                  <b>{peso0(f.next7)}</b>
                </div>
                <div>
                  <small>Busiest day ahead</small>
                  <b>{f.peakDay ? fmtDayLong(f.peakDay.date) : "—"}</b>
                </div>
                <div>
                  <small>Forecast accuracy</small>
                  <b>
                    {f.accuracy !== null ? `${f.accuracy}%` : "—"} <Badge tone={f.confidence === "High" ? "success" : f.confidence === "Moderate" ? "warning" : "neutral"}>{f.confidence}</Badge>
                  </b>
                </div>
              </div>
              <ForecastChart history={f.history} points={f.points} height={250} />
              <div className="card-foot">
                <button type="button" className="text-link" onClick={() => go("forecast")}>
                  <TrendingUp size={15} /> Open full forecast <ChevronRight size={15} />
                </button>
              </div>
            </Card>
          )}
          {data.shopWide && (
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
          )}
        </div>

        {/* Right: short lists of what to act on */}
        {hasSide && (
          <div className="dash-side">
            {canSeeStock && (
              <Card>
                <CardHead
                  title="Needs restocking"
                  subtitle={attention.length ? `${attention.length} below their minimum` : "Everything is above its minimum"}
                  action={
                    <button type="button" className="text-link" onClick={() => go("inventory", { status: "attention" })}>
                      Inventory <ChevronRight size={15} />
                    </button>
                  }
                />
                {attention.length === 0 ? (
                  <div className="all-good">
                    <CheckCircle2 size={20} /> Stock looks healthy.
                  </div>
                ) : (
                  <div className="mini-list">
                    {attention.slice(0, 5).map((a) => (
                      <button type="button" key={a.id} onClick={() => go("inventory", canRestock ? { stockFor: a.id } : { search: a.sku })}>
                        <ProductTile category={a.category} name={a.name} size={40} />
                        <span className="grow">
                          <b>{a.name}</b>
                          <small>
                            {a.stock === 0 ? "None left" : `${a.stock} left`} · min {a.min}
                          </small>
                        </span>
                        <Badge tone={a.level === "out" ? "danger" : "warning"}>{a.level === "out" ? "Out" : "Low"}</Badge>
                      </button>
                    ))}
                  </div>
                )}
              </Card>
            )}
            {f && f.toOrder.length > 0 && (
              <Card>
                <CardHead title="Order soon" subtitle="Suggested from the forecast" action={<PackageCheck size={18} className="card-head-icon" />} />
                <div className="mini-list">
                  {f.toOrder.map((p) => (
                    <div key={p.id}>
                      <ProductTile category={p.category} name={p.name} size={40} />
                      <span className="grow">
                        <b>{p.name}</b>
                        <small>{p.runsOutOn ? `Runs out ${fmtDayLong(p.runsOutOn)}` : `${p.stock} in stock`}</small>
                      </span>
                      <span className="order-qty">{p.reorder > 0 ? `+${p.reorder}` : "—"}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
            {data.shopWide && (
              <Card>
                <CardHead title="Top sellers" subtitle="Units sold, last 30 days" />
                <div className="rank-list">
                  {data.topProducts.map((p, i) => (
                    <div key={p.id}>
                      <span className="rank">{i + 1}</span>
                      <ProductTile category={p.category} name={p.name} size={40} />
                      <span className="rank-name">
                        <b>{p.name}</b>
                        <small>{p.category}</small>
                      </span>
                      <span className="rank-value">
                        <b>{num(Number(p.units))}</b>
                        <small>{peso0(Number(p.revenue))}</small>
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}
      </div>

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
                  <td>{paymentLabel(s)}</td>
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
