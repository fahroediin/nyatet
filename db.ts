// db.ts
import { Database } from "bun:sqlite";

const db = new Database("ba_assistant.sqlite");

// Inisialisasi Tabel
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT,
    spreadsheet_id TEXT -- Setiap user bisa punya sheet berbeda
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS service_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    service_account_json TEXT NOT NULL,
    is_active BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS user_service_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    service_account_id INTEGER,
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (service_account_id) REFERENCES service_accounts (id)
  )
`);

// Set default service account if exists in environment variable
const envServiceAccount = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
if (envServiceAccount) {
  try {
    const parsed = JSON.parse(envServiceAccount);
    const existing = db.query("SELECT id FROM service_accounts WHERE name = 'environment'").get();
    if (!existing) {
      db.run(`
        INSERT INTO service_accounts (name, service_account_json, is_active)
        VALUES (?, ?, 1)
      `, ['environment', JSON.stringify(parsed)]);
    }
  } catch (e) {
    console.warn('Invalid GOOGLE_SERVICE_ACCOUNT_JSON in environment');
  }
}

export default db;