import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger.js';
import { runIndex, saveIndex, isDirScanned, markDirScanned } from '../db/indexDb.js';

function getPathConfigsForYear(anoBusca) {
  const configs = [];
  const anoBuscaStr = anoBusca.toString();

  for (const key in process.env) {
    if (key.startsWith('YEARS_')) {
      const years = process.env[key].split(',').map((y) => y.trim());
      if (years.includes(anoBuscaStr)) {
        const serverId = key.replace('YEARS_', '');
        const pathKey = `PATH_${serverId}`;
        const configString = process.env[pathKey];

        if (configString) {
          const [basePath, subRootsString] = configString.split(',');
          if (subRootsString) {
            const searchRoots = subRootsString.split(';').map((p) => path.join(basePath.trim(), p.trim()));
            configs.push({ basePath: basePath.trim(), searchRoots });
          } else {
            const searchRoots = basePath.split(';').map((p) => p.trim());
            configs.push({ basePath: null, searchRoots });
          }
        }
      }
    }
  }
  return configs;
}

async function findFiles(dirPath, targetName, signal, maxDepth, searchRoot) {
  const stack = [[dirPath, 0]];
  const results = [];
  let foundDepth = Infinity;
  let fileCount = 0;

  runIndex('BEGIN TRANSACTION');

  try {
    while (stack.length > 0) {
      if (signal?.aborted) break;

      const [currentDir, depth] = stack.pop();
      let items;
      try {
        items = await fs.readdir(currentDir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const item of items) {
        if (signal?.aborted) break;
        const fullPath = path.join(currentDir, item.name);

        if (item.isDirectory()) {
          if (depth < Math.min(maxDepth, foundDepth - 1)) {
            stack.push([fullPath, depth + 1]);
          }
        } else {
          const fileBase = path.parse(item.name).name;
          const nomeBase = fileBase.toLowerCase();

          const protocolNumber = (nomeBase.match(/^\d+/) || [nomeBase])[0];
          runIndex(
            `INSERT OR IGNORE INTO file_index (protocol_number, file_path, file_name, search_root) VALUES (?, ?, ?, ?)`,
            [protocolNumber, fullPath, fileBase, searchRoot],
          );
          fileCount++;

          if (nomeBase.includes(targetName)) {
            results.push(fullPath);
            foundDepth = depth + 1;
          }

          if (fileCount % 5000 === 0) {
            runIndex('COMMIT');
            runIndex('BEGIN TRANSACTION');
          }
        }
      }
    }
  } finally {
    runIndex('COMMIT');
  }

  return results;
}

const LOCAL_SEARCH_EXTENSIONS = ['.mp3', '.wav', '.mp4', '.pdf', '.ogg', '.wma', '.avi', '.txt'];

function raceToFirstResult(promises) {
  return new Promise((resolve) => {
    let settled = false;
    for (const p of promises) {
      p.then((result) => {
        if (settled) return;
        if (result) {
          settled = true;
          resolve(result);
        }
      }).catch(() => {});
    }
    Promise.allSettled(promises).then(() => {
      if (!settled) resolve(null);
    });
  });
}

export async function findFileAndGetSignedUrl(pasta, nomeProtocolo, log = logger) {
  log.section('Início da requisição de busca local');
  log.info(`- Data do Protocolo (pasta): ${pasta}`);
  log.info(`- Nome do Arquivo (nomeProtocolo): ${nomeProtocolo}`);

  const [ano, mes, dia] = pasta.split('/');
  const anoBusca = parseInt(ano, 10);

  const pathConfigs = getPathConfigsForYear(anoBusca);

  if (!pathConfigs || pathConfigs.length === 0) {
    log.error(`Nenhuma configuração de caminho associada ao ano ${anoBusca} encontrada no .env.`);
    return null;
  }

  let algumCaminhoAcessivel = false;

  for (const pathConfig of pathConfigs) {
    for (const searchRoot of pathConfig.searchRoots) {
      try {
        await fs.access(searchRoot);
      } catch {
        log.warn(`O caminho de busca "${searchRoot}" não está acessível. Pulando...`);
        continue;
      }

      algumCaminhoAcessivel = true;

      const variantes = [
        path.join(ano, String(parseInt(mes, 10)), String(parseInt(dia, 10))),
        path.join(ano, String(parseInt(mes, 10)), dia.padStart(2, '0')),
        path.join(ano, mes.padStart(2, '0'), dia.padStart(2, '0')),
        path.join(ano, mes.padStart(2, '0'), String(parseInt(dia, 10))),
      ];
      const prefixosUnicos = [...new Set(variantes)];

      const relativeBasePath = pathConfig.basePath || searchRoot;
      const termoBuscado = path.parse(nomeProtocolo).name.toLowerCase();

      log.info(`Buscando em: ${searchRoot}`);
      const t0 = performance.now();

      const abortController = new AbortController();
      const { signal } = abortController;

      const promessas = prefixosUnicos.map(async (prefixo) => {
        const fullPath = path.join(searchRoot, prefixo);
        log.info(`Testando caminho: ${prefixo}`);

        const tStat = performance.now();
        try {
          const stat = await fs.stat(fullPath);
          log.info(`   [TIMING] fs.stat OK (${(performance.now() - tStat).toFixed(0)}ms)`);
          if (!stat.isDirectory()) return null;
        } catch {
          log.info(`   [TIMING] fs.stat ENOENT (${(performance.now() - tStat).toFixed(0)}ms)`);
          return null;
        }

        // Tentativa direta com extensões comuns
        for (const ext of LOCAL_SEARCH_EXTENSIONS) {
          if (signal?.aborted) return null;
          const directPath = path.join(fullPath, nomeProtocolo + ext);
          try {
            await fs.access(directPath);
            log.success(`   [DIRECT] Arquivo encontrado via acesso direto: ${directPath}`);

            abortController.abort();
            const relativePath = path.relative(relativeBasePath, directPath);
            const pathKey = relativePath.replace(/\\/g, '/');
            const nomeParaDownload = path.basename(pathKey);
            const downloadUrl = `/download-local?file=${encodeURIComponent(directPath)}`;

            log.success(`Arquivo encontrado! Chave: ${pathKey}`);
            return [{ downloadUrl, nomeParaDownload }];
          } catch {
            /* arquivo não existe com essa extensão */
          }
        }

        // Fallback: escaneia com indexação on-the-fly
        if (isDirScanned(searchRoot, prefixo)) {
          log.info(`   [SKIP] ${prefixo} já indexado há menos de 24h. Pulando scan.`);
          return null;
        }

        const tFind = performance.now();
        const foundFiles = await findFiles(fullPath, termoBuscado, signal, 2, searchRoot);
        markDirScanned(searchRoot, prefixo);
        log.info(
          `   [TIMING] findFiles: ${(performance.now() - tFind).toFixed(0)}ms (indexados ${foundFiles.length} arquivos)`,
        );

        if (foundFiles.length === 0) return null;

        return foundFiles.map((fp) => {
          const relativePath = path.relative(relativeBasePath, fp);
          const pathKey = relativePath.replace(/\\/g, '/');
          const nomeParaDownload = path.basename(pathKey);
          const downloadUrl = `/download-local?file=${encodeURIComponent(fp)}`;
          log.success(`Arquivo encontrado! Chave: ${pathKey}`);
          log.info(`Arquivo físico em: ${fp}`);
          log.info(`URL de download: ${downloadUrl}`);
          return { downloadUrl, nomeParaDownload };
        });
      });

      const resultado = await raceToFirstResult(promessas);
      log.info(`   [TIMING] Busca local resolvida em ${(performance.now() - t0).toFixed(0)}ms`);

      // Persiste índice assíncrono (arquivos indexados no fallback)
      setImmediate(() => saveIndex());

      if (resultado) {
        log.section('Busca local finalizada com sucesso');
        return resultado;
      }
    }
  }

  if (!algumCaminhoAcessivel) {
    log.error('Nenhum caminho de busca local está acessível.');
    log.section('Busca local finalizada com erro');
    return { erro: 'Nenhum caminho de rede acessivel' };
  }

  log.info('Nenhum arquivo correspondente encontrado localmente.');
  log.section('Busca local finalizada');
  return null;
}
