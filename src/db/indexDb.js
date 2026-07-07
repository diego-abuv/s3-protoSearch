import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';

const DB_PATH = '/db/index.db';

let db;
let ready = false;

export async function initIndexDb() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`CREATE TABLE IF NOT EXISTS file_index (
    protocol_number TEXT NOT NULL,
    file_path TEXT NOT NULL UNIQUE,
    file_name TEXT NOT NULL,
    search_root TEXT NOT NULL,
    indexed_at TEXT DEFAULT (datetime('now'))
  )`);
  db.run('CREATE INDEX IF NOT EXISTS idx_protocol_number ON file_index(protocol_number)');

  ready = true;
  return db;
}

export function getIndexDb() {
  if (!db) throw new Error('Index database not initialized');
  return db;
}

export function queryIndex(sql, params = []) {
  if (!ready) return [];
  const stmt = getIndexDb().prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

export function runIndex(sql, params = []) {
  getIndexDb().run(sql, params);
}

export function saveIndex() {
  if (!db) return;
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}
