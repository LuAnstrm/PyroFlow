import { useEffect, useRef, useState } from "react"
import { fmtDay, fmtDayLong, fmtMonth, peso0, pesoShort, type ForecastPoint, type HistoryPoint } from "./lib"

export const SERIES = { actual: "#2f6fb3", forecast: "#e8590c", third: "#0f9d8a", fourth: "#c98a00" }

function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  useEffect(() => {
    if (!ref.current) return
    const obs = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])
  return { ref, width }
}

function niceMax(v: number) {
  if (v <= 0) return 100
  const mag = 10 ** Math.floor(Math.log10(v))
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * mag >= v) return m * mag
  return 10 * mag
}

function YGrid({ width, plotH, left, max, ticks = 4 }: { width: number; plotH: number; left: number; max: number; ticks?: number }) {
  return (
    <>
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const y = 8 + plotH - (plotH * i) / ticks
        return (
          <g key={i}>
            <line x1={left} x2={width} y1={y} y2={y} className="chart-grid" />
            <text x={left - 8} y={y + 4} textAnchor="end" className="chart-tick">
              {pesoShort((max * i) / ticks)}
            </text>
          </g>
        )
      })}
    </>
  )
}

/** Actual sales up to today, then the forecast with its expected range. */
export function ForecastChart({ history, points, height = 300 }: { history: HistoryPoint[]; points: ForecastPoint[]; height?: number }) {
  const { ref, width } = useWidth()
  const [hover, setHover] = useState<number | null>(null)
  const left = 52
  const bottom = 28
  const plotH = height - bottom - 8
  const plotW = Math.max(10, width - left - 6)
  const total = history.length + points.length
  const max = niceMax(Math.max(...history.map((h) => h.actual), ...points.map((p) => p.high), 1))
  const x = (i: number) => left + (i / Math.max(1, total - 1)) * plotW
  const y = (v: number) => 8 + plotH - (v / max) * plotH
  const line = (vals: [number, number][]) => vals.map(([i, v], n) => `${n ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ")

  const todayI = history.length - 1
  const actualPath = line(history.map((h, i) => [i, h.actual]))
  const forecastPath = line([[todayI, history[todayI]?.actual ?? 0], ...points.map((p, i): [number, number] => [todayI + 1 + i, p.predicted])])
  const band =
    line(points.map((p, i) => [todayI + 1 + i, p.high])) +
    " " +
    points
      .map((p, i) => [todayI + 1 + i, p.low] as [number, number])
      .reverse()
      .map(([i, v]) => `L${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
      .join(" ") +
    " Z"

  const every = Math.max(1, Math.ceil(total / Math.max(3, Math.floor(plotW / 84))))
  const dateAt = (i: number) => (i < history.length ? history[i].date : points[i - history.length].date)
  const hovered = hover === null ? null : hover < history.length ? { date: history[hover].date, actual: history[hover].actual } : points[hover - history.length]

  return (
    <div className="chart" ref={ref}>
      <div className="chart-legend">
        <span>
          <i className="swatch-line" style={{ background: SERIES.actual }} /> Actual sales
        </span>
        <span>
          <i className="swatch-dash" style={{ borderColor: SERIES.forecast }} /> Forecast
        </span>
        <span>
          <i className="swatch-band" /> Expected range
        </span>
      </div>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label="Daily sales so far and forecast for the coming days"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect()
          const i = Math.round(((e.clientX - box.left - left) / plotW) * (total - 1))
          setHover(Math.min(total - 1, Math.max(0, i)))
        }}
      >
        <YGrid width={width} plotH={plotH} left={left} max={max} />
        {Array.from({ length: total }, (_, i) =>
          i % every === 0 ? (
            <text key={i} x={x(i)} y={height - 8} textAnchor="middle" className="chart-tick">
              {fmtDay(dateAt(i))}
            </text>
          ) : null,
        )}
        <path d={band} fill={SERIES.forecast} opacity={0.14} />
        <line x1={x(todayI)} x2={x(todayI)} y1={8} y2={8 + plotH} className="chart-today" />
        <text x={x(todayI) - 6} y={20} textAnchor="end" className="chart-label">
          Today
        </text>
        <path d={actualPath} fill="none" stroke={SERIES.actual} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <path d={forecastPath} fill="none" stroke={SERIES.forecast} strokeWidth={2} strokeDasharray="6 4" strokeLinejoin="round" strokeLinecap="round" />
        {hover !== null && hovered && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={8} y2={8 + plotH} className="chart-cross" />
            <circle
              cx={x(hover)}
              cy={y("actual" in hovered ? hovered.actual : hovered.predicted)}
              r={5}
              fill={"actual" in hovered ? SERIES.actual : SERIES.forecast}
              stroke="white"
              strokeWidth={2}
            />
          </>
        )}
      </svg>
      {hover !== null && hovered && (
        <div className="chart-tip" style={{ left: Math.min(width - 190, Math.max(0, x(hover) + 12)), top: 40 }}>
          <b>{fmtDayLong(hovered.date)}</b>
          {"actual" in hovered ? (
            <span>Actual: {peso0(hovered.actual)}</span>
          ) : (
            <>
              <span>Forecast: {peso0(hovered.predicted)}</span>
              <small>
                Range {peso0(hovered.low)} – {peso0(hovered.high)}
              </small>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** One series of bars; labels are "YYYY-MM" (months) or "YYYY-MM-DD" (days). */
export function BarChart({ data, height = 240 }: { data: { label: string; value: number; orders?: number }[]; height?: number }) {
  const { ref, width } = useWidth()
  const [hover, setHover] = useState<number | null>(null)
  const left = 52
  const bottom = 28
  const plotH = height - bottom - 8
  const plotW = Math.max(10, width - left)
  const max = niceMax(Math.max(...data.map((d) => d.value), 1))
  const slot = plotW / Math.max(1, data.length)
  const barW = Math.max(2, Math.min(24, slot - 2))
  const label = (l: string) => (l.length === 7 ? fmtMonth(l).split(" ")[0] : fmtDay(l))
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(3, Math.floor(plotW / 62))))
  const item = hover === null ? null : data[hover]
  return (
    <div className="chart" ref={ref}>
      <svg width={width} height={height} role="img" aria-label="Sales over time" onMouseLeave={() => setHover(null)}>
        <YGrid width={width} plotH={plotH} left={left} max={max} />
        {data.map((d, i) => {
          const h = (d.value / max) * plotH
          const cx = left + slot * i + slot / 2
          const barY = 8 + plotH - h
          const r = Math.min(4, barW / 2, h)
          return (
            <g key={d.label} onMouseEnter={() => setHover(i)}>
              <rect x={left + slot * i} y={8} width={slot} height={plotH + bottom - 8} fill="transparent" />
              <path
                d={`M${cx - barW / 2} ${8 + plotH} V${barY + r} Q${cx - barW / 2} ${barY} ${cx - barW / 2 + r} ${barY} H${cx + barW / 2 - r} Q${cx + barW / 2} ${barY} ${cx + barW / 2} ${barY + r} V${8 + plotH} Z`}
                fill={SERIES.actual}
                opacity={hover === null || hover === i ? 1 : 0.45}
              />
              {i % labelEvery === 0 && (
                <text x={cx} y={height - 8} textAnchor="middle" className="chart-tick">
                  {label(d.label)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {item && hover !== null && (
        <div className="chart-tip" style={{ left: Math.min(width - 170, Math.max(0, left + slot * hover + slot)), top: 12 }}>
          <b>{item.label.length === 7 ? fmtMonth(item.label) : fmtDayLong(item.label)}</b>
          <span>{peso0(item.value)}</span>
          {item.orders !== undefined && <small>{item.orders} transactions</small>}
        </div>
      )}
    </div>
  )
}

/** Share of a total as labelled horizontal bars. */
export function ShareBars({ data, valueLabel = peso0 }: { data: { name: string; value: number; note?: string }[]; valueLabel?: (v: number) => string }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1
  return (
    <div className="share-bars">
      {data.map((d) => (
        <div key={d.name}>
          <div className="share-head">
            <span>{d.name}</span>
            <b>
              {valueLabel(d.value)} <small>{Math.round((d.value / total) * 100)}%</small>
            </b>
          </div>
          <div className="share-track">
            <i style={{ width: `${(d.value / total) * 100}%` }} />
          </div>
          {d.note && <small className="share-note">{d.note}</small>}
        </div>
      ))}
    </div>
  )
}
