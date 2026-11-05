import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import express from "express"
import bcrypt from "bcryptjs"
import { query, transaction } from "./db.js"
import { buildForecast, toKey } from "./forecast.js"
import { EDITABLE_ROLES, migrate, PERMISSION_KEYS, PERMISSIONS, ROLES, SECURITY_RULES } from "./permissions.js"

const app = express()
app.disable("x-powered-by")
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.setHeader("X-Frame-Options", "DENY")
  res.setHeader("Referrer-Policy", "same-origin")
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  )
  // Sales and account data must not linger in a shared browser's cache.
  if (req.path.startsWith("/api")) res.setHeader("Cache-Control", "no-store")
  next()
})
app.use(express.json())
// Express 5 leaves req.body undefined when a request has no JSON body.
app.use((req, _res, next) => {
  if (!req.body || typeof req.body !== "object") req.body = {}
  next()
})

class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}
const money = (n) => Math.round(n * 100) / 100
const COOKIE = "pyroflow_session"
const hashToken = (t) => crypto.createHash("sha256").update(t).digest("hex")

// --- Input checks ---------------------------------------------------------
// The database may run without strict mode, where it silently cuts off bad
// values instead of refusing them, so limits are enforced here.

const MAX_PRICE = 99999999.99 // DECIMAL(10,2)
const MAX_TENDERED = 1000000000
const MAX_UNITS = 1000000
const MAX_STOCK = 2000000000 // just under the INT column's limit

/** Trims a text field and refuses anything longer than its column. */
function text(value, label, max) {
  const s = String(value ?? "").trim()
  if (s.length > max) throw new ApiError(400, `${label} can't be longer than ${max} characters.`)
  return s
}
/** Query strings can repeat a key, which arrives as an array. Only a single value counts. */
const single = (v) => (typeof v === "string" ? v : "")
const isId = (v) => /^[1-9]\d{0,9}$/.test(single(v))
function isDateKey(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(single(v))) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}
function readPaging(q) {
  const whole = (v, fallback, max) => {
    const n = Number(single(v))
    return Number.isInteger(n) && n >= 1 ? Math.min(n, max) : fallback
  }
  return { page: whole(q.page, 1, 1000000), size: whole(q.size, 10, 5000) }
}
async function newPassword(value) {
  const password = typeof value === "string" ? value : ""
  const { passwordMin } = await readSecurity()
  if (password.length < passwordMin) throw new ApiError(400, `Use at least ${passwordMin} characters for the password.`)
  // bcrypt ignores everything past 72 bytes, so a longer password would be weaker than it looks.
  if (Buffer.byteLength(password) > 72) throw new ApiError(400, "Use at most 72 characters for the password.")
  return password
}
const mustExist = (result, message) => {
  if (!result.affectedRows) throw new ApiError(404, message)
}

app.param("id", (_req, _res, next, id) => next(isId(id) ? undefined : new ApiError(404, "Not found.")))

function describeAgent(ua = "") {
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Unknown browser"
  const os = /Windows/.test(ua) ? "Windows" : /iPhone|iPad/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "unknown device"
  return `${browser} on ${os}`
}
function readCookie(req) {
  const match = (req.headers.cookie ?? "").match(new RegExp(`(?:^|; )${COOKIE}=([^;]+)`))
  return match?.[1]
}

// --- Permissions ----------------------------------------------------------

/** Saved permissions for each role, held in memory and refreshed whenever an admin saves them. */
let rolePermissions = new Map()
async function loadPermissions() {
  const rows = await query("SELECT role, permission FROM role_permissions WHERE allowed = 1")
  rolePermissions = new Map(EDITABLE_ROLES.map((role) => [role, new Set(rows.filter((r) => r.role === role).map((r) => r.permission))]))
}
const permissionsFor = (role) => (role === "Administrator" ? PERMISSION_KEYS : PERMISSION_KEYS.filter((key) => rolePermissions.get(role)?.has(key)))
const can = (req, permission) => req.user.role === "Administrator" || Boolean(rolePermissions.get(req.user.role)?.has(permission))

// Upgrades older databases on first use. It retries on later requests if MySQL
// isn't ready yet, and the error handler below reports that as DB_DOWN.
let readyPromise = null
app.use("/api", async (_req, _res, next) => {
  readyPromise ??= migrate(query)
    .then(loadPermissions)
    .catch((err) => {
      readyPromise = null
      throw err
    })
  await readyPromise
  next()
})

const publicUser = (u) => ({ id: u.id, name: u.full_name, username: u.username, role: u.role, permissions: permissionsFor(u.role), lastLoginAt: u.last_login_at, createdAt: u.created_at })

// --- Auth ---------------------------------------------------------------

async function readSession(req) {
  const token = readCookie(req)
  if (!token) return null
  const tokenHash = hashToken(token)
  const [row] = await query(
    `SELECT u.*, s.last_seen_at FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > NOW() AND u.status = 'Active'`,
    [tokenHash],
  )
  if (!row) return null
  if (Date.now() - new Date(row.last_seen_at).getTime() > 60000) {
    await query("UPDATE sessions SET last_seen_at = NOW() WHERE token_hash = ?", [tokenHash])
  }
  return { user: row, tokenHash }
}
async function auth(req, _res, next) {
  if (!readCookie(req)) throw new ApiError(401, "Please sign in.")
  const session = await readSession(req)
  if (!session) throw new ApiError(401, "Your session has ended. Please sign in again.")
  req.user = session.user
  req.tokenHash = session.tokenHash
  next()
}
const allow = (...roles) => (req, _res, next) => {
  if (!roles.includes(req.user.role)) throw new ApiError(403, "Your account doesn't have access to this.")
  next()
}
const adminOnly = allow("Administrator")
/** Lets the request through if the account has at least one of these permissions. */
const need = (...permissions) => (req, _res, next) => {
  if (!permissions.some((p) => can(req, p))) throw new ApiError(403, "Your account doesn't have access to this.")
  next()
}

app.get("/api/health", async (_req, res) => {
  await query("SELECT 1 FROM users LIMIT 1")
  res.json({ ok: true })
})

// Slows down password guessing: too many failures in a row locks that username, from
// that address, for a while (both set under Security). Kept in memory, so restarting
// the API clears it.
const failedLogins = new Map()

function recordFailedLogin(key, lockMs) {
  const entry = failedLogins.get(key)
  const count = entry && Date.now() - entry.at < lockMs ? entry.count + 1 : 1
  failedLogins.delete(key)
  failedLogins.set(key, { count, at: Date.now() })
  if (failedLogins.size > 5000) failedLogins.delete(failedLogins.keys().next().value)
}
function loginLockRemaining(key, lockMs, maxFailed) {
  const entry = failedLogins.get(key)
  if (!entry) return 0
  const left = entry.at + lockMs - Date.now()
  if (left <= 0) {
    failedLogins.delete(key)
    return 0
  }
  return entry.count >= maxFailed ? left : 0
}
// Compared against when the username doesn't exist, so a wrong username takes
// as long as a wrong password and response times don't reveal valid usernames.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString("hex"), 10)

app.post("/api/auth/login", async (req, res) => {
  const username = String(req.body.username ?? "").trim().slice(0, 60)
  const password = String(req.body.password ?? "")
  const remember = Boolean(req.body.remember)
  const ua = describeAgent(req.headers["user-agent"])
  const [user] = await query("SELECT * FROM users WHERE username = ?", [username])
  const log = (success, reason) => query("INSERT INTO login_logs (user_id, username, success, reason, ip, user_agent, login_at) VALUES (?,?,?,?,?,?,NOW())", [user?.id ?? null, username, success, reason, req.ip, ua])

  const security = await readSecurity()
  const lockMs = security.lockMinutes * 60000
  const attemptKey = `${req.ip}|${username.toLowerCase()}`
  const lockedMs = loginLockRemaining(attemptKey, lockMs, security.maxFailedLogins)
  if (lockedMs > 0) {
    await log(0, "Too many attempts")
    throw new ApiError(429, `Too many failed attempts. Please try again in ${Math.ceil(lockedMs / 60000)} ${lockedMs > 60000 ? "minutes" : "minute"}.`)
  }
  const passwordOk = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH)
  if (!user || !passwordOk) {
    recordFailedLogin(attemptKey, lockMs)
    await log(0, user ? "Wrong password" : "Unknown username")
    throw new ApiError(401, "The username or password you entered is incorrect.")
  }
  failedLogins.delete(attemptKey)
  if (user.status !== "Active") {
    await log(0, "Account inactive")
    throw new ApiError(403, "This account is inactive. Please ask your administrator to reactivate it.")
  }
  const { insertId } = await log(1, null)
  const token = crypto.randomBytes(32).toString("hex")
  const hours = remember ? 24 * 30 : security.sessionHours
  await query("DELETE FROM sessions WHERE expires_at < NOW()")
  await query("INSERT INTO sessions (token_hash, user_id, login_log_id, expires_at, last_seen_at) VALUES (?,?,?,DATE_ADD(NOW(), INTERVAL ? HOUR),NOW())", [hashToken(token), user.id, insertId, hours])
  await query("UPDATE users SET last_login_at = NOW() WHERE id = ?", [user.id])
  res.setHeader("Set-Cookie", `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/${remember ? `; Max-Age=${hours * 3600}` : ""}${req.secure ? "; Secure" : ""}`)
  res.json({ user: publicUser({ ...user, last_login_at: new Date() }) })
})

app.post("/api/auth/logout", auth, async (req, res) => {
  await query("UPDATE login_logs l JOIN sessions s ON s.login_log_id = l.id SET l.logout_at = NOW() WHERE s.token_hash = ?", [req.tokenHash])
  await query("DELETE FROM sessions WHERE token_hash = ?", [req.tokenHash])
  res.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`)
  res.json({ ok: true })
})

// Not being signed in is a normal answer here, not an error: the app asks on every load.
app.get("/api/auth/me", async (req, res) => {
  const session = await readSession(req)
  res.json({ user: session ? publicUser(session.user) : null })
})

// --- My account ----------------------------------------------------------

app.put("/api/account", auth, async (req, res) => {
  const name = text(req.body.name, "Full name", 120)
  if (!name) throw new ApiError(400, "Please enter your full name.")
  await query("UPDATE users SET full_name = ? WHERE id = ?", [name, req.user.id])
  res.json({ user: publicUser({ ...req.user, full_name: name }) })
})

app.post("/api/account/password", auth, async (req, res) => {
  if (!(await bcrypt.compare(String(req.body.current ?? ""), req.user.password_hash))) throw new ApiError(400, "Your current password is incorrect.")
  const password = await newPassword(req.body.next)
  await query("UPDATE users SET password_hash = ? WHERE id = ?", [await bcrypt.hash(password, 10), req.user.id])
  // Anyone signed in elsewhere with the old password is signed out.
  await endSessions(req.user.id, req.tokenHash)
  res.json({ ok: true })
})

app.get("/api/account/logins", auth, async (req, res) => {
  res.json(await query("SELECT id, success, reason, user_agent AS device, login_at AS loginAt, logout_at AS logoutAt FROM login_logs WHERE user_id = ? ORDER BY login_at DESC LIMIT 8", [req.user.id]))
})

// --- Settings & alerts ---------------------------------------------------

async function readSettings() {
  const rows = await query("SELECT setting_key, setting_value FROM settings")
  return Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]))
}

/** Settings anyone signed in can read. Security values stay out, apart from the password rule forms need. */
async function readPublicSettings() {
  const all = await readSettings()
  const visible = Object.entries(all).filter(([key]) => !key.startsWith("security_") || key === "security_password_min")
  return Object.fromEntries(visible)
}

/** The security rules, falling back to the default if a stored value is unusable. */
async function readSecurity() {
  const stored = await readSettings()
  const value = (key) => {
    const rule = SECURITY_RULES[key]
    const n = Number(stored[key])
    return Number.isInteger(n) && n >= rule.min && n <= rule.max ? n : rule.fallback
  }
  return {
    maxFailedLogins: value("security_max_failed_logins"),
    lockMinutes: value("security_lock_minutes"),
    sessionHours: value("security_session_hours"),
    passwordMin: value("security_password_min"),
  }
}

app.get("/api/settings", auth, async (_req, res) => res.json(await readPublicSettings()))

const SETTING_KEYS = ["business_name", "business_address", "contact_number", "email", "tin", "branch_name", "tax_rate", "receipt_header", "receipt_footer", "receipt_show_cashier", "receipt_show_tin", "receipt_auto_print", "low_stock_alerts", "alert_after_sale"]

app.put("/api/settings", auth, adminOnly, async (req, res) => {
  const entries = Object.entries(req.body).filter(([k]) => SETTING_KEYS.includes(k))
  if ("tax_rate" in req.body) {
    const rate = Number(req.body.tax_rate)
    if (String(req.body.tax_rate).trim() === "" || !Number.isFinite(rate) || rate < 0 || rate > 50) throw new ApiError(400, "Tax rate must be a number from 0 to 50.")
  }
  if ("business_name" in req.body && !String(req.body.business_name).trim()) throw new ApiError(400, "Business name can't be empty.")
  for (const [, v] of entries) text(v, "Each setting", 500)
  for (const [k, v] of entries) {
    await query("INSERT INTO settings (setting_key, setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)", [k, String(v)])
  }
  res.json(await readPublicSettings())
})

async function readAlerts() {
  const settings = await readSettings()
  const items = await query(
    `SELECT p.id, p.name, p.sku, p.category, p.stock, p.min_stock AS min,
       COALESCE((SELECT SUM(si.qty) FROM sale_items si JOIN sales s ON s.id = si.sale_id
         WHERE si.product_id = p.id AND s.status = 'Completed' AND s.sold_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)), 0) AS sold14
     FROM products p WHERE p.active = 1 AND p.stock <= p.min_stock ORDER BY p.stock = 0 DESC, p.stock / GREATEST(p.min_stock, 1)`,
  )
  return {
    enabled: settings.low_stock_alerts === "1",
    items: items.map((p) => ({
      ...p,
      level: p.stock === 0 ? "out" : "low",
      daysLeft: p.sold14 > 0 ? Math.floor(p.stock / (p.sold14 / 14)) : null,
      suggested: Math.max(p.min * 2 - p.stock, 1),
    })),
  }
}
app.get("/api/alerts", auth, async (req, res) => res.json(can(req, "inventory.view") ? await readAlerts() : { enabled: false, items: [] }))

// --- Products & stock ----------------------------------------------------

// The Point of Sale needs the product list too, not just Inventory.
app.get("/api/products", auth, need("inventory.view", "sales.process"), async (req, res) => {
  const rows = await query(
    `SELECT p.id, p.name, p.sku, p.category, p.price, p.cost, p.stock, p.min_stock AS min,
       COALESCE((SELECT SUM(si.qty) FROM sale_items si JOIN sales s ON s.id = si.sale_id
         WHERE si.product_id = p.id AND s.status = 'Completed' AND s.sold_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)), 0) AS sold30
     FROM products p WHERE p.active = 1 ORDER BY p.name`,
  )
  res.json(can(req, "products.pricing") ? rows : rows.map(({ cost, ...p }) => p))
})

function readProductBody(body, withPrices = true) {
  const data = {
    name: text(body.name, "Product name", 120),
    sku: text(body.sku, "SKU", 30).toUpperCase(),
    category: text(body.category, "Category", 60),
    price: Number(body.price),
    cost: Number(body.cost),
    min: Number(body.min),
  }
  if (!data.name || !data.sku || !data.category) throw new ApiError(400, "Name, SKU and category are required.")
  if (withPrices) {
    if (!(data.price >= 0) || !(data.cost >= 0)) throw new ApiError(400, "Price and cost must be 0 or more.")
    if (data.price > MAX_PRICE || data.cost > MAX_PRICE) throw new ApiError(400, "Price and cost can't be more than ₱99,999,999.99.")
  }
  if (!Number.isInteger(data.min) || data.min < 0 || data.min > MAX_UNITS) throw new ApiError(400, "Minimum stock must be a whole number from 0 to 1,000,000.")
  return data
}
const duplicateSku = (err) => {
  if (err.code === "ER_DUP_ENTRY") throw new ApiError(409, "Another product already uses this SKU.")
  throw err
}

// A new product needs a price to be sellable, so anyone who can add one sets its first price.
app.post("/api/products", auth, need("products.edit"), async (req, res) => {
  const data = readProductBody(req.body)
  const stock = Number(req.body.stock ?? 0)
  if (!Number.isInteger(stock) || stock < 0 || stock > MAX_UNITS) throw new ApiError(400, "Opening stock must be a whole number from 0 to 1,000,000.")
  const id = await transaction(async (conn) => {
    const [r] = await conn.query("INSERT INTO products (name, sku, category, price, cost, stock, min_stock) VALUES (?,?,?,?,?,?,?)", [data.name, data.sku, data.category, data.price, data.cost, stock, data.min])
    await conn.query("INSERT INTO stock_movements (product_id, type, change_qty, stock_after, note, user_id, created_at) VALUES (?, 'Initial', ?, ?, 'Opening stock', ?, NOW())", [r.insertId, stock, stock, req.user.id])
    return r.insertId
  }).catch(duplicateSku)
  res.status(201).json({ id })
})

app.put("/api/products/:id", auth, need("products.edit"), async (req, res) => {
  // Without the pricing permission, any price or cost in the request is ignored.
  const pricing = can(req, "products.pricing")
  const data = readProductBody(req.body, pricing)
  const result = await (pricing
    ? query("UPDATE products SET name=?, sku=?, category=?, price=?, cost=?, min_stock=? WHERE id=? AND active = 1", [data.name, data.sku, data.category, data.price, data.cost, data.min, req.params.id])
    : query("UPDATE products SET name=?, sku=?, category=?, min_stock=? WHERE id=? AND active = 1", [data.name, data.sku, data.category, data.min, req.params.id])
  ).catch(duplicateSku)
  mustExist(result, "Product not found.")
  res.json({ ok: true })
})

// Products stay in the database so old receipts and reports keep working.
app.delete("/api/products/:id", auth, need("products.remove"), async (req, res) => {
  const result = await query("UPDATE products SET active = 0, sku = CONCAT(LEFT(sku, 28), '-DEL', id) WHERE id = ? AND active = 1", [req.params.id])
  mustExist(result, "Product not found.")
  res.json({ ok: true })
})

app.post("/api/products/:id/stock", auth, need("inventory.manage"), async (req, res) => {
  const { type } = req.body
  const qty = Number(req.body.qty)
  const note = text(req.body.note, "Note", 200)
  if (!["Restock", "Damaged", "Adjustment"].includes(type)) throw new ApiError(400, "Choose a movement type.")
  if (!Number.isInteger(qty) || qty === 0) throw new ApiError(400, "Enter a whole number of units.")
  if (Math.abs(qty) > MAX_UNITS) throw new ApiError(400, "You can change at most 1,000,000 units at a time.")
  if (type !== "Adjustment" && qty < 0) throw new ApiError(400, "Enter the number of units as a positive number.")
  if (type !== "Restock" && !note) throw new ApiError(400, "Please add a short reason.")
  const change = type === "Damaged" ? -qty : qty
  const product = await transaction(async (conn) => {
    const [[p]] = await conn.query("SELECT id, stock FROM products WHERE id = ? AND active = 1 FOR UPDATE", [req.params.id])
    if (!p) throw new ApiError(404, "Product not found.")
    const after = p.stock + change
    if (after < 0) throw new ApiError(400, `Only ${p.stock} units are in stock, so you can't remove ${-change}.`)
    if (after > MAX_STOCK) throw new ApiError(400, "That would put more units in stock than the system can hold.")
    await conn.query("UPDATE products SET stock = ? WHERE id = ?", [after, p.id])
    await conn.query("INSERT INTO stock_movements (product_id, type, change_qty, stock_after, note, user_id, created_at) VALUES (?,?,?,?,?,?,NOW())", [p.id, type, change, after, note || null, req.user.id])
    return { id: p.id, stock: after }
  })
  res.json(product)
})

app.get("/api/movements", auth, need("inventory.view"), async (req, res) => {
  const { page, size } = readPaging(req.query)
  const where = []
  const params = []
  const type = single(req.query.type)
  const search = single(req.query.search)
  if (type) {
    where.push("m.type = ?")
    params.push(type)
  }
  if (search) {
    where.push("(p.name LIKE ? OR p.sku LIKE ?)")
    params.push(`%${search}%`, `%${search}%`)
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : ""
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM stock_movements m JOIN products p ON p.id = m.product_id ${clause}`, params)
  const rows = await query(
    `SELECT m.id, m.type, m.change_qty AS change_qty, m.stock_after AS stockAfter, m.note, m.created_at AS createdAt,
       p.name AS product, p.sku, u.full_name AS user
     FROM stock_movements m JOIN products p ON p.id = m.product_id JOIN users u ON u.id = m.user_id
     ${clause} ORDER BY m.created_at DESC, m.id DESC LIMIT ? OFFSET ?`,
    [...params, size, (page - 1) * size],
  )
  res.json({ rows, total, page, size })
})

// --- Sales ----------------------------------------------------------------

const SALE_COLUMNS = `s.id, s.txn_no AS txnNo, s.sold_at AS soldAt, s.subtotal, s.discount_pct AS discountPct,
  s.discount_amount AS discountAmount, s.tax_rate AS taxRate, s.tax_amount AS taxAmount, s.total,
  s.payment_method AS method, s.amount_tendered AS tendered, s.change_due AS changeDue,
  s.payment_reference AS reference, s.status, s.refunded_at AS refundedAt, s.refund_reason AS refundReason,
  u.full_name AS cashier`

async function readSale(id) {
  const [sale] = await query(`SELECT ${SALE_COLUMNS} FROM sales s JOIN users u ON u.id = s.user_id WHERE s.id = ?`, [id])
  if (!sale) throw new ApiError(404, "Transaction not found.")
  sale.items = await query("SELECT product_id AS productId, product_name AS name, sku, unit_price AS price, qty, line_total AS lineTotal FROM sale_items WHERE sale_id = ?", [id])
  return sale
}

app.post("/api/sales", auth, need("sales.process"), async (req, res) => {
  const lines = Array.isArray(req.body.items) ? req.body.items : []
  const discountPct = Number(req.body.discountPct ?? 0)
  const method = req.body.method
  const reference = method === "Cash" ? "" : text(req.body.reference, "Reference number", 60)
  if (!lines.length) throw new ApiError(400, "The cart is empty.")
  if (![0, 5, 10].includes(discountPct)) throw new ApiError(400, "Invalid discount.")
  if (!["Cash", "Online Payment", "Card"].includes(method)) throw new ApiError(400, "Choose a payment method.")
  if (method !== "Cash" && !reference) throw new ApiError(400, method === "Card" ? "Enter the card approval code." : "Enter the online payment reference number.")

  // Lines for the same product are added together. Checked one by one, each
  // could pass the stock check on its own and together sell more than exists.
  const quantities = new Map()
  for (const line of lines) {
    const id = Number(line?.productId)
    if (!Number.isInteger(id) || id < 1) throw new ApiError(400, "A product in the cart is no longer available.")
    if (!Number.isInteger(line.qty) || line.qty < 1) throw new ApiError(400, "Invalid quantity.")
    quantities.set(id, (quantities.get(id) ?? 0) + line.qty)
  }

  const settings = await readSettings()
  const taxRate = Number(settings.tax_rate)
  const saleId = await transaction(async (conn) => {
    const [products] = await conn.query("SELECT * FROM products WHERE id IN (?) AND active = 1 ORDER BY id FOR UPDATE", [[...quantities.keys()]])
    const byId = new Map(products.map((p) => [p.id, p]))
    let subtotal = 0
    for (const [id, qty] of quantities) {
      const p = byId.get(id)
      if (!p) throw new ApiError(400, "A product in the cart is no longer available.")
      if (qty > p.stock) throw new ApiError(409, `Only ${p.stock} of ${p.name} left in stock.`)
      subtotal += Number(p.price) * qty
    }
    const discountAmount = money((subtotal * discountPct) / 100)
    const taxAmount = money(((subtotal - discountAmount) * taxRate) / 100)
    const total = money(subtotal - discountAmount + taxAmount)
    const tendered = method === "Cash" ? Number(req.body.tendered) : null
    if (method === "Cash" && !(tendered >= total)) throw new ApiError(400, "Cash received is less than the total.")
    if (method === "Cash" && tendered > MAX_TENDERED) throw new ApiError(400, "Check the cash received. That amount is too large.")
    const [r] = await conn.query(
      "INSERT INTO sales (user_id, sold_at, subtotal, discount_pct, discount_amount, tax_rate, tax_amount, total, payment_method, amount_tendered, change_due, payment_reference) VALUES (?,NOW(),?,?,?,?,?,?,?,?,?,?)",
      [req.user.id, money(subtotal), discountPct, discountAmount, taxRate, taxAmount, total, method, tendered, method === "Cash" ? money(tendered - total) : null, reference || null],
    )
    const txnNo = `TXN-${new Date().getFullYear()}-${String(r.insertId).padStart(6, "0")}`
    await conn.query("UPDATE sales SET txn_no = ? WHERE id = ?", [txnNo, r.insertId])
    for (const [id, qty] of quantities) {
      const p = byId.get(id)
      const after = p.stock - qty
      await conn.query("INSERT INTO sale_items (sale_id, product_id, product_name, sku, unit_price, unit_cost, qty, line_total) VALUES (?,?,?,?,?,?,?,?)", [r.insertId, p.id, p.name, p.sku, p.price, p.cost, qty, money(Number(p.price) * qty)])
      await conn.query("UPDATE products SET stock = ? WHERE id = ?", [after, p.id])
      await conn.query("INSERT INTO stock_movements (product_id, type, change_qty, stock_after, note, user_id, sale_id, created_at) VALUES (?, 'Sale', ?, ?, ?, ?, ?, NOW())", [p.id, -qty, after, `Sale ${txnNo}`, req.user.id, r.insertId])
    }
    return r.insertId
  })
  const sale = await readSale(saleId)
  const soldIds = sale.items.map((i) => i.productId)
  const alerts = await readAlerts()
  res.status(201).json({ sale, newAlerts: alerts.enabled && settings.alert_after_sale === "1" ? alerts.items.filter((a) => soldIds.includes(a.id)) : [] })
})

app.get("/api/sales", auth, async (req, res) => {
  const { page, size } = readPaging(req.query)
  const where = []
  const params = []
  const add = (sql, ...values) => {
    where.push(sql)
    params.push(...values)
  }
  const q = req.query
  // Without the permission, people only see their own sales.
  if (!can(req, "transactions.all")) add("s.user_id = ?", req.user.id)
  else if (isId(q.cashier)) add("s.user_id = ?", q.cashier)
  if (single(q.search)) add("s.txn_no LIKE ?", `%${q.search}%`)
  if (isDateKey(q.from)) add("s.sold_at >= ?", `${q.from} 00:00:00`)
  if (isDateKey(q.to)) add("s.sold_at <= ?", `${q.to} 23:59:59`)
  if (single(q.method)) add("s.payment_method = ?", q.method)
  if (single(q.status)) add("s.status = ?", q.status)
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : ""
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM sales s ${clause}`, params)
  const rows = await query(
    `SELECT ${SALE_COLUMNS}, (SELECT SUM(qty) FROM sale_items si WHERE si.sale_id = s.id) AS units
     FROM sales s JOIN users u ON u.id = s.user_id ${clause} ORDER BY s.sold_at DESC, s.id DESC LIMIT ? OFFSET ?`,
    [...params, size, (page - 1) * size],
  )
  res.json({ rows, total, page, size })
})

app.get("/api/sales/cashiers", auth, need("transactions.all"), async (_req, res) => {
  res.json(await query("SELECT DISTINCT u.id, u.full_name AS name FROM users u JOIN sales s ON s.user_id = u.id ORDER BY name"))
})

app.get("/api/sales/:id", auth, async (req, res) => {
  const sale = await readSale(req.params.id)
  const [owner] = await query("SELECT user_id FROM sales WHERE id = ?", [req.params.id])
  if (!can(req, "transactions.all") && owner.user_id !== req.user.id) throw new ApiError(403, "You can only open your own transactions.")
  res.json(sale)
})

app.post("/api/sales/:id/refund", auth, need("transactions.refund"), async (req, res) => {
  const reason = text(req.body.reason, "Reason", 200)
  if (!reason) throw new ApiError(400, "Please add a reason for the refund.")
  await transaction(async (conn) => {
    const [[sale]] = await conn.query("SELECT * FROM sales WHERE id = ? FOR UPDATE", [req.params.id])
    if (!sale) throw new ApiError(404, "Transaction not found.")
    if (sale.status === "Refunded") throw new ApiError(409, "This transaction was already refunded.")
    await conn.query("UPDATE sales SET status='Refunded', refunded_at=NOW(), refunded_by=?, refund_reason=? WHERE id=?", [req.user.id, reason, sale.id])
    const [items] = await conn.query("SELECT product_id, qty FROM sale_items WHERE sale_id = ?", [sale.id])
    for (const it of items) {
      await conn.query("UPDATE products SET stock = stock + ? WHERE id = ?", [it.qty, it.product_id])
      const [[p]] = await conn.query("SELECT stock FROM products WHERE id = ?", [it.product_id])
      await conn.query("INSERT INTO stock_movements (product_id, type, change_qty, stock_after, note, user_id, sale_id, created_at) VALUES (?, 'Refund', ?, ?, ?, ?, ?, NOW())", [it.product_id, it.qty, p.stock, `Refund ${sale.txn_no}`, req.user.id, sale.id])
    }
  })
  res.json(await readSale(req.params.id))
})

// --- Forecast ---------------------------------------------------------------

async function forecastFor(horizon) {
  const daily = await query(
    `SELECT DATE_FORMAT(sold_at, '%Y-%m-%d') AS day, SUM(total) AS revenue, COUNT(*) AS orders
     FROM sales WHERE status = 'Completed' GROUP BY day ORDER BY day`,
  )
  const units = await query(
    `SELECT si.product_id AS id, DATE_FORMAT(s.sold_at, '%Y-%m-%d') AS day, SUM(si.qty) AS units
     FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE s.status = 'Completed' GROUP BY id, day`,
  )
  const productDaily = new Map()
  for (const r of units) {
    if (!productDaily.has(r.id)) productDaily.set(r.id, [])
    productDaily.get(r.id).push({ day: r.day, units: Number(r.units) })
  }
  const products = await query("SELECT id, name, sku, category, stock, min_stock FROM products WHERE active = 1")
  const today = toKey(new Date())
  const result = buildForecast({ daily: daily.map((d) => ({ day: d.day, revenue: Number(d.revenue), orders: Number(d.orders) })), productDaily, products, horizon, today })
  const [records] = await query("SELECT COUNT(*) AS salesCount, MAX(sold_at) AS lastSaleAt FROM sales WHERE status = 'Completed'")
  result.records = { ...result.records, ...records }
  return result
}

app.get("/api/forecast", auth, need("forecast.view"), async (req, res) => {
  const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30
  const forecast = await forecastFor(days)
  forecast.months = await query(
    `SELECT DATE_FORMAT(sold_at, '%Y-%m') AS month, COUNT(*) AS orders, SUM(total) AS revenue
     FROM sales WHERE status = 'Completed' AND sold_at >= DATE_SUB(CURDATE(), INTERVAL 13 MONTH)
     GROUP BY month ORDER BY month DESC`,
  )
  res.json(forecast)
})

// --- Dashboard --------------------------------------------------------------

// Each section is only worked out, and only sent, for accounts allowed to see it.
app.get("/api/dashboard", auth, async (req, res) => {
  const shopWide = can(req, "sales.monitor")
  const allSales = can(req, "transactions.all")
  const mine = shopWide ? "" : "AND s.user_id = ?"
  const mineParams = shopWide ? [] : [req.user.id]
  const dayTotals = async (offset) => {
    const [row] = await query(
      `SELECT COALESCE(SUM(s.total), 0) AS revenue, COUNT(*) AS orders FROM sales s
       WHERE s.status = 'Completed' AND DATE(s.sold_at) = DATE_SUB(CURDATE(), INTERVAL ? DAY) AND s.sold_at <= DATE_SUB(NOW(), INTERVAL ? DAY) ${mine}`,
      [offset, offset, ...mineParams],
    )
    return { revenue: Number(row.revenue), orders: Number(row.orders) }
  }
  const [today, yesterday] = [await dayTotals(0), await dayTotals(1)]
  const [units] = await query(`SELECT COALESCE(SUM(si.qty),0) AS units FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE s.status='Completed' AND DATE(s.sold_at)=CURDATE() ${mine}`, mineParams)
  const [counts] = can(req, "inventory.view") ? await query("SELECT COUNT(*) AS products, SUM(stock) AS stock FROM products WHERE active = 1") : [{ products: 0, stock: 0 }]

  const daily = shopWide
    ? await query(
        `SELECT DATE_FORMAT(sold_at, '%Y-%m-%d') AS label, SUM(total) AS value FROM sales
         WHERE status='Completed' AND sold_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY) GROUP BY label ORDER BY label`,
      )
    : []
  // Long-term revenue belongs with reports, not day-to-day sales monitoring.
  const monthly = can(req, "reports.view")
    ? await query(
        `SELECT DATE_FORMAT(sold_at, '%Y-%m') AS label, SUM(total) AS value FROM sales
         WHERE status='Completed' AND sold_at >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 11 MONTH) GROUP BY label ORDER BY label`,
      )
    : []
  const topProducts = shopWide
    ? await query(
        `SELECT p.id, p.name, p.category, SUM(si.qty) AS units, SUM(si.line_total) AS revenue
         FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN products p ON p.id = si.product_id
         WHERE s.status='Completed' AND s.sold_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) GROUP BY p.id, p.name, p.category ORDER BY units DESC LIMIT 5`,
      )
    : []
  const own = allSales ? "" : "AND s.user_id = ?"
  const recent = await query(
    `SELECT ${SALE_COLUMNS}, (SELECT SUM(qty) FROM sale_items si WHERE si.sale_id = s.id) AS units
     FROM sales s JOIN users u ON u.id = s.user_id WHERE 1=1 ${own} ORDER BY s.sold_at DESC, s.id DESC LIMIT 6`,
    allSales ? [] : [req.user.id],
  )
  const f = can(req, "forecast.view") ? await forecastFor(30) : null
  const week = f ? f.points.slice(0, 7).reduce((s, p) => s + p.predicted, 0) : 0
  res.json({
    shopWide,
    today: { ...today, units: Number(units.units) },
    yesterday,
    products: counts.products,
    stockUnits: Number(counts.stock ?? 0),
    salesDaily: daily.map((d) => ({ ...d, value: Number(d.value) })),
    salesMonthly: monthly.map((d) => ({ ...d, value: Number(d.value) })),
    topProducts,
    recent,
    forecast: f && {
      history: f.history.slice(-30),
      points: f.points,
      next7: week,
      next30: f.predictedRevenue,
      low: f.predictedLow,
      high: f.predictedHigh,
      changePct: f.changePct,
      peakDay: f.peakDay,
      accuracy: f.accuracy,
      confidence: f.confidence,
      records: f.records,
      toOrder: f.products.filter((p) => p.action !== "Enough stock").slice(0, 4),
      toOrderCount: f.products.filter((p) => p.action !== "Enough stock").length,
    },
  })
})

// --- Reports ----------------------------------------------------------------

app.get("/api/reports", auth, need("reports.view"), async (req, res) => {
  const today = toKey(new Date())
  let from = isDateKey(req.query.from) ? req.query.from : today.slice(0, 8) + "01"
  let to = isDateKey(req.query.to) ? req.query.to : today
  if (from > to) [from, to] = [to, from]
  const span = Math.round((new Date(to) - new Date(from)) / 86400000) + 1
  const shift = (key, days) => {
    const d = new Date(`${key}T00:00:00`)
    d.setDate(d.getDate() + days)
    return toKey(d)
  }
  const range = (a, b) => [`${a} 00:00:00`, `${b} 23:59:59`]
  const summary = async (a, b) => {
    const [row] = await query(
      `SELECT COUNT(*) AS orders, COALESCE(SUM(subtotal),0) AS gross, COALESCE(SUM(discount_amount),0) AS discounts,
         COALESCE(SUM(tax_amount),0) AS vat, COALESCE(SUM(total),0) AS collected
       FROM sales WHERE status='Completed' AND sold_at BETWEEN ? AND ?`,
      range(a, b),
    )
    const [items] = await query(
      `SELECT COALESCE(SUM(si.qty),0) AS units, COALESCE(SUM(si.qty * si.unit_cost),0) AS cogs
       FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE s.status='Completed' AND s.sold_at BETWEEN ? AND ?`,
      range(a, b),
    )
    const [ref] = await query("SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS amount FROM sales WHERE status='Refunded' AND sold_at BETWEEN ? AND ?", range(a, b))
    const net = Number(row.gross) - Number(row.discounts)
    return {
      orders: Number(row.orders),
      gross: Number(row.gross),
      discounts: Number(row.discounts),
      net,
      vat: Number(row.vat),
      collected: Number(row.collected),
      cogs: Number(items.cogs),
      profit: net - Number(items.cogs),
      units: Number(items.units),
      avgOrder: row.orders ? Number(row.collected) / row.orders : 0,
      refunds: Number(ref.n),
      refundAmount: Number(ref.amount),
    }
  }
  const bucket = span > 62 ? "%Y-%m" : "%Y-%m-%d"
  const trend = await query(
    `SELECT DATE_FORMAT(sold_at, ?) AS label, SUM(total) AS value, COUNT(*) AS orders FROM sales
     WHERE status='Completed' AND sold_at BETWEEN ? AND ? GROUP BY label ORDER BY label`,
    [bucket, ...range(from, to)],
  )
  const byMethod = await query(
    `SELECT payment_method AS name, COUNT(*) AS orders, SUM(total) AS value FROM sales
     WHERE status='Completed' AND sold_at BETWEEN ? AND ? GROUP BY name ORDER BY value DESC`,
    range(from, to),
  )
  const byCashier = await query(
    `SELECT u.full_name AS name, COUNT(*) AS orders, SUM(s.total) AS value FROM sales s JOIN users u ON u.id = s.user_id
     WHERE s.status='Completed' AND s.sold_at BETWEEN ? AND ? GROUP BY u.id, u.full_name ORDER BY value DESC`,
    range(from, to),
  )
  const products = await query(
    `SELECT p.id, p.name, SUBSTRING_INDEX(p.sku, '-DEL', 1) AS sku, p.category, SUM(si.qty) AS units, SUM(si.line_total) AS revenue,
       SUM(si.qty * si.unit_cost) AS cogs
     FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN products p ON p.id = si.product_id
     WHERE s.status='Completed' AND s.sold_at BETWEEN ? AND ? GROUP BY p.id, p.name, p.sku, p.category ORDER BY revenue DESC`,
    range(from, to),
  )
  const inventory = await query(
    `SELECT id, name, sku, category, stock, min_stock AS min, cost, price, stock * cost AS costValue, stock * price AS retailValue
     FROM products WHERE active = 1 ORDER BY stock * cost DESC`,
  )
  const movements = await query(
    `SELECT type, COUNT(*) AS entries, SUM(change_qty) AS units FROM stock_movements
     WHERE created_at BETWEEN ? AND ? GROUP BY type ORDER BY entries DESC`,
    range(from, to),
  )
  const num = (rows, ...keys) => rows.map((r) => ({ ...r, ...Object.fromEntries(keys.map((k) => [k, Number(r[k])])) }))
  res.json({
    from,
    to,
    previousFrom: shift(from, -span),
    previousTo: shift(from, -1),
    summary: await summary(from, to),
    previous: await summary(shift(from, -span), shift(from, -1)),
    bucket: span > 62 ? "month" : "day",
    trend: num(trend, "value", "orders"),
    byMethod: num(byMethod, "value", "orders"),
    byCashier: num(byCashier, "value", "orders"),
    products: num(products, "units", "revenue", "cogs"),
    inventory: num(inventory, "costValue", "retailValue"),
    movements: num(movements, "entries", "units"),
  })
})

// --- Staff operations ---------------------------------------------------------

app.get("/api/staff/activity", auth, need("staff.operations"), async (req, res) => {
  const date = isDateKey(req.query.date) ? req.query.date : toKey(new Date())
  const rows = await query(
    `SELECT u.id, u.full_name AS name, u.username, u.role, u.last_login_at AS lastLoginAt,
       EXISTS(SELECT 1 FROM sessions x WHERE x.user_id = u.id AND x.expires_at > NOW() AND x.last_seen_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)) AS online,
       EXISTS(SELECT 1 FROM sessions x WHERE x.user_id = u.id AND x.expires_at > NOW()) AS signedIn,
       COALESCE(SUM(s.status = 'Completed'), 0) AS orders,
       COALESCE(SUM(IF(s.status = 'Completed', s.total, 0)), 0) AS revenue,
       COALESCE(SUM(s.status = 'Refunded'), 0) AS refunds,
       COALESCE(SUM(IF(s.status = 'Refunded', s.total, 0)), 0) AS refundAmount,
       MAX(s.sold_at) AS lastSaleAt
     FROM users u LEFT JOIN sales s ON s.user_id = u.id AND s.sold_at BETWEEN ? AND ?
     WHERE (u.role = 'Staff' AND u.status = 'Active') OR s.id IS NOT NULL
     GROUP BY u.id, u.full_name, u.username, u.role, u.last_login_at
     ORDER BY revenue DESC, u.full_name`,
    [`${date} 00:00:00`, `${date} 23:59:59`],
  )
  res.json({ date, rows: rows.map((r) => ({ ...r, orders: Number(r.orders), revenue: Number(r.revenue), refunds: Number(r.refunds), refundAmount: Number(r.refundAmount) })) })
})

// Ends a cashier's shift by signing them out everywhere. Only ever reaches Staff accounts.
app.post("/api/staff/:id/end-shift", auth, need("staff.operations"), async (req, res) => {
  const [target] = await query("SELECT id, role FROM users WHERE id = ?", [req.params.id])
  if (!target) throw new ApiError(404, "Account not found.")
  if (target.role !== "Staff") throw new ApiError(403, "You can only end the shift of a Staff account.")
  await endSessions(target.id)
  res.json({ ok: true })
})

// --- Permissions & security (administrator) ------------------------------------

async function readPermissionMatrix() {
  const rows = await query("SELECT role, permission FROM role_permissions WHERE allowed = 1")
  return Object.fromEntries(EDITABLE_ROLES.map((role) => [role, rows.filter((r) => r.role === role && PERMISSION_KEYS.includes(r.permission)).map((r) => r.permission)]))
}

app.get("/api/permissions", auth, adminOnly, async (_req, res) => {
  res.json({ roles: EDITABLE_ROLES, catalog: PERMISSIONS, matrix: await readPermissionMatrix() })
})

app.put("/api/permissions", auth, adminOnly, async (req, res) => {
  const matrix = req.body.matrix
  for (const role of EDITABLE_ROLES) {
    if (!Array.isArray(matrix?.[role]) || matrix[role].some((key) => !PERMISSION_KEYS.includes(key))) throw new ApiError(400, "Those permissions aren't valid.")
  }
  const rows = EDITABLE_ROLES.flatMap((role) => PERMISSION_KEYS.map((key) => [role, key, matrix[role].includes(key) ? 1 : 0]))
  await query("INSERT INTO role_permissions (role, permission, allowed) VALUES ? ON DUPLICATE KEY UPDATE allowed = VALUES(allowed)", [rows])
  await loadPermissions()
  res.json({ matrix: await readPermissionMatrix() })
})

app.get("/api/security", auth, adminOnly, async (_req, res) => res.json(await readSecurity()))

app.put("/api/security", auth, adminOnly, async (req, res) => {
  const fields = { security_max_failed_logins: "maxFailedLogins", security_lock_minutes: "lockMinutes", security_session_hours: "sessionHours", security_password_min: "passwordMin" }
  const values = Object.entries(fields).map(([key, field]) => {
    const rule = SECURITY_RULES[key]
    const n = Number(req.body[field])
    if (!Number.isInteger(n) || n < rule.min || n > rule.max) throw new ApiError(400, `${rule.label} must be a whole number from ${rule.min} to ${rule.max}.`)
    return [key, String(n)]
  })
  await query("INSERT INTO settings (setting_key, setting_value) VALUES ? ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)", [values])
  res.json(await readSecurity())
})

// Signs out everyone but the administrator pressing the button.
app.post("/api/security/end-sessions", auth, adminOnly, async (req, res) => {
  await query("UPDATE login_logs l JOIN sessions s ON s.login_log_id = l.id SET l.logout_at = NOW() WHERE s.token_hash <> ?", [req.tokenHash])
  const result = await query("DELETE FROM sessions WHERE token_hash <> ?", [req.tokenHash])
  res.json({ ended: result.affectedRows })
})

// --- Accounts & login history (administrator) --------------------------------

app.get("/api/users", auth, adminOnly, async (_req, res) => {
  res.json(
    await query(
      `SELECT u.id, u.full_name AS name, u.username, u.role, u.status, u.created_at AS createdAt, u.last_login_at AS lastLoginAt,
         EXISTS(SELECT 1 FROM sessions s WHERE s.user_id = u.id AND s.expires_at > NOW() AND s.last_seen_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)) AS online,
         (SELECT COUNT(*) FROM login_logs l WHERE l.user_id = u.id AND l.success = 1) AS loginCount
       FROM users u ORDER BY u.status, FIELD(u.role, 'Administrator', 'Owner', 'Manager', 'Staff'), u.full_name`,
    ),
  )
})

function readUserBody(body) {
  const name = text(body.name, "Full name", 120)
  const username = text(body.username, "Username", 60)
  const role = body.role
  if (!name || !username) throw new ApiError(400, "Full name and username are required.")
  if (!ROLES.includes(role)) throw new ApiError(400, "Choose a role.")
  return { name, username, role }
}
const duplicateUsername = (err) => {
  if (err.code === "ER_DUP_ENTRY") throw new ApiError(409, "That username is already taken.")
  throw err
}
/** Signs a user out everywhere, except optionally the session passed in. */
async function endSessions(userId, keepTokenHash = "") {
  await query("UPDATE login_logs l JOIN sessions s ON s.login_log_id = l.id SET l.logout_at = NOW() WHERE s.user_id = ? AND s.token_hash <> ?", [userId, keepTokenHash])
  await query("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?", [userId, keepTokenHash])
}

app.post("/api/users", auth, adminOnly, async (req, res) => {
  const { name, username, role } = readUserBody(req.body)
  const hash = await bcrypt.hash(await newPassword(req.body.password), 10)
  const r = await query("INSERT INTO users (full_name, username, password_hash, role) VALUES (?,?,?,?)", [name, username, hash, role]).catch(duplicateUsername)
  res.status(201).json({ id: r.insertId })
})

app.put("/api/users/:id", auth, adminOnly, async (req, res) => {
  const { name, username, role } = readUserBody(req.body)
  if (Number(req.params.id) === req.user.id && role !== req.user.role) throw new ApiError(400, "You can't change your own role.")
  const result = await query("UPDATE users SET full_name=?, username=?, role=? WHERE id=?", [name, username, role, req.params.id]).catch(duplicateUsername)
  mustExist(result, "Account not found.")
  res.json({ ok: true })
})

app.post("/api/users/:id/password", auth, adminOnly, async (req, res) => {
  const hash = await bcrypt.hash(await newPassword(req.body.password), 10)
  const result = await query("UPDATE users SET password_hash = ? WHERE id = ?", [hash, req.params.id])
  mustExist(result, "Account not found.")
  await endSessions(req.params.id, Number(req.params.id) === req.user.id ? req.tokenHash : "")
  res.json({ ok: true })
})

app.post("/api/users/:id/status", auth, adminOnly, async (req, res) => {
  const status = req.body.status === "Active" ? "Active" : "Inactive"
  if (Number(req.params.id) === req.user.id) throw new ApiError(400, "You can't deactivate your own account.")
  const result = await query("UPDATE users SET status = ? WHERE id = ?", [status, req.params.id])
  mustExist(result, "Account not found.")
  if (status === "Inactive") await endSessions(req.params.id)
  res.json({ ok: true })
})

app.get("/api/login-logs", auth, adminOnly, async (req, res) => {
  const { page, size } = readPaging(req.query)
  const where = []
  const params = []
  if (isId(req.query.user)) {
    where.push("l.user_id = ?")
    params.push(req.query.user)
  }
  if (single(req.query.result)) {
    where.push("l.success = ?")
    params.push(req.query.result === "success" ? 1 : 0)
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : ""
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM login_logs l ${clause}`, params)
  const rows = await query(
    `SELECT l.id, l.username, l.success, l.reason, l.ip, l.user_agent AS device, l.login_at AS loginAt, l.logout_at AS logoutAt,
       u.full_name AS name, u.role, EXISTS(SELECT 1 FROM sessions s WHERE s.login_log_id = l.id AND s.expires_at > NOW()) AS active
     FROM login_logs l LEFT JOIN users u ON u.id = l.user_id ${clause} ORDER BY l.login_at DESC, l.id DESC LIMIT ? OFFSET ?`,
    [...params, size, (page - 1) * size],
  )
  res.json({ rows, total, page, size })
})

// --- Global search -----------------------------------------------------------

app.get("/api/search", auth, async (req, res) => {
  const q = single(req.query.q).trim().slice(0, 100)
  if (!q) return res.json({ products: [], sales: [] })
  const like = `%${q}%`
  const products = can(req, "inventory.view") ? await query("SELECT id, name, sku, category, stock FROM products WHERE active = 1 AND (name LIKE ? OR sku LIKE ? OR category LIKE ?) ORDER BY name LIMIT 6", [like, like, like]) : []
  const allSales = can(req, "transactions.all")
  const own = allSales ? "" : "AND s.user_id = ?"
  const sales = await query(
    `SELECT s.id, s.txn_no AS txnNo, s.total, s.sold_at AS soldAt, s.status FROM sales s WHERE s.txn_no LIKE ? ${own} ORDER BY s.sold_at DESC LIMIT 6`,
    allSales ? [like] : [like, req.user.id],
  )
  res.json({ products, sales })
})

// --- Errors & production files ------------------------------------------------

app.use("/api", (_req, _res, next) => next(new ApiError(404, "Not found.")))

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist")
if (fs.existsSync(dist)) {
  app.use(express.static(dist))
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")))
}

const DB_DOWN = ["ECONNREFUSED", "ECONNRESET", "PROTOCOL_CONNECTION_LOST", "ER_ACCESS_DENIED_ERROR", "ER_BAD_DB_ERROR", "ER_NO_SUCH_TABLE", "ETIMEDOUT", "ENOTFOUND"]
const DB_BUSY = ["ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"]
app.use((err, _req, res, _next) => {
  if (err instanceof ApiError) return res.status(err.status).json({ error: err.message })
  // Rejected by the JSON body parser: malformed or too large.
  if (typeof err.type === "string" && err.type.startsWith("entity.")) {
    return res.status(err.status ?? 400).json({ error: "The server couldn't read that request." })
  }
  if (DB_DOWN.includes(err.code)) {
    return res.status(503).json({ error: "The database isn't ready. Start MySQL, then run: npm run db:setup", code: "DB_DOWN" })
  }
  if (DB_BUSY.includes(err.code)) return res.status(503).json({ error: "The system is busy. Please try again." })
  console.error(err)
  res.status(500).json({ error: "Something went wrong on the server." })
})

const port = Number(process.env.API_PORT || 4000)
app.listen(port, "127.0.0.1", (err) => {
  if (err) {
    console.error(err.code === "EADDRINUSE" ? `Port ${port} is already in use. Another copy of the API is probably still running; close it and try again.` : err)
    process.exit(1)
  }
  console.log(`PyroFlow API running on http://127.0.0.1:${port}`)
})
