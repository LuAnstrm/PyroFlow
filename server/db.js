import mysql from "mysql2/promise"

try {
  process.loadEnvFile()
} catch {
  // No .env file: the defaults below match a stock XAMPP / local MySQL install.
}

export const dbName = process.env.DB_NAME || "pyroflow_pos"

export const connectionConfig = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  decimalNumbers: true,
  timezone: "local",
}

export const pool = mysql.createPool({
  ...connectionConfig,
  database: dbName,
  connectionLimit: 10,
})

export async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params)
  return rows
}

/** Runs `work` inside a transaction, rolling back if it throws. */
export async function transaction(work) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const result = await work(conn)
    await conn.commit()
    return result
  } catch (err) {
    // If the connection itself died, keep the original error rather than the rollback's.
    await conn.rollback().catch(() => {})
    throw err
  } finally {
    conn.release()
  }
}
