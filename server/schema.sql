-- PyroFlow POS database schema (MySQL 8 / MariaDB 10.4+)
-- Run with `npm run db:setup`, or open this file in the VS Code MySQL extension.

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  username VARCHAR(60) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  role ENUM('Administrator','Owner','Manager','Staff') NOT NULL,
  status ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME NULL
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
  amount_tendered DECIMAL(12,2) NULL,
  change_due DECIMAL(12,2) NULL,
  payment_reference VARCHAR(60) NULL,
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

CREATE TABLE IF NOT EXISTS role_permissions (
  role VARCHAR(20) NOT NULL,
  permission VARCHAR(40) NOT NULL,
  allowed TINYINT(1) NOT NULL,
  PRIMARY KEY (role, permission)
);

CREATE TABLE IF NOT EXISTS settings (
  setting_key VARCHAR(60) PRIMARY KEY,
  setting_value TEXT NOT NULL
);
