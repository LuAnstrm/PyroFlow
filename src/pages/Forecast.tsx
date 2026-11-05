import { useMemo, useState } from "react"
import { ArrowDownRight, ArrowUpRight, CalendarCheck, CircleDollarSign, Database, Download, Package, PackagePlus, ReceiptText, Target } from "lucide-react"
import { downloadCsv, fmtDay, fmtDayLong, fmtDateTime, fmtMonth, fromKey, num, peso0, useApp, useFetch, type ForecastPoint, type HistoryPoint, type ProductForecast } from "../lib"
import { Badge, Button, Card, CardHead, ErrorBox, Loading, Metric, PageIntro, type Tone } from "../ui"
import { ForecastChart } from "../charts"

type ForecastData = {
  horizon: number
  today: string
  todayPredicted: number
  todayActual: number
  history: HistoryPoint[]
  points: ForecastPoint[]
  predictedRevenue: number
  predictedLow: number
  predictedHigh: number
  priorRevenue: number
  changePct: number | null
  expectedOrders: number
  expectedUnits: number
  peakDay: ForecastPoint | null
  accuracy: number | null
  confidence: string
  backtest: { from: string; to: string; predicted: number; actual: number }[]
  records: { firstDay: string; days: number; seasonalUsed: boolean; salesCount: number; lastSaleAt: string | null }
  products: ProductForecast[]
  months: { month: string; orders: number; revenue: number }[]
}

const ACTION_TONE: Record<ProductForecast["action"], Tone> = { "Out of stock": "danger", "Order now": "danger", "Order soon": "warning", "Enough stock": "success" }

export function ForecastPage() {
  const { go } = useApp()
  const [days, setDays] = useState(30)
  const { data: f, error, loading, reload } = useFetch<ForecastData>(`/forecast?days=${days}`)

  const weeks = useMemo(() => {
    if (!f) return []
    const out: { from: string; to: string; predicted: number; low: number; high: number }[] = []
    for (let i = 0; i < f.points.length; i += 7) {
      const part = f.points.slice(i, i + 7)
      out.push({
        from: part[0].date,
        to: part[part.length - 1].date,
        predicted: part.reduce((s, p) => s + p.predicted, 0),
        low: part.reduce((s, p) => s + p.low, 0),
        high: part.reduce((s, p) => s + p.high, 0),
      })
    }
    return out
  }, [f])

  if (loading && !f) return <Loading label="Reading your sales records…" />
  if (error || !f) return <ErrorBox message={error || "Couldn't load the forecast."} onRetry={reload} />

  const toOrder = f.products.filter((p) => p.action !== "Enough stock")
  const orderNow = f.products.filter((p) => p.action === "Order now" || p.action === "Out of stock").length
  const todayShare = f.todayPredicted ? Math.min(100, (f.todayActual / f.todayPredicted) * 100) : 0
  const exportPlan = () =>
    downloadCsv(`stock-plan-next-${f.horizon}-days.csv`, [
      ["Product", "SKU", "Stock now", "Sold last 28 days", `Expected sales next ${f.horizon} days`, "Runs out on", "Order qty", "Action"],
      ...f.products.map((p) => [p.name, p.sku, p.stock, p.soldLast28, p.expectedUnits, p.runsOutOn ?? "", p.reorder, p.action]),
    ])

  return (
    <div className="page-stack">
      <PageIntro eyebrow="PLANNING" title="Sales forecasting" subtitle="Turn historical patterns into more confident inventory decisions.">
        <div className="segmented">
          {[7, 30, 90].map((d) => (
            <button type="button" key={d} className={days === d ? "active" : ""} onClick={() => setDays(d)}>
              Next {d} days
            </button>
          ))}
        </div>
      </PageIntro>

      <div className={`forecast-answer ${loading ? "is-refreshing" : ""}`}>
        <div>
          <h2>
            Expect about <em>{peso0(f.predictedRevenue)}</em> in sales over the next {f.horizon} days
            {f.changePct !== null && (
              <span className={f.changePct >= 0 ? "up" : "down"}>
                {f.changePct >= 0 ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
                {Math.abs(f.changePct).toFixed(0)}% {f.changePct >= 0 ? "more" : "less"} than the last {f.horizon} days
              </span>
            )}
          </h2>
          <p>
            {f.peakDay && (
              <>
                Busiest day: <b>{fmtDayLong(f.peakDay.date)}</b> (about {peso0(f.peakDay.predicted)}).{" "}
              </>
            )}
            {toOrder.length ? (
              <>
                <b>
                  {toOrder.length} of {f.products.length} products
                </b>{" "}
                need reordering{orderNow ? `, ${orderNow} of them now` : ""}.
              </>
            ) : (
              "Your current stock covers the expected sales."
            )}
          </p>
        </div>
      </div>

      <div className="metrics-grid">
        <Metric icon={CircleDollarSign} label="Predicted sales" value={peso0(f.predictedRevenue)} note={`${peso0(f.predictedLow)} – ${peso0(f.predictedHigh)}`} />
        <Metric icon={ReceiptText} label="Expected transactions" value={num(f.expectedOrders)} note={`About ${num(f.expectedOrders / f.horizon)} a day`} tone="blue" />
        <Metric icon={Package} label="Expected units sold" value={num(f.expectedUnits)} note="Across all products" tone="gold" />
        <Metric
          icon={Target}
          label="Forecast accuracy"
          value={f.accuracy !== null ? `${f.accuracy}%` : "Not yet"}
          note={f.accuracy !== null ? `${f.confidence} confidence, tested on the last 4 weeks` : "Needs about 2 months of sales"}
          tone="green"
        />
      </div>

      <div className="forecast-main">
        <Card>
          <CardHead title="Daily sales: actual and forecast" subtitle={`Last 60 days of records, then the next ${f.horizon} days. Hover to see each day.`} />
          <ForecastChart history={f.history} points={f.points} height={320} />
        </Card>
        <div className="side-stack">
          <Card>
            <CardHead title="Today vs forecast" subtitle="Updates with every sale" />
            <div className="today-track">
              <strong>{peso0(f.todayActual)}</strong>
              <span>of about {peso0(f.todayPredicted)} expected</span>
              <div className="share-track">
                <i style={{ width: `${todayShare}%` }} />
              </div>
            </div>
          </Card>
          <Card>
            <CardHead title="Sales records used" />
            <dl className="record-facts">
              <div>
                <dt>
                  <Database size={15} /> Recorded sales
                </dt>
                <dd>{num(f.records.salesCount)}</dd>
              </div>
              <div>
                <dt>
                  <CalendarCheck size={15} /> Records start
                </dt>
                <dd>{fromKey(f.records.firstDay).toLocaleDateString("en-PH", { month: "short", year: "numeric" })}</dd>
              </div>
              <div>
                <dt>
                  <ReceiptText size={15} /> Latest sale
                </dt>
                <dd>{f.records.lastSaleAt ? fmtDateTime(f.records.lastSaleAt) : "None yet"}</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>

      <Card>
        <CardHead
          title="What to order"
          subtitle={`Stock now compared with expected sales over the next ${f.horizon} days. Order quantity also keeps your minimum stock.`}
          action={
            <Button variant="secondary" onClick={exportPlan}>
              <Download size={16} /> Export CSV
            </Button>
          }
        />
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th className="num">Stock now</th>
                <th className="num">Sold, last 28 days</th>
                <th className="num">Expected sales</th>
                <th>Runs out</th>
                <th className="num">Order qty</th>
                <th>Decision</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {f.products.map((p) => (
                <tr key={p.id}>
                  <td>
                    <b>{p.name}</b>
                    <small className="cell-sub">{p.sku}</small>
                  </td>
                  <td className="num">{p.stock}</td>
                  <td className="num">{p.soldLast28}</td>
                  <td className="num">
                    <b>{num(p.expectedUnits)}</b>
                  </td>
                  <td>{p.stock === 0 ? "Already out" : p.runsOutOn ? `${fmtDay(p.runsOutOn)} (${p.daysOfCover} days)` : `Lasts past ${f.horizon} days`}</td>
                  <td className="num">
                    <strong>{p.reorder > 0 ? num(p.reorder) : "—"}</strong>
                  </td>
                  <td>
                    <Badge tone={ACTION_TONE[p.action]}>{p.action}</Badge>
                  </td>
                  <td>
                    {p.reorder > 0 && (
                      <Button size="sm" variant="secondary" onClick={() => go("inventory", { stockFor: p.id })}>
                        <PackagePlus size={15} /> Stock in
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="dashboard-grid lower">
        <Card>
          <CardHead title="Forecast by week" subtitle="The same forecast as the chart, as numbers" />
          <div className="table-scroll compact">
            <table>
              <thead>
                <tr>
                  <th>Week</th>
                  <th className="num">Forecast</th>
                  <th className="num">Likely range</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((w) => (
                  <tr key={w.from}>
                    <td>
                      {fmtDay(w.from)} – {fmtDay(w.to)}
                    </td>
                    <td className="num">
                      <b>{peso0(w.predicted)}</b>
                    </td>
                    <td className="num">
                      {peso0(w.low)} – {peso0(w.high)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card>
          <CardHead title="Can you trust it?" subtitle="We forecast the last 4 weeks without looking, then compared with real sales" />
          {f.backtest.length ? (
            <div className="table-scroll compact">
              <table>
                <thead>
                  <tr>
                    <th>Week</th>
                    <th className="num">Forecast</th>
                    <th className="num">Actual</th>
                    <th className="num">Off by</th>
                  </tr>
                </thead>
                <tbody>
                  {f.backtest.map((w) => (
                    <tr key={w.from}>
                      <td>
                        {fmtDay(w.from)} – {fmtDay(w.to)}
                      </td>
                      <td className="num">{peso0(w.predicted)}</td>
                      <td className="num">
                        <b>{peso0(w.actual)}</b>
                      </td>
                      <td className="num">{w.actual ? `${Math.round((Math.abs(w.predicted - w.actual) / w.actual) * 100)}%` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted-text">Not enough sales history yet. This fills in after about 2 months of records.</p>
          )}
        </Card>
      </div>

      <div className="dashboard-grid lower">
        <Card>
          <CardHead title="Monthly sales records" subtitle="Completed sales the forecast learns from" />
          <div className="table-scroll compact scroll-y">
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="num">Transactions</th>
                  <th className="num">Sales</th>
                </tr>
              </thead>
              <tbody>
                {f.months.map((m) => (
                  <tr key={m.month}>
                    <td>{fmtMonth(m.month)}</td>
                    <td className="num">{num(Number(m.orders))}</td>
                    <td className="num">
                      <b>{peso0(Number(m.revenue))}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card>
          <CardHead title="How the forecast is calculated" />
          <ol className="how-list">
            <li>
              <b>Recent pace.</b> Average daily sales over the last 28 days.
            </li>
            <li>
              <b>Weekday pattern.</b> How each day of the week compares with the average, from the last 8 weeks.
            </li>
            <li>
              <b>Season.</b> {f.records.seasonalUsed ? "How the same dates rose or fell last year, such as the New Year's Eve rush." : "Added once there's a full year of records. Not used yet."}
            </li>
            <li>
              <b>Range.</b> Widened or narrowed by how far off the last 4 weeks' forecast was.
            </li>
          </ol>
          <p className="muted-text">Refunded sales are left out. Today isn't counted until the day ends, since it's still in progress.</p>
        </Card>
      </div>
    </div>
  )
}
