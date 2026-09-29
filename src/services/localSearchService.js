import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { systemLog } from '../utils/logger.js';

const SCAN_LEVEL0_TIMEOUT_MS = 600_000;
const FS_PROBE_TIMEOUT_MS = 5000;
const MOUNTINFO_PATH = '/proc/self/mountinfo';

const NETWORK_ERROR_CODES = new Set([
  'ehostdown',
  'ehostunreach',
  'enetdown',
  'enetunreach',
  'econnreset',
  'ebusy',
  'enotconn',
  'estale',
  'eio',
  'etimedout',
  'unknown',
]);

function isNetworkError(err) {
  if (!err || err.name === 'AbortError') return false;
  const code = String(err.code || '').toLowerCase();
  return NETWORK_ERROR_CODES.has(code) || /host is down|host unreachable/i.test(err.message || '');
}

function makeTimeoutError() {
  const err = new Error(`timeout apos ${FS_PROBE_TIMEOUT_MS}ms`);
  err.code = 'ETIMEDOUT';
  return err;
}

async function probeFilesystem(fn) {
  let timer;
  try {
    return await Promise.race([
      fn(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(makeTimeoutError()), FS_PROBE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function unescapeMountPoint(value) {
  return value.replace(/\\([0-7]{3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)));
}

function parseMountPoints(content) {
  const points = [];
  for (const line of content.split('\n')) {
    const fields = line.trim().split(/\s+/);
    if (fields.length < 5) continue;
    points.push(unescapeMountPoint(fields[4]));
  }
  return points;
}

function resolveMountState(target, mountPoints) {
  const normalized = target.replace(/\/+$/, '') || '/';
  if (normalized === '/') return true;
  if (mountPoints.includes(normalized)) return true;
  const hasAncestor = mountPoints.some((point) => normalized.startsWith(point === '/' ? '/' : `${point}/`));
  return hasAncestor ? false : null;
}

async function readMountPoints() {
  try {
    return parseMountPoints(await probeFilesystem(() => fs.readFile(MOUNTINFO_PATH, 'utf8')));
  } catch {
    return null;
  }
}

async function verifyShares(shareStates, log) {
  const healthy = [...shareStates.entries()].filter(([, share]) => share.status === 'ok');
  if (healthy.length === 0) return;

  const mountPoints = await readMountPoints();

  for (const [searchRoot, share] of healthy) {
    if (mountPoints) {
      const mountState = resolveMountState(searchRoot, mountPoints);
      if (mountState === true) continue;
      if (mountState === false) {
        share.status = 'nao-montado';
        log.warn(`Share "${searchRoot}" nao esta montado neste container: o submount nao propagou.`);
        continue;
      }
    }

    try {
      const entries = await probeFilesystem(() => fs.readdir(searchRoot));
      if (entries.length === 0) {
        share.status = 'vazio';
        log.warn(`Share "${searchRoot}" esta acessivel mas a raiz esta vazia.`);
      }
    } catch (err) {
      if (isNetworkError(err)) {
        share.status = 'rede';
        log.warn(`Falha de rede ao listar a raiz do share "${searchRoot}": ${err.message}`);
      }
    }
  }
}

function listSharesIndisponiveis(shareStates) {
  return [...shareStates.values()]
    .filter((share) => share.status !== 'ok')
    .map((share) => `${share.nome}:${share.status}`);
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

async function scanDayDir(dirPath, targetName, signal, log = systemLog) {
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

export async function findFileAndGetSignedUrl(pasta, nomeProtocolo, log = systemLog, externalSignal, onProgress) {
  log.section('Início da requisição de busca local');
  log.info(`- Data do Protocolo (pasta): ${pasta}`);
  log.info(`- Nome do Arquivo (nomeProtocolo): ${nomeProtocolo}`);

  const serversConsulted = [];

  if (externalSignal?.aborted) {
    log.warn('Busca local interrompida (conexão perdida).');
    return { arquivos: null, _meta: { servers: serversConsulted } };
  }

  const [ano, mes, dia] = pasta.split('/');
  const anoBusca = parseInt(ano, 10);

  const pathConfigs = getPathConfigsForYear(anoBusca);

  if (!pathConfigs || pathConfigs.length === 0) {
    log.error(`Nenhuma configuração de caminho associada ao ano ${anoBusca} encontrada no .env.`);
    return { arquivos: null, _meta: { servers: serversConsulted } };
  }

  let algumCaminhoAcessivel = false;
  const shareStates = new Map();

  for (const pathConfig of pathConfigs) {
    for (const searchRoot of pathConfig.searchRoots) {
      if (externalSignal?.aborted) {
        log.warn('Busca local interrompida (conexão perdida).');
        break;
      }

      const friendlyName = getShareFriendlyName(searchRoot);

      try {
        await probeFilesystem(() => fs.access(searchRoot));
      } catch (err) {
        shareStates.set(searchRoot, {
          nome: friendlyName,
          status: isNetworkError(err) ? 'rede' : 'inacessivel',
        });
        log.warn(
          `O caminho de busca "${searchRoot}" não está acessível ou excedeu timeout [${err.code || 'SEM_CODIGO'}]: ${err.message}. Pulando...`,
        );
        continue;
      }

      algumCaminhoAcessivel = true;
      serversConsulted.push(friendlyName);
      shareStates.set(searchRoot, { nome: friendlyName, status: 'ok' });

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
          await probeFilesystem(() => fs.stat(fullPath));
          log.info(`   [TIMING] ${prefixo}: OK (${(performance.now() - tStat).toFixed(0)}ms)`);
          acessiveis.push(prefixo);
        } catch (err) {
          const codigo = err.code || 'SEM_CODIGO';
          log.info(`   [TIMING] ${prefixo}: inacessível (${(performance.now() - tStat).toFixed(0)}ms) [${codigo}]`);
          const share = shareStates.get(searchRoot);
          if (share && share.status === 'ok' && codigo !== 'ENOENT') {
            share.status = isNetworkError(err) ? 'rede' : 'erro';
          }
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
          return { arquivos: null, _meta: { servers: serversConsulted }, erro: readError.message };
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
                return { arquivos: null, _meta: { servers: serversConsulted }, erro: err.message };
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
        return { arquivos: null, _meta: { servers: serversConsulted }, erro: 'conexão perdida' };
      }

      if (resultado) {
        log.section('Busca local finalizada com sucesso');
        return { arquivos: resultado, _meta: { servers: serversConsulted } };
      }
    }
  }

  await verifyShares(shareStates, log);

  const sharesIndisponiveis = listSharesIndisponiveis(shareStates);

  if (!algumCaminhoAcessivel) {
    log.error('Nenhum caminho de busca local está acessível.');
    log.section('Busca local finalizada com erro');
    return {
      arquivos: null,
      _meta: { servers: serversConsulted, sharesIndisponiveis },
      erro: 'Nenhum caminho de rede acessivel',
    };
  }

  if (sharesIndisponiveis.length > 0) {
    log.error(`Resultado não confiável: share(s) indisponível(is): ${sharesIndisponiveis.join(', ')}`);
    log.section('Busca local finalizada com erro');
    return {
      arquivos: null,
      _meta: { servers: serversConsulted, sharesIndisponiveis },
      erro: `share indisponivel: ${sharesIndisponiveis.join(',')}`,
    };
  }

  log.info('Nenhum arquivo correspondente encontrado localmente.');
  log.section('Busca local finalizada');
  return { arquivos: null, _meta: { servers: serversConsulted } };
}
