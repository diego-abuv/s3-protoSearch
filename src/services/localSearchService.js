import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger.js';

const QUICK_READDIR_TIMEOUT_MS = 240_000;
const FIND_FILES_TIMEOUT_MS = 300_000;

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

async function findFiles(dirPath, targetName, signal, maxDepth, searchRoot, log = logger) {
  const stack = [[dirPath, 0]];
  const results = [];
  let foundDepth = Infinity;

  while (stack.length > 0) {
    if (signal?.aborted) break;

    const [currentDir, depth] = stack.pop();
    let items = null;
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        items = await fs.readdir(currentDir, { withFileTypes: true, signal });
        if (items && items.length > 0) break;
      } catch (err) {
        lastError = err;
      }
      if (attempt < 1) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
    if (!items || items.length === 0) {
      if (lastError) {
        log.warn(`[findFiles] Falha ao ler "${currentDir}" após 2 tentativas: ${lastError.message}`);
      }
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

        if (nomeBase.includes(targetName)) {
          results.push(fullPath);
          foundDepth = depth + 1;
        }
      }
    }
  }

  return results;
}

const LOCAL_SEARCH_EXTENSIONS = ['.mp3', '.wav', '.mp4', '.pdf', '.ogg', '.wma', '.avi', '.txt'];

const SERVER_NAMES = {
  '192-168-0-254': 'AD-MBE',
  '192-168-16-74': 'STORAGE',
  '192-168-0-196': 'BACKUP',
};

function getShareFriendlyName(searchRoot) {
  for (const [ip, name] of Object.entries(SERVER_NAMES)) {
    if (searchRoot.includes(ip)) return name;
  }
  const match = searchRoot.match(/(\d+\.\d+\.\d+\.\d+)/);
  return match ? `Servidor ${match[1]}` : 'Servidor';
}

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
      if (!settled) {
        settled = true;
        resolve(null);
      }
    });
  });
}

async function quickReaddirSearch(dirPath, targetName, signal, maxDepth = 1, log = logger) {
  const results = [];
  const stack = [[dirPath, 0]];

  while (stack.length > 0) {
    if (signal?.aborted) break;
    const [currentDir, depth] = stack.pop();

    let items = null;
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        items = await fs.readdir(currentDir, { withFileTypes: true, signal });
        break;
      } catch (err) {
        lastError = err;
        if (attempt < 1) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }
    if (!items) {
      log.warn(`[quickReaddirSearch] Falha ao ler "${currentDir}" após 2 tentativas: ${lastError?.message}`);
      continue;
    }
    if (items.length === 0) continue;

    for (const item of items) {
      if (signal?.aborted) break;
      const fullPath = path.join(currentDir, item.name);

      if (item.isDirectory()) {
        if (depth < maxDepth) {
          stack.push([fullPath, depth + 1]);
        }
      } else {
        const nomeBase = path.parse(item.name).name.toLowerCase();
        if (nomeBase.includes(targetName)) {
          results.push(fullPath);
        }
      }
    }
  }

  return results;
}

export async function findFileAndGetSignedUrl(pasta, nomeProtocolo, log = logger, externalSignal, onProgress) {
  log.section('Início da requisição de busca local');
  log.info(`- Data do Protocolo (pasta): ${pasta}`);
  log.info(`- Nome do Arquivo (nomeProtocolo): ${nomeProtocolo}`);

  if (externalSignal?.aborted) {
    log.warn('Busca local interrompida (conexão perdida).');
    return null;
  }

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
      if (externalSignal?.aborted) {
        log.warn('Busca local interrompida (conexão perdida).');
        break;
      }

      try {
        await Promise.race([
          fs.access(searchRoot),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
        ]);
      } catch {
        log.warn(`O caminho de busca "${searchRoot}" não está acessível ou excedeu timeout. Pulando...`);
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
      onProgress?.({ type: 'local_share', message: `Escaneando ${getShareFriendlyName(searchRoot)}...` });
      const t0 = performance.now();

      const shareAbort = new AbortController();

      const promessas = prefixosUnicos.map(async (prefixo) => {
        try {
          const fullPath = path.join(searchRoot, prefixo);
          log.info(`Testando caminho: ${prefixo}`);

          const tStat = performance.now();
          try {
            await Promise.race([
              fs.stat(fullPath),
              new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
            ]);
            log.info(`   [TIMING] ${prefixo}: OK (${(performance.now() - tStat).toFixed(0)}ms)`);
          } catch {
            log.info(`   [TIMING] ${prefixo}: inacessível (${(performance.now() - tStat).toFixed(0)}ms)`);
            return null;
          }

          for (const ext of LOCAL_SEARCH_EXTENSIONS) {
            if (externalSignal?.aborted) return null;
            const directPath = path.join(fullPath, nomeProtocolo + ext);
            try {
              await Promise.race([
                fs.access(directPath),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
              ]);
              log.success(`   [DIRECT] Arquivo encontrado via acesso direto: ${directPath}`);

              shareAbort.abort();
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

          if (!externalSignal?.aborted) {
            let hourDirs;
            try {
              const dateEntries = await fs.readdir(fullPath, { withFileTypes: true, signal: externalSignal });
              hourDirs = dateEntries.filter((d) => d.isDirectory()).map((d) => path.join(fullPath, d.name));
            } catch (err) {
              log.warn(`[streaming] Falha ao listar horas em "${fullPath}": ${err.message}`);
              hourDirs = [];
            }

            for (const hourDir of hourDirs) {
              if (externalSignal?.aborted) break;
              let dir = null;
              let lastOpenError = null;
              for (let attempt = 0; attempt < 2; attempt++) {
                try {
                  dir = await fs.opendir(hourDir);
                  break;
                } catch (err) {
                  lastOpenError = err;
                  if (attempt < 1) {
                    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
                  }
                }
              }
              if (!dir) {
                log.warn(`[streaming] Falha ao abrir "${hourDir}" após 2 tentativas: ${lastOpenError?.message}`);
                continue;
              }
              try {
                let entry;
                const fastMatches = [];
                try {
                  while ((entry = await dir.read()) !== null) {
                    if (externalSignal?.aborted) break;
                    if (entry.isDirectory()) continue;
                    const nomeBase = path.parse(entry.name).name.toLowerCase();
                    if (nomeBase.includes(termoBuscado)) {
                      fastMatches.push(entry);
                    }
                  }
                } catch (err) {
                  log.warn(
                    `[streaming] Erro ao ler entradas de "${hourDir}": ${err.message} (parcial: ${fastMatches.length} match(es) até o momento)`,
                  );
                }

                if (fastMatches.length > 0) {
                  shareAbort.abort();
                  const results = fastMatches.map((entry) => {
                    const hitPath = path.join(hourDir, entry.name);
                    log.success(`   [FAST] Arquivo encontrado: ${hitPath}`);
                    const relativePath = path.relative(relativeBasePath, hitPath);
                    const pathKey = relativePath.replace(/\\/g, '/');
                    const nomeParaDownload = path.basename(pathKey);
                    const downloadUrl = `/download-local?file=${encodeURIComponent(hitPath)}`;
                    log.success(`Arquivo encontrado! Chave: ${pathKey}`);
                    log.info(`Arquivo físico em: ${hitPath}`);
                    return { downloadUrl, nomeParaDownload };
                  });
                  return results;
                }
              } finally {
                await dir.close();
              }
            }
          }

          if (!externalSignal?.aborted) {
            const quickAbort = new AbortController();
            const quickTimer = setTimeout(() => quickAbort.abort(), QUICK_READDIR_TIMEOUT_MS);
            const quickSignals = [quickAbort.signal];
            if (externalSignal) quickSignals.push(externalSignal);
            const quickSignal = AbortSignal.any(quickSignals);

            const tQuick = performance.now();
            const quickResults = await quickReaddirSearch(fullPath, termoBuscado, quickSignal, 1, log);
            clearTimeout(quickTimer);
            log.info(
              `   [TIMING] ${prefixo}: quickReaddir: ${(performance.now() - tQuick).toFixed(0)}ms (encontrados ${quickResults.length})`,
            );

            if (quickResults.length > 0) {
              shareAbort.abort();
              return quickResults.map((fp) => {
                const relativePath = path.relative(relativeBasePath, fp);
                const pathKey = relativePath.replace(/\\/g, '/');
                const nomeParaDownload = path.basename(pathKey);
                const downloadUrl = `/download-local?file=${encodeURIComponent(fp)}`;
                log.success(`Arquivo encontrado via readdir! Chave: ${pathKey}`);
                log.info(`Arquivo físico em: ${fp}`);
                return { downloadUrl, nomeParaDownload };
              });
            }
          }

          if (!externalSignal?.aborted) {
            const findAbort = new AbortController();
            const findTimer = setTimeout(() => findAbort.abort(), FIND_FILES_TIMEOUT_MS);
            const findSignals = [findAbort.signal];
            if (externalSignal) findSignals.push(externalSignal);
            const findSignal = AbortSignal.any(findSignals);

            const tFind = performance.now();
            const foundFiles = await findFiles(fullPath, termoBuscado, findSignal, 3, searchRoot, log);
            clearTimeout(findTimer);
            log.info(
              `   [TIMING] ${prefixo}: findFiles: ${(performance.now() - tFind).toFixed(0)}ms (encontrados ${foundFiles.length} arquivos)`,
            );

            if (foundFiles.length === 0) {
              return null;
            }

            shareAbort.abort();
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
          }

          return null;
        } catch (err) {
          log.error(`[${prefixo}] Erro interno na busca local: ${err.message}`);
          return null;
        }
      });

      const resultado = await raceToFirstResult(promessas);

      log.info(`   [TIMING] Busca local resolvida em ${(performance.now() - t0).toFixed(0)}ms`);

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
