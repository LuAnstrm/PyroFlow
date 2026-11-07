-- PyroFlow POS database schema (MySQL 8 / MariaDB 10.4+)
-- Run with `npm run db:setup`, or open this file in the VS Code MySQL extension.

-- Roles are made by the shop owner. The Owner role (is_owner = 1) always has every permission.
CREATE TABLE IF NOT EXISTS roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(40) NOT NULL UNIQUE,
  description VARCHAR(200) NULL,
  is_owner TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS role_grants (
  role_id INT NOT NULL,
  permission VARCHAR(40) NOT NULL,
  PRIMARY KEY (role_id, permission),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

-- Anyone can register. role_id stays NULL until they join the shop with an invite code.
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  username VARCHAR(60) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  role_id INT NULL,
  status ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  joined_at DATETIME NULL,
  last_login_at DATETIME NULL,
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id)
);

CREATE TABLE IF NOT EXISTS invites (
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
);

CREATE TABLE IF NOT EXISTS login_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  username VARCHAR(60) NOT NULL,
  success TINYINT(1) NOT NULL,
  reason VARCHAR(120) NULL,
  ip VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  login_at DATETIME NOT NULL,
  logout_at DATETIME NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_login_at (login_at)
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id INT NOT NULL,
  login_log_id INT NOT NULL,
  expires_at DATETIME NOT NULL,
  last_seen_at DATETIME NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (login_log_id) REFERENCES login_logs(id)
);

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  sku VARCHAR(40) NOT NULL UNIQUE,
  category VARCHAR(60) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  cost DECIMAL(10,2) NOT NULL,
  stock INT NOT NULL DEFAULT 0,
  min_stock INT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sales (
  id INT AUTO_INCREMENT PRIMARY KEY,
  txn_no VARCHAR(24) NULL UNIQUE,
  user_id INT NOT NULL,
  sold_at DATETIME NOT NULL,
  subtotal DECIMAL(12,2) NOT NULL,
  discount_pct DECIMAL(5,2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax_rate DECIMAL(5,2) NOT NULL,
  tax_amount DECIMAL(12,2) NOT NULL,
  total DECIMAL(12,2) NOT NULL,
  payment_method ENUM('Cash','Online Payment','Card') NOT NULL,
  payment_provider VARCHAR(40) NULL,
  amount_tendered DECIMAL(12,2) NULL,
  change_due DECIMAL(12,2) NULL,
  payment_reference VARCHAR(60) NULL,
  payment_account VARCHAR(80) NULL,
  status ENUM('Completed','Refunded') NOT NULL DEFAULT 'Completed',
  refunded_at DATETIME NULL,
  refunded_by INT NULL,
  refund_reason VARCHAR(200) NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (refunded_by) REFERENCES users(id),
  INDEX idx_sold_at (sold_at)
);

CREATE TABLE IF NOT EXISTS sale_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sale_id INT NOT NULL,
  product_id INT NOT NULL,
  product_name VARCHAR(120) NOT NULL,
  sku VARCHAR(40) NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  unit_cost DECIMAL(10,2) NOT NULL,
  qty INT NOT NULL,
  line_total DECIMAL(12,2) NOT NULL,
  FOREIGN KEY (sale_id) REFERENCES sales(id),
  FOREIGN KEY (product_id) REFERENCES products(id),
  INDEX idx_product (product_id)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  type ENUM('Initial','Sale','Restock','Adjustment','Damaged','Refund') NOT NULL,
  change_qty INT NOT NULL,
  stock_after INT NOT NULL,
  note VARCHAR(200) NULL,
  user_id INT NOT NULL,
  sale_id INT NULL,
  created_at DATETIME NOT NULL,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (sale_id) REFERENCES sales(id),
  INDEX idx_created (created_at)
);

-- A photo or screenshot of an online or card payment, taken at the counter.
CREATE TABLE IF NOT EXISTS payment_proofs (
  sale_id INT PRIMARY KEY,
  mime VARCHAR(40) NOT NULL,
  data MEDIUMBLOB NOT NULL,
  uploaded_at DATETIME NOT NULL,
  FOREIGN KEY (sale_id) REFERENCES sales(id)
);

CREATE TABLE IF NOT EXISTS settings (
  setting_key VARCHAR(60) PRIMARY KEY,
  setting_value TEXT NOT NULL
);
