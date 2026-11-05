// Sales forecast built only from the recorded `sales` table.
//
//   predicted day = recent daily average x weekday pattern x seasonal change
//
// - recent daily average: mean of the last 28 days
// - weekday pattern: how each weekday compares with the average, last 8 weeks
// - seasonal change: how the same calendar dates moved last year, so holidays
//   like New Year's Eve line up. Skipped until there is a year of records.
//
// Accuracy comes from a backtest: forecast the last 28 days as if they had not
// happened, then compare with what was really sold.

const DAY = 86400000
export const toKey = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}
const fromKey = (k) => {
  const [y, m, d] = k.split("-").map(Number)
  return new Date(y, m - 1, d)
}
const addDays = (k, n) => {
  const d = fromKey(k)
  d.setDate(d.getDate() + n)
  return toKey(d)
}
const lastYear = (k) => {
  const d = fromKey(k)
  d.setFullYear(d.getFullYear() - 1)
  return toKey(d)
}
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0)

function windowValues(series, endKey, days) {
  const out = []
  for (let i = days - 1; i >= 0; i--) out.push(series.get(addDays(endKey, -i)) ?? 0)
  return out
}

/** How each future date should scale compared with the recent average. */
function seasonalRatio(series, asOf, target, firstKey) {
  const lastYearAsOf = lastYear(asOf)
  if (lastYearAsOf < firstKey) return 1
  const reference = mean(windowValues(series, lastYearAsOf, 28))
  if (!reference) return 1
  const around = mean(windowValues(series, addDays(lastYear(target), 2), 5))
  return Math.min(8, Math.max(0.2, around / reference))
}

function weekdayPattern(series, asOf) {
  const totals = Array(7).fill(0)
  const counts = Array(7).fill(0)
  for (let i = 0; i < 56; i++) {
    const key = addDays(asOf, -i)
    const dow = fromKey(key).getDay()
    totals[dow] += series.get(key) ?? 0
    counts[dow]++
  }
  const avgs = totals.map((t, i) => (counts[i] ? t / counts[i] : 0))
  const overall = mean(avgs)
  // Pulled part-way to 1: eight weeks is too little to trust a weekday fully.
  return avgs.map((a) => (overall ? 1 + (a / overall - 1) * 0.6 : 1))
}

export function predictDays(series, asOf, horizon, firstKey) {
  const base = mean(windowValues(series, asOf, 28))
  const pattern = weekdayPattern(series, asOf)
  const out = []
  for (let i = 1; i <= horizon; i++) {
    const date = addDays(asOf, i)
    const seasonal = seasonalRatio(series, asOf, date, firstKey)
    const value = base * pattern[fromKey(date).getDay()] * seasonal
    out.push({ date, value, seasonal })
  }
  return out
}

/** Mean absolute percentage error over weekly totals of the last 28 days. */
function backtest(series, today, firstKey) {
  const asOf = addDays(today, -28)
  if (asOf < addDays(firstKey, 28)) return null
  const predicted = predictDays(series, asOf, 28, firstKey)
  const errors = []
  const rows = []
  for (let week = 0; week < 4; week++) {
    const days = predicted.slice(week * 7, week * 7 + 7)
    const p = days.reduce((s, d) => s + d.value, 0)
    const a = days.reduce((s, d) => s + (series.get(d.date) ?? 0), 0)
    rows.push({ from: days[0].date, to: days[6].date, predicted: Math.round(p), actual: Math.round(a) })
    if (a > 0) errors.push(Math.abs(p - a) / a)
  }
  return errors.length ? { error: mean(errors), rows } : null
}

export function confidenceLabel(accuracy, days) {
  if (accuracy === null) return "Not enough data"
  if (days < 180) return accuracy >= 75 ? "Moderate" : "Low"
  return accuracy >= 80 ? "High" : accuracy >= 60 ? "Moderate" : "Low"
}

export function buildForecast({ daily, productDaily, products, horizon, today }) {
  const revenue = new Map(daily.map((d) => [d.day, d.revenue]))
  const orders = new Map(daily.map((d) => [d.day, d.orders]))
  const firstKey = daily[0]?.day ?? today
  // Today is still in progress, so the forecast starts from yesterday's close.
  const asOf = addDays(today, -1)

  const allDays = predictDays(revenue, asOf, horizon + 1, firstKey)
  const days = allDays.slice(1)
  const test = backtest(revenue, asOf, firstKey)
  const error = test ? Math.min(0.9, test.error) : 0.35
  const accuracy = test ? Math.round((1 - Math.min(1, test.error)) * 100) : null
  const historyDays = Math.round((fromKey(today) - fromKey(firstKey)) / DAY) + 1

  const points = days.map((d) => ({
    date: d.date,
    predicted: Math.round(d.value),
    low: Math.round(d.value * (1 - error)),
    high: Math.round(d.value * (1 + error)),
  }))
  const history = windowValues(revenue, today, 60).map((actual, i) => ({
    date: addDays(today, i - 59),
    actual: Math.round(actual),
  }))

  const predictedRevenue = points.reduce((s, p) => s + p.predicted, 0)
  const prior = windowValues(revenue, asOf, horizon).reduce((s, v) => s + v, 0)
  const orderTotal = predictDays(orders, asOf, horizon + 1, firstKey)
    .slice(1)
    .reduce((s, d) => s + d.value, 0)
  const peak = points.reduce((a, b) => (b.predicted > a.predicted ? b : a), points[0])

  const productForecasts = products.map((p) => {
    const series = new Map((productDaily.get(p.id) ?? []).map((r) => [r.day, r.units]))
    const dailyUnits = mean(windowValues(series, asOf, 28))
    // Blend the product's own season with the shop's; thin products use the shop's
    // alone so one lucky week can't swing them.
    const shopSeason = mean(days.map((d) => d.seasonal))
    const ownBase = windowValues(series, lastYear(asOf), 28).reduce((s, v) => s + v, 0)
    const ownSeason = mean(days.map((d) => seasonalRatio(series, asOf, d.date, firstKey)))
    const season = ownBase >= 20 ? (ownSeason + shopSeason) / 2 : shopSeason
    const units = dailyUnits * horizon * season
    const expectedUnits = Math.round(units)
    const perDay = units / horizon
    const daysOfCover = perDay > 0 ? Math.floor(p.stock / perDay) : null
    const reorder = Math.max(0, Math.ceil(units + p.min_stock - p.stock))
    let action = "Enough stock"
    if (p.stock === 0 && reorder > 0) action = "Out of stock"
    else if (daysOfCover !== null && daysOfCover < Math.min(7, horizon)) action = "Order now"
    else if (reorder > 0) action = "Order soon"
    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      category: p.category,
      stock: p.stock,
      min: p.min_stock,
      soldLast28: Math.round(dailyUnits * 28),
      expectedUnits,
      daysOfCover,
      runsOutOn: daysOfCover !== null && daysOfCover < horizon ? addDays(today, daysOfCover) : null,
      reorder,
      action,
    }
  })
  const rank = { "Out of stock": 0, "Order now": 1, "Order soon": 2, "Enough stock": 3 }
  productForecasts.sort((a, b) => rank[a.action] - rank[b.action] || b.expectedUnits - a.expectedUnits)

  return {
    horizon,
    today,
    todayPredicted: Math.round(allDays[0].value),
    todayActual: Math.round(revenue.get(today) ?? 0),
    history,
    points,
    predictedRevenue,
    predictedLow: Math.round(predictedRevenue * (1 - error)),
    predictedHigh: Math.round(predictedRevenue * (1 + error)),
    priorRevenue: Math.round(prior),
    changePct: prior ? Math.round(((predictedRevenue - prior) / prior) * 1000) / 10 : null,
    expectedOrders: Math.round(orderTotal),
    expectedUnits: productForecasts.reduce((s, p) => s + p.expectedUnits, 0),
    peakDay: peak ?? null,
    accuracy,
    confidence: confidenceLabel(accuracy, historyDays),
    backtest: test?.rows ?? [],
    records: {
      firstDay: firstKey,
      days: historyDays,
      seasonalUsed: lastYear(asOf) >= firstKey,
    },
    products: productForecasts,
  }
}
