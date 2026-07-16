import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';

const DB_PATH = '/db/index.db';

let db;
let ready = false;

function createSchema(database) {
  database.run(`CREATE TABLE IF NOT EXISTS file_index (
    protocol_number TEXT NOT NULL,
    file_path TEXT NOT NULL UNIQUE,
    file_name TEXT NOT NULL,
    search_root TEXT NOT NULL,
    indexed_at TEXT DEFAULT (datetime('now'))
  )`);
  database.run('CREATE INDEX IF NOT EXISTS idx_protocol_number ON file_index(protocol_number)');
  database.run(`CREATE TABLE IF NOT EXISTS scanned_dirs (
    search_root TEXT NOT NULL,
    dir_path TEXT NOT NULL,
    indexed_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (search_root, dir_path)
  )`);
}

export async function initIndexDb() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    try {
      const buffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(buffer);
      db.export();
      createSchema(db);
    } catch {
      console.error('[DB] index.db corrompido, recriando...');
      try {
        fs.unlinkSync(DB_PATH);
      } catch {
        // arquivo já removido
      }
      db = new SQL.Database();
      createSchema(db);
    }
  } else {
    db = new SQL.Database();
    createSchema(db);
  }

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

export function isDirScanned(searchRoot, dirPath, maxAgeHours = 24) {
  if (!ready) return false;
  const stmt = getIndexDb().prepare(
    `SELECT 1 FROM scanned_dirs 
     WHERE search_root = ? AND dir_path = ? 
     AND indexed_at > datetime('now', ?)`,
  );
  stmt.bind([searchRoot, dirPath, `-${maxAgeHours} hours`]);
  const result = stmt.step();
  stmt.free();
  return result;
}

export function markDirScanned(searchRoot, dirPath) {
  runIndex(
    `INSERT OR REPLACE INTO scanned_dirs (search_root, dir_path, indexed_at) 
     VALUES (?, ?, datetime('now'))`,
    [searchRoot, dirPath],
  );
}

export function deleteIndex() {
  if (!db) return;
  try {
    db.run('DELETE FROM file_index');
    db.run('DELETE FROM scanned_dirs');
    saveIndex();
  } catch (err) {
    console.error('[DB] Falha ao limpar index.db:', err.message);
  }
}

export function saveIndex() {
  if (!db) return;
  try {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  } catch (err) {
    console.error('[DB] Falha ao salvar index.db:', err.message);
  }
}
