import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger.js';

const SCAN_LEVEL0_TIMEOUT_MS = 600_000;

const NETWORK_ERROR_CODES = new Set(['ehostdown', 'ehostunreach', 'enetdown', 'enetunreach', 'econnreset']);

function isNetworkError(err) {
  if (!err || err.name === 'AbortError') return false;
  const code = String(err.code || '').toLowerCase();
  return NETWORK_ERROR_CODES.has(code) || /host is down|host unreachable/i.test(err.message || '');
}

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

async function scanDayDir(dirPath, targetName, signal, log = logger) {
  const nivel0 = [];
  const hourDirs = [];
  let items;
  try {
    items = await fs.readdir(dirPath, { withFileTypes: true, signal });
  } catch (err) {
    log.warn(`[scanDayDir] Falha ao ler "${dirPath}": ${err.message}`);
    return { nivel0, hourDirs, readError: err };
  }
  if (items.length === 0) return { nivel0, hourDirs };

  for (const item of items) {
    if (signal?.aborted) break;
    if (item.isDirectory()) {
      hourDirs.push(path.join(dirPath, item.name));
    } else {
      const nomeBase = path.parse(item.name).name.toLowerCase();
      if (nomeBase.includes(targetName)) {
        nivel0.push(path.join(dirPath, item.name));
      }
    }
  }

  return { nivel0, hourDirs };
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

      const acessiveis = [];
      for (const prefixo of prefixosUnicos) {
        if (externalSignal?.aborted) break;
        const fullPath = path.join(searchRoot, prefixo);
        log.info(`Testando caminho: ${prefixo}`);

        const tStat = performance.now();
        try {
          await Promise.race([
            fs.stat(fullPath),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
          ]);
          log.info(`   [TIMING] ${prefixo}: OK (${(performance.now() - tStat).toFixed(0)}ms)`);
          acessiveis.push(prefixo);
        } catch {
          log.info(`   [TIMING] ${prefixo}: inacessível (${(performance.now() - tStat).toFixed(0)}ms)`);
        }
      }

      let resultado = null;

      for (const prefixo of acessiveis) {
        if (externalSignal?.aborted) break;
        const fullPath = path.join(searchRoot, prefixo);

        const dayAbort = new AbortController();
        const dayTimer = setTimeout(() => dayAbort.abort(), SCAN_LEVEL0_TIMEOUT_MS);
        const daySignals = [dayAbort.signal];
        if (externalSignal) daySignals.push(externalSignal);
        const daySignal = AbortSignal.any(daySignals);

        const tDay = performance.now();
        const { nivel0, hourDirs, readError } = await scanDayDir(fullPath, termoBuscado, daySignal, log);
        log.info(
          `   [TIMING] ${prefixo}: scanDayDir: ${(performance.now() - tDay).toFixed(0)}ms (nivel0: ${nivel0.length}, horas: ${hourDirs.length})`,
        );

        if (readError && isNetworkError(readError) && !externalSignal?.aborted) {
          clearTimeout(dayTimer);
          log.error(`[scanDayDir] Falha de rede ao ler "${fullPath}": ${readError.message}`);
          return { erro: readError.message };
        }

        if (nivel0.length > 0) {
          resultado = nivel0.map((fp) => {
            const relativePath = path.relative(relativeBasePath, fp);
            const pathKey = relativePath.replace(/\\/g, '/');
            const nomeParaDownload = path.basename(pathKey);
            const downloadUrl = `/download-local?file=${encodeURIComponent(fp)}`;
            log.success(`Arquivo encontrado via readdir! Chave: ${pathKey}`);
            log.info(`Arquivo físico em: ${fp}`);
            return { downloadUrl, nomeParaDownload };
          });
          clearTimeout(dayTimer);
          break;
        }

        if (!externalSignal?.aborted) {
          for (const hourDir of hourDirs) {
            if (externalSignal?.aborted) break;
            let dir;
            try {
              dir = await fs.opendir(hourDir);
            } catch (err) {
              if (isNetworkError(err)) {
                clearTimeout(dayTimer);
                log.error(`[streaming] Falha de rede ao abrir "${hourDir}": ${err.message}`);
                return { erro: err.message };
              }
              log.warn(`[streaming] Falha ao abrir "${hourDir}": ${err.message}`);
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
                resultado = fastMatches.map((entry) => {
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
                break;
              }
            } finally {
              await dir.close();
            }
          }
        }

        clearTimeout(dayTimer);

        if (resultado || externalSignal?.aborted) break;
      }

      log.info(`   [TIMING] Busca local resolvida em ${(performance.now() - t0).toFixed(0)}ms`);

      if (externalSignal?.aborted) {
        log.warn('Busca local interrompida (conexão perdida).');
        return { erro: 'conexão perdida' };
      }

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
