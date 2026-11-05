// Creates the database, tables and demo data. Run with `npm run db:setup`.
// Pass --reset to delete the existing database first.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import mysql from "mysql2/promise"
import bcrypt from "bcryptjs"
import { connectionConfig, dbName } from "./db.js"

const here = path.dirname(fileURLToPath(import.meta.url))

const PRODUCTS = [
  // name, sku, category, price, cost, current stock, min stock, popularity
  ["Sky Rocket", "RKT-001", "Rockets", 150, 88, 34, 10, 1.5],
  ["Roman Candle", "RMC-012", "Roman Candles", 120, 70, 18, 12, 1.3],
  ["Sparkler Pack", "SPK-024", "Sparklers", 50, 22, 62, 20, 2.6],
  ["Fountain Firework", "FTN-008", "Fountains", 250, 145, 9, 12, 1.1],
  ["Aerial Firework Cake", "AFC-036", "Aerial Fireworks", 850, 520, 14, 6, 0.8],
  ["Ground Spinner", "GSP-014", "Ground Fireworks", 80, 38, 0, 15, 1.0],
  ["Assorted Fireworks Box", "ASB-050", "Assorted Fireworks", 1200, 760, 11, 5, 0.6],
  ["Firecracker Pack", "FCP-100", "Firecrackers", 100, 55, 7, 18, 2.0],
  ["Color Smoke Effect", "CSM-018", "Ground Fireworks", 180, 100, 26, 10, 0.7],
  ["Celebration Firework Set", "CFS-150", "Assorted Fireworks", 1500, 940, 5, 5, 0.5],
]

const USERS = [
  // The demo logins from the original prototype.
  ["Alex Rivera", "Admin123", "Admin", "Administrator", "Active"],
  ["Sofia Reyes", "Owner123", "Owner", "Owner", "Active"],
  ["Mia Santos", "Staff", "Staff", "Staff", "Active"],
  ["John Cruz", "john.cruz", "Staff1234", "Staff", "Active"],
  ["Elena Lim", "elena.lim", "Staff1234", "Staff", "Inactive"],
]

const SETTINGS = {
  business_name: "PyroFlow Fireworks Shop",
  business_address: "18 Celebration Avenue, Quezon City",
  contact_number: "(02) 8555-0198",
  email: "hello@pyroflow.demo",
  tin: "000-381-924-000",
  branch_name: "Downtown Branch",
  tax_rate: "12",
  receipt_header: "Thank you for celebrating with us!",
  receipt_footer: "Please use fireworks responsibly.",
  receipt_show_cashier: "1",
  receipt_show_tin: "1",
  receipt_auto_print: "0",
  low_stock_alerts: "1",
  alert_after_sale: "1",
}

// Tiny seeded RNG so every setup produces the same demo history.
let rngState = 20261103
const rand = () => {
  rngState = (rngState * 1664525 + 1013904223) >>> 0
  return rngState / 4294967296
}
const pad = (n) => String(n).padStart(2, "0")
const pick = (weights) => {
  let r = rand() * weights.reduce((s, w) => s + w, 0)
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]
    if (r <= 0) return i
  }
  return weights.length - 1
}
const money = (n) => Math.round(n * 100) / 100

/** Philippine fireworks demand: New Year's Eve dominates, with smaller bumps. */
function seasonFactor(d) {
  const m = d.getMonth() + 1
  const day = d.getDate()
  if (m === 12 && day >= 28) return 7.5
  if (m === 12 && day >= 20) return 4.2
  if (m === 12) return 2.3
  if (m === 1 && day === 1) return 3.2
  if (m === 1 && day <= 4) return 1.3
  if (m === 2 && day <= 18) return 1.5 // Chinese New Year
  if (m === 11) return 1.25
  if (m === 5 || m === 6) return 1.15 // fiesta season
  return 0.9
}

function buildHistory(today, products, staffIds, taxRate) {
  const sales = []
  const start = new Date(today)
  start.setMonth(start.getMonth() - 22)
  start.setDate(1)
  const weights = products.map((p) => p[7])
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const isToday = d.toDateString() === today.toDateString()
    const dow = d.getDay()
    const weekend = dow === 0 || dow === 6 ? 1.35 : dow === 5 ? 1.15 : 1
    const growth = 1 + (d - start) / (365 * 86400000) * 0.12
    const base = 6 * seasonFactor(d) * weekend * growth * (0.82 + rand() * 0.36)
    const count = isToday ? Math.min(9, Math.round(base)) : Math.round(base)
    for (let i = 0; i < count; i++) {
      const hour = 9 + Math.floor(rand() * 11)
      const when = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, Math.floor(rand() * 60), Math.floor(rand() * 60))
      if (when > today) continue
      const lines = new Map()
      const lineCount = 1 + pick([5, 3, 2, 1])
      for (let l = 0; l < lineCount; l++) {
        const idx = pick(weights)
        lines.set(idx, (lines.get(idx) ?? 0) + 1 + pick([6, 3, 1]))
      }
      const items = [...lines].map(([idx, qty]) => ({ idx, qty }))
      const subtotal = items.reduce((s, it) => s + products[it.idx][3] * it.qty, 0)
      const discountPct = [0, 0, 0, 0, 0, 0, 5, 10][pick([1, 1, 1, 1, 1, 1, 1, 1])]
      const discount = money((subtotal * discountPct) / 100)
      const tax = money(((subtotal - discount) * taxRate) / 100)
      const total = money(subtotal - discount + tax)
      const method = ["Cash", "Online Payment", "Card"][pick([6, 3, 2])]
      const refunded = rand() < 0.012
      sales.push({ when, items, subtotal, discountPct, discount, tax, total, method, refunded, user: staffIds[pick([3, 2])] })
    }
  }
  sales.sort((a, b) => a.when - b.when)
  return sales
}

const sqlDate = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`

async function insertBatched(conn, sql, rows, size = 1000) {
  for (let i = 0; i < rows.length; i += size) {
    await conn.query(sql, [rows.slice(i, i + size)])
  }
}

async function main() {
  const reset = process.argv.includes("--reset")
  const conn = await mysql.createConnection({ ...connectionConfig, multipleStatements: true })
  if (reset) await conn.query(`DROP DATABASE IF EXISTS \`${dbName}\``)
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
  await conn.query(`USE \`${dbName}\``)
  await conn.query(fs.readFileSync(path.join(here, "schema.sql"), "utf8"))

  const [[{ n }]] = await conn.query("SELECT COUNT(*) AS n FROM users")
  if (n > 0) {
    console.log(`Database "${dbName}" already has data, so nothing was changed.`)
    console.log("Run `npm run db:reset` to delete it and start over.")
    await conn.end()
    return
  }

  const now = new Date()
  const userRows = []
  for (const [name, username, password, role, status] of USERS) {
    userRows.push([name, username, await bcrypt.hash(password, 10), role, status, sqlDate(new Date(now.getTime() - 500 * 86400000))])
  }
  await conn.query("INSERT INTO users (full_name, username, password_hash, role, status, created_at) VALUES ?", [userRows])
  const [users] = await conn.query("SELECT id, username FROM users ORDER BY id")
  const uid = Object.fromEntries(users.map((u) => [u.username, u.id]))

  await conn.query("INSERT INTO products (name, sku, category, price, cost, stock, min_stock) VALUES ?", [
    PRODUCTS.map((p) => p.slice(0, 7)),
  ])
  const [productRows] = await conn.query("SELECT id, sku FROM products")
  const pid = Object.fromEntries(productRows.map((p) => [p.sku, p.id]))
  const productId = (idx) => pid[PRODUCTS[idx][1]]

  await conn.query("INSERT INTO settings (setting_key, setting_value) VALUES ?", [Object.entries(SETTINGS)])

  const taxRate = Number(SETTINGS.tax_rate)
  const sales = buildHistory(now, PRODUCTS, [uid.Staff, uid["john.cruz"]], taxRate)
  const saleRows = sales.map((s, i) => {
    const id = i + 1
    return [
      id, `TXN-${s.when.getFullYear()}-${String(id).padStart(6, "0")}`, s.user, sqlDate(s.when), s.subtotal, s.discountPct, s.discount, taxRate, s.tax, s.total, s.method,
      s.method === "Cash" ? Math.ceil(s.total / 100) * 100 : null,
      s.method === "Cash" ? money(Math.ceil(s.total / 100) * 100 - s.total) : null,
      s.method === "Cash" ? null : `REF${100000 + id}`,
      s.refunded ? "Refunded" : "Completed",
      s.refunded ? sqlDate(s.when) : null,
      s.refunded ? uid.Owner123 : null,
      s.refunded ? "Customer returned the item" : null,
    ]
  })
  await insertBatched(conn, `INSERT INTO sales (id, txn_no, user_id, sold_at, subtotal, discount_pct, discount_amount, tax_rate, tax_amount, total, payment_method, amount_tendered, change_due, payment_reference, status, refunded_at, refunded_by, refund_reason) VALUES ?`, saleRows)

  const itemRows = []
  sales.forEach((s, i) => {
    for (const it of s.items) {
      const p = PRODUCTS[it.idx]
      itemRows.push([i + 1, productId(it.idx), p[0], p[1], p[3], p[4], it.qty, p[3] * it.qty])
    }
  })
  await insertBatched(conn, "INSERT INTO sale_items (sale_id, product_id, product_name, sku, unit_price, unit_cost, qty, line_total) VALUES ?", itemRows)

  // Movement log for the last 30 days, worked backwards from today's stock so
  // every "stock after" figure agrees with the current stock level.
  const cutoff = new Date(now.getTime() - 30 * 86400000)
  const events = []
  sales.forEach((s, i) => {
    if (s.when < cutoff || s.refunded) return
    for (const it of s.items) events.push({ when: s.when, idx: it.idx, change: -it.qty, type: "Sale", note: `Sale TXN-${s.when.getFullYear()}-${String(i + 1).padStart(6, "0")}`, user: s.user, sale: i + 1 })
  })
  PRODUCTS.forEach((p, idx) => {
    for (let w = 0; w < 4; w++) {
      const when = new Date(now.getTime() - (w * 7 + 2 + idx * 0.4) * 86400000)
      events.push({ when, idx, change: Math.max(12, Math.round(p[7] * 22)), type: "Restock", note: "Supplier delivery", user: uid.Owner123, sale: null })
    }
  })
  const special = [
    [1, 3, -2, "Damaged", "Crushed in storage"],
    [7, 5, -3, "Adjustment", "Physical count correction"],
  ]
  for (const [idx, ago, change, type, note] of special) {
    events.push({ when: new Date(now.getTime() - ago * 86400000), idx, change, type, note, user: uid.Owner123, sale: null })
  }
  events.sort((a, b) => b.when - a.when)
  const running = PRODUCTS.map((p) => p[5])
  const moveRows = []
  for (const e of events) {
    // A delivery can't be bigger than the stock that existed right after it.
    if (e.type === "Restock") e.change = Math.min(e.change, running[e.idx])
    if (e.change === 0) continue
    const after = running[e.idx]
    running[e.idx] -= e.change
    moveRows.push([productId(e.idx), e.type, e.change, after, e.note, e.user, e.sale, sqlDate(e.when)])
  }
  moveRows.reverse()
  await insertBatched(conn, "INSERT INTO stock_movements (product_id, type, change_qty, stock_after, note, user_id, sale_id, created_at) VALUES ?", moveRows)

  // A little login history so the admin screen has something to show.
  const logs = []
  for (let d = 12; d >= 1; d--) {
    const day = new Date(now.getTime() - d * 86400000)
    const at = (h, m) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m)
    logs.push([uid.Staff, "Staff", 1, null, "127.0.0.1", "Chrome on Windows", sqlDate(at(8, 2)), sqlDate(at(13, 5))])
    logs.push([uid["john.cruz"], "john.cruz", 1, null, "127.0.0.1", "Chrome on Windows", sqlDate(at(13, 8)), sqlDate(at(20, 1))])
    if (d % 3 === 0) logs.push([uid.Owner123, "Owner123", 1, null, "127.0.0.1", "Safari on iPhone", sqlDate(at(19, 30)), sqlDate(at(19, 52))])
    if (d % 5 === 0) logs.push([uid.Staff, "Staff", 0, "Wrong password", "127.0.0.1", "Chrome on Windows", sqlDate(at(8, 0)), null])
  }
  await conn.query("INSERT INTO login_logs (user_id, username, success, reason, ip, user_agent, login_at, logout_at) VALUES ?", [logs])
  await conn.query("UPDATE users u SET last_login_at = (SELECT MAX(login_at) FROM login_logs l WHERE l.user_id = u.id AND l.success = 1)")

  console.log(`Database "${dbName}" is ready: ${sales.length} sales, ${itemRows.length} sale items, ${moveRows.length} stock movements.`)
  await conn.end()
}

main().catch((err) => {
  if (err.code === "ECONNREFUSED") {
    console.error(`Could not reach MySQL at ${connectionConfig.host}:${connectionConfig.port}. Is the MySQL server running?`)
  } else if (err.code === "ER_ACCESS_DENIED_ERROR") {
    console.error("MySQL rejected the username or password. Set DB_USER and DB_PASSWORD in the .env file.")
  } else {
    console.error(err)
  }
  process.exit(1)
})
