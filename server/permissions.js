// Who can do what. The defaults below are only the starting point: an administrator
// can change them on the Permissions & Security page, and the saved choices live in
// the role_permissions table. Administrators always have every permission.

export const ROLES = ["Administrator", "Owner", "Manager", "Staff"]
export const EDITABLE_ROLES = ["Owner", "Manager", "Staff"]

export const PERMISSIONS = [
  { key: "sales.process", group: "Selling", label: "Process sales", help: "Use the Point of Sale: cart, payments and receipts.", defaults: ["Owner", "Manager", "Staff"] },
  { key: "transactions.all", group: "Selling", label: "View all transactions", help: "Without this, a person only sees the sales they rang up.", defaults: ["Owner", "Manager"] },
  { key: "transactions.refund", group: "Selling", label: "Refund transactions", help: "Reverse a sale and return its items to stock.", defaults: ["Manager"] },
  { key: "sales.monitor", group: "Selling", label: "Monitor daily sales", help: "See shop-wide sales and top sellers on the dashboard.", defaults: ["Owner", "Manager"] },
  { key: "inventory.view", group: "Inventory & products", label: "View inventory", help: "Open Inventory, stock movements and low-stock alerts.", defaults: ["Owner", "Manager"] },
  { key: "inventory.manage", group: "Inventory & products", label: "Update stock", help: "Stock in, record damaged items and correct counts.", defaults: ["Manager"] },
  { key: "products.edit", group: "Inventory & products", label: "Add and update products", help: "Create products and change their name, SKU, category and minimum stock.", defaults: ["Owner", "Manager"] },
  { key: "products.pricing", group: "Inventory & products", label: "Manage pricing", help: "See cost prices and change the price or cost of existing products.", defaults: ["Owner"] },
  { key: "products.remove", group: "Inventory & products", label: "Remove products", help: "Take a product off the catalog. Old receipts keep working.", defaults: ["Owner"] },
  { key: "reports.view", group: "Business insight", label: "View reports, revenue and profit", help: "Open Reports & Analytics, including cost and profit figures.", defaults: ["Owner"] },
  { key: "forecast.view", group: "Business insight", label: "View sales forecasting", help: "Open Sales Forecasting and the dashboard forecast.", defaults: ["Owner"] },
  { key: "staff.operations", group: "Team", label: "Manage staff operations", help: "See each cashier's sales and activity, and end a cashier's shift.", defaults: ["Manager"] },
]
export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key)

export const SECURITY_RULES = {
  security_max_failed_logins: { fallback: 5, min: 3, max: 20, label: "Failed sign-ins before a lock" },
  security_lock_minutes: { fallback: 2, min: 1, max: 60, label: "Lock duration" },
  security_session_hours: { fallback: 12, min: 1, max: 72, label: "Session length" },
  security_password_min: { fallback: 8, min: 8, max: 72, label: "Minimum password length" },
}

/**
 * Brings any existing database up to date, keeping its data. Safe to run repeatedly.
 * `exec` runs one SQL statement and resolves to its rows.
 */
export async function migrate(exec) {
  const [column] = await exec("SELECT COLUMN_TYPE AS type FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'")
  if (!column) throw Object.assign(new Error("The users table doesn't exist yet."), { code: "ER_NO_SUCH_TABLE" })
  if (!String(column.type).includes("'Manager'")) {
    await exec("ALTER TABLE users MODIFY role ENUM('Administrator','Owner','Manager','Staff') NOT NULL")
  }
  await exec(`CREATE TABLE IF NOT EXISTS role_permissions (
    role VARCHAR(20) NOT NULL,
    permission VARCHAR(40) NOT NULL,
    allowed TINYINT(1) NOT NULL,
    PRIMARY KEY (role, permission)
  )`)
  const rows = EDITABLE_ROLES.flatMap((role) => PERMISSIONS.map((p) => [role, p.key, p.defaults.includes(role) ? 1 : 0]))
  await exec("INSERT IGNORE INTO role_permissions (role, permission, allowed) VALUES ?", [rows])
  await exec("INSERT IGNORE INTO settings (setting_key, setting_value) VALUES ?", [Object.entries(SECURITY_RULES).map(([key, rule]) => [key, String(rule.fallback)])])
}
