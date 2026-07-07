import initSqlJs from 'sql.js';
import fs from 'fs';

const APP_DB = '/db/app.db';
const INDEX_DB = '/db/index.db';

async function migrate() {
  const SQL = await initSqlJs();

  // Lê o banco atual (app.db)
  if (!fs.existsSync(APP_DB)) {
    console.error('app.db não encontrado em', APP_DB);
    process.exit(1);
  }

  const appBuffer = fs.readFileSync(APP_DB);
  const appDb = new SQL.Database(appBuffer);

  // Verifica quantos registros existem na file_index
  const [countResult] = appDb.exec('SELECT COUNT(*) as total FROM file_index');
  const totalRegistros = countResult?.values?.[0]?.[0] || 0;
  console.log(`Registros encontrados na file_index do app.db: ${totalRegistros}`);

  if (totalRegistros === 0) {
    console.log('Nada a migrar. O índice será construído do zero pelo indexador.');
    appDb.close();
    return;
  }

  // Cria o novo banco index.db
  let indexDb;
  if (fs.existsSync(INDEX_DB)) {
    const idxBuffer = fs.readFileSync(INDEX_DB);
    indexDb = new SQL.Database(idxBuffer);
  } else {
    indexDb = new SQL.Database();
  }

  indexDb.run(`CREATE TABLE IF NOT EXISTS file_index (
    protocol_number TEXT NOT NULL,
    file_path TEXT NOT NULL UNIQUE,
    file_name TEXT NOT NULL,
    search_root TEXT NOT NULL,
    indexed_at TEXT DEFAULT (datetime('now'))
  )`);
  indexDb.run('CREATE INDEX IF NOT EXISTS idx_protocol_number ON file_index(protocol_number)');

  // Copia os dados em lote
  const stmt = appDb.prepare('SELECT protocol_number, file_path, file_name, search_root FROM file_index');
  const insertStmt = indexDb.prepare(
    'INSERT OR IGNORE INTO file_index (protocol_number, file_path, file_name, search_root) VALUES (?, ?, ?, ?)',
  );

  let count = 0;
  indexDb.run('BEGIN TRANSACTION');

  while (stmt.step()) {
    const row = stmt.getAsObject();
    insertStmt.bind([row.protocol_number, row.file_path, row.file_name, row.search_root]);
    insertStmt.step();
    insertStmt.reset();
    count++;

    if (count % 10000 === 0) {
      indexDb.run('COMMIT');
      console.log(`  ...${count} registros migrados`);
      indexDb.run('BEGIN TRANSACTION');
    }
  }

  indexDb.run('COMMIT');
  stmt.free();
  insertStmt.free();

  // Salva o index.db
  const dir = '/db';
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(INDEX_DB, Buffer.from(indexDb.export()));
  indexDb.close();

  console.log(`\nMigração concluída: ${count} registros copiados para ${INDEX_DB}`);

  // Remove a tabela file_index do app.db (libera 100MB+)
  appDb.run('DROP TABLE IF EXISTS file_index');
  appDb.run('VACUUM');
  fs.writeFileSync(APP_DB, Buffer.from(appDb.export()));
  appDb.close();

  const appSize = (fs.statSync(APP_DB).size / 1024 / 1024).toFixed(1);
  const idxSize = (fs.statSync(INDEX_DB).size / 1024 / 1024).toFixed(1);
  console.log(`app.db: ${appSize}MB | index.db: ${idxSize}MB`);
  console.log('Pronto! Remova a linha "db.run(\'DELETE FROM refresh_tokens\')" se ainda existir no sqlite.js.');
}

migrate().catch((err) => {
  console.error('Falha na migração:', err);
  process.exit(1);
});
