import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import readline from 'readline';
import initSqlJs from 'sql.js';
import fsSync from 'fs';

const DB_PATH = '/db/index.db';
const BATCH_SIZE = 10_000;

function getPathConfigs() {
  const configs = [];
  const pathKeys = {};

  for (const key in process.env) {
    if (key.startsWith('PATH_')) {
      const serverId = key.replace('PATH_', '');
      const yearsKey = `YEARS_${serverId}`;
      const years = process.env[yearsKey];
      if (years) {
        pathKeys[serverId] = {
          configString: process.env[key],
          years: years.split(',').map((y) => y.trim()),
        };
      }
    }
  }

  for (const serverId in pathKeys) {
    const { configString, years } = pathKeys[serverId];
    const [basePath, subRootsString] = configString.split(',');
    if (subRootsString) {
      const searchRoots = subRootsString
        .split(';')
        .map((p) => path.join(basePath.trim(), p.trim()).replace(/\\/g, '/'));
      configs.push({ basePath: basePath.trim().replace(/\\/g, '/'), searchRoots, years });
    } else {
      const searchRoots = basePath.split(';').map((p) => p.trim().replace(/\\/g, '/'));
      configs.push({ basePath: null, searchRoots, years });
    }
  }
  return configs;
}

function extractProtocolNumber(baseName) {
  const match = baseName.match(/^\d+/);
  return match ? String(parseInt(match[0], 10)) : baseName;
}

function saveDb(db) {
  const data = db.export();
  const dir = path.dirname(DB_PATH);
  if (!fsSync.existsSync(dir)) fsSync.mkdirSync(dir, { recursive: true });
  fsSync.writeFileSync(DB_PATH, Buffer.from(data));
}

async function indexPathWithFind(rootPath, searchRoot, db) {
  const find = spawn('find', [rootPath, '-maxdepth', '4', '-type', 'f', '-printf', '%P\n'], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  const rl = readline.createInterface({ input: find.stdout, crlfDelay: Infinity });
  let count = 0;

  db.run('BEGIN TRANSACTION');

  for await (const relativePath of rl) {
    const fileBase = path.parse(relativePath).name;
    const protocolNumber = extractProtocolNumber(fileBase);
    const fullPath = path.join(rootPath, relativePath).replace(/\\/g, '/');
    const filePathNormalized = fullPath;

    try {
      db.run(
        `INSERT OR IGNORE INTO file_index (protocol_number, file_path, file_name, search_root)
         VALUES (?, ?, ?, ?)`,
        [protocolNumber, filePathNormalized, fileBase, searchRoot],
      );
      count++;
    } catch (err) {
      db.run('ROLLBACK');
      throw err;
    }

    if (count % BATCH_SIZE === 0) {
      db.run('COMMIT');
      saveDb(db);
      console.log(`    ...${count} arquivos`);
      db.run('BEGIN TRANSACTION');
    }
  }

  db.run('COMMIT');
  saveDb(db);
  return count;
}

async function indexFiles() {
  console.log('=== INDEXADOR DE ARQUIVOS ===');
  const start = Date.now();

  const SQL = await initSqlJs();
  let db;
  if (fsSync.existsSync(DB_PATH)) {
    const buffer = fsSync.readFileSync(DB_PATH);
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

  const [existing] = db.exec('SELECT COUNT(*) as total FROM file_index');
  const totalAntes = existing?.values?.[0]?.[0] || 0;
  console.log(`Registros existentes no índice: ${totalAntes}`);

  if (totalAntes > 0) {
    console.log('Removendo índice antigo...');
    db.run('DELETE FROM file_index');
  }

  const configs = getPathConfigs();
  let totalArquivos = 0;
  let totalRoots = 0;

  for (const config of configs) {
    for (const searchRoot of config.searchRoots) {
      try {
        await fs.access(searchRoot);
      } catch {
        console.log(`  [PULANDO] Inacessível: ${searchRoot}`);
        continue;
      }

      totalRoots++;
      console.log(`\nIndexando: ${searchRoot}...`);
      const tRoot = Date.now();

      for (const year of config.years) {
        const yearPath = path.join(searchRoot, year).replace(/\\/g, '/');
        try {
          await fs.access(yearPath);
        } catch {
          console.log(`    Ano ${year}: diretório não encontrado, pulando`);
          continue;
        }

        console.log(`    Ano ${year}: iniciando find...`);
        const encontrados = await indexPathWithFind(yearPath, searchRoot, db);
        totalArquivos += encontrados;
        saveDb(db);
        console.log(`    Ano ${year}: ${encontrados} arquivos indexados`);
      }

      const tElapsed = ((Date.now() - tRoot) / 1000).toFixed(1);
      console.log(`  Raiz concluída em ${tElapsed}s`);
    }
  }

  saveDb(db);
  db.close();

  const total = Date.now() - start;
  console.log(`\n=== INDEXAÇÃO CONCLUÍDA ===`);
  console.log(`  Total de arquivos indexados: ${totalArquivos}`);
  console.log(`  Total de raízes processadas: ${totalRoots}`);
  console.log(`  Tempo total: ${(total / 1000).toFixed(1)}s`);
  console.log(`  DB: ${DB_PATH}`);
}

indexFiles().catch((err) => {
  console.error('Falha na indexação:', err);
  process.exit(1);
});
