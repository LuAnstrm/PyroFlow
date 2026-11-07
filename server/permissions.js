// Who can do what. The shop owner creates roles (Cashier, Inventory Clerk, ...) on the
// Team page and ticks the permissions each one gets. The Owner role is built in: it
// always has every permission, and only it can manage the team, roles, invite codes,
// business settings and security.

/** The roles a brand-new shop starts with. The owner can rename, change or delete them. */
export const DEFAULT_ROLES = [
  { name: "Manager", description: "Runs the floor: sales, refunds, stock and the cashiers' shifts." },
  { name: "Cashier", description: "Rings up sales at the counter. Can't change inventory." },
  { name: "Inventory Clerk", description: "Receives deliveries and keeps stock counts right. Can't sell." },
]

export const PERMISSIONS = [
  { key: "sales.process", group: "Selling", label: "Process sales", help: "Use the Point of Sale: cart, payments and receipts.", defaults: ["Manager", "Cashier"] },
  { key: "transactions.all", group: "Selling", label: "View all transactions", help: "Without this, a person only sees the sales they rang up.", defaults: ["Manager"] },
  { key: "transactions.refund", group: "Selling", label: "Refund transactions", help: "Reverse a sale and return its items to stock.", defaults: ["Manager"] },
  { key: "sales.monitor", group: "Selling", label: "Monitor daily sales", help: "See shop-wide sales and top sellers on the dashboard.", defaults: ["Manager"] },
  { key: "inventory.view", group: "Inventory & products", label: "View inventory", help: "Open Inventory, stock movements and low-stock alerts.", defaults: ["Manager", "Inventory Clerk"] },
  { key: "inventory.manage", group: "Inventory & products", label: "Update stock", help: "Stock in, record damaged items and correct counts.", defaults: ["Manager", "Inventory Clerk"] },
  { key: "products.edit", group: "Inventory & products", label: "Add and update products", help: "Create products and change their name, SKU, category and minimum stock.", defaults: ["Manager", "Inventory Clerk"] },
  { key: "products.pricing", group: "Inventory & products", label: "Manage pricing", help: "See cost prices and change the price or cost of existing products.", defaults: [] },
  { key: "products.remove", group: "Inventory & products", label: "Remove products", help: "Take a product off the catalog. Old receipts keep working.", defaults: [] },
  { key: "reports.view", group: "Business insight", label: "View reports, revenue and profit", help: "Open Reports & Analytics, including cost and profit figures.", defaults: [] },
  { key: "forecast.view", group: "Business insight", label: "View sales forecasting", help: "Open Sales Forecasting and the dashboard forecast.", defaults: [] },
  { key: "staff.operations", group: "Team", label: "Manage staff operations", help: "See each cashier's sales and activity, and end a cashier's shift.", defaults: ["Manager"] },
]
export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key)

/** Names shown at the POS. "Other" lets the cashier type one that isn't listed. */
export const ONLINE_PROVIDERS = ["GCash", "Maya", "GoTyme", "ShopeePay", "GrabPay", "QR Ph", "BDO", "BPI", "UnionBank", "Metrobank", "Landbank", "Security Bank"]
export const CARD_NETWORKS = ["Visa", "Mastercard", "JCB", "American Express", "UnionPay", "BancNet"]

export const SECURITY_RULES = {
  security_max_failed_logins: { fallback: 5, min: 3, max: 20, label: "Failed sign-ins before a lock" },
  security_lock_minutes: { fallback: 2, min: 1, max: 60, label: "Lock duration" },
  security_session_hours: { fallback: 12, min: 1, max: 72, label: "Session length" },
  security_password_min: { fallback: 8, min: 8, max: 72, label: "Minimum password length" },
}

const columnExists = async (exec, table, column) =>
  (await exec("SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?", [table, column])).length > 0
const tableExists = async (exec, table) => (await exec("SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?", [table])).length > 0

/**
 * Brings any existing database up to date, keeping its data. Safe to run repeatedly.
 * `exec` runs one SQL statement and resolves to its rows.
 */
export async function migrate(exec) {
  if (!(await tableExists(exec, "users"))) throw Object.assign(new Error("The users table doesn't exist yet."), { code: "ER_NO_SUCH_TABLE" })

  await exec(`CREATE TABLE IF NOT EXISTS roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(40) NOT NULL UNIQUE,
    description VARCHAR(200) NULL,
    is_owner TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS role_grants (
    role_id INT NOT NULL,
    permission VARCHAR(40) NOT NULL,
    PRIMARY KEY (role_id, permission),
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
  )`)

  // A new shop gets the Owner role and the starting roles, each with its default permissions.
  const [{ n }] = await exec("SELECT COUNT(*) AS n FROM roles")
  if (!n) {
    await exec("INSERT INTO roles (name, description, is_owner) VALUES ('Owner', 'Full access. Manages the team, roles, invite codes, settings and security.', 1)")
    for (const role of DEFAULT_ROLES) {
      const { insertId } = await exec("INSERT INTO roles (name, description) VALUES (?, ?)", [role.name, role.description])
      const keys = PERMISSIONS.filter((p) => p.defaults.includes(role.name)).map((p) => [insertId, p.key])
      if (keys.length) await exec("INSERT INTO role_grants (role_id, permission) VALUES ?", [keys])
    }
  }
  const roleId = async (name) => (await exec("SELECT id FROM roles WHERE name = ?", [name]))[0]?.id

  // Older databases had four fixed roles in users.role. Administrator and Owner become the
  // one Owner role, Staff becomes Cashier, and the permissions saved for them carry over.
  if (!(await columnExists(exec, "users", "role_id"))) {
    await exec("ALTER TABLE users ADD COLUMN role_id INT NULL AFTER password_hash, ADD CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id)")
  }
  if (await columnExists(exec, "users", "role")) {
    const mapping = { Administrator: "Owner", Owner: "Owner", Manager: "Manager", Staff: "Cashier" }
    for (const [oldRole, newRole] of Object.entries(mapping)) {
      const id = await roleId(newRole)
      if (id) await exec("UPDATE users SET role_id = ? WHERE role = ? AND role_id IS NULL", [id, oldRole])
    }
    if (await tableExists(exec, "role_permissions")) {
      for (const [oldRole, newRole] of [["Manager", "Manager"], ["Staff", "Cashier"]]) {
        const id = await roleId(newRole)
        const saved = await exec("SELECT permission FROM role_permissions WHERE role = ? AND allowed = 1", [oldRole])
        if (!id || !saved.length) continue
        await exec("DELETE FROM role_grants WHERE role_id = ?", [id])
        const keys = saved.map((r) => r.permission).filter((k) => PERMISSION_KEYS.includes(k))
        if (keys.length) await exec("INSERT INTO role_grants (role_id, permission) VALUES ?", [keys.map((k) => [id, k])])
      }
      await exec("DROP TABLE role_permissions")
    }
    await exec("ALTER TABLE users DROP COLUMN role")
  }

  await exec(`CREATE TABLE IF NOT EXISTS invites (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(12) NOT NULL UNIQUE,
    role_id INT NOT NULL,
    created_by INT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NULL,
    max_uses INT NULL,
    uses INT NOT NULL DEFAULT 0,
    active TINYINT(1) NOT NULL DEFAULT 1,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id)
  )`)
  if (!(await columnExists(exec, "users", "joined_at"))) {
    await exec("ALTER TABLE users ADD COLUMN joined_at DATETIME NULL AFTER created_at")
    await exec("UPDATE users SET joined_at = created_at WHERE role_id IS NOT NULL")
  }

  // Detailed payments: which e-wallet, bank or card network, who paid, and a photo of the proof.
  if (!(await columnExists(exec, "sales", "payment_provider"))) {
    await exec("ALTER TABLE sales ADD COLUMN payment_provider VARCHAR(40) NULL AFTER payment_method, ADD COLUMN payment_account VARCHAR(80) NULL AFTER payment_reference")
  }
  await exec(`CREATE TABLE IF NOT EXISTS payment_proofs (
    sale_id INT PRIMARY KEY,
    mime VARCHAR(40) NOT NULL,
    data MEDIUMBLOB NOT NULL,
    uploaded_at DATETIME NOT NULL,
    FOREIGN KEY (sale_id) REFERENCES sales(id)
  )`)

  await exec("INSERT IGNORE INTO settings (setting_key, setting_value) VALUES ?", [[...Object.entries(SECURITY_RULES).map(([key, rule]) => [key, String(rule.fallback)]), ["require_payment_proof", "1"]]])
}
