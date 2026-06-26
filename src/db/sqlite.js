import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';

const DB_PATH = '/db/app.db';

let db;

export async function initDatabase() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT,
    details TEXT,
    ip TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  const [cols] = db.exec('PRAGMA table_info(refresh_tokens)');
  if (!cols?.values?.some((r) => r[1] === 'created_at')) {
    db.run('ALTER TABLE refresh_tokens ADD COLUMN created_at TEXT');
  }
  db.run("DELETE FROM refresh_tokens WHERE expires_at < datetime('now')");
  db.run("DELETE FROM audit_log WHERE created_at < datetime('now', '-90 days')");

  save();
  return db;
}

export function getDb() {
  if (!db) throw new Error('Database not initialized');
  return db;
}

export function save() {
  if (!db) return;
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

export function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return undefined;
}

export function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

export function logAudit({ user_id, username, action, target, details, ip }) {
  run(
    `INSERT INTO audit_log (user_id, username, action, target, details, ip) 
    VALUES (?, ?, ?, ?, ?, ?)`,
    [user_id, username, action, target ?? null, details ?? null, ip ?? null],
  );

  run("DELETE FROM refresh_tokens WHERE expires_at < datetime('now')");
  run("DELETE FROM audit_log WHERE created_at < datetime('now', '-90 days')");

  save();
}

export function run(sql, params = []) {
  db.run(sql, params);
}
