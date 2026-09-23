import { findFileAndGetSignedUrl as findInS3 } from './s3SearchService.js';
import { findFileAndGetSignedUrl as findLocally } from './localSearchService.js';
import { translateError } from '../utils/errorCodes.js';
import { systemLog } from '../utils/logger.js';
import { cacheGet, cacheSet } from '../utils/cache.js';

const GLOBAL_TIMEOUT_MS = 1_800_000;
const NULL_CACHE_TTL = 15;
const FOUND_CACHE_TTL = 300;

const activeSearches = new Map();

const MAX_CONCURRENT_LOCAL_SEARCHES = 2;
let activeLocalSearches = 0;
const localSearchQueue = [];

async function acquireLocalSearchSlot() {
  if (activeLocalSearches < MAX_CONCURRENT_LOCAL_SEARCHES) {
    activeLocalSearches++;
    return;
  }
  await new Promise((resolve) => localSearchQueue.push(resolve));
  activeLocalSearches++;
}

function releaseLocalSearchSlot() {
  activeLocalSearches--;
  if (localSearchQueue.length > 0) {
    const next = localSearchQueue.shift();
    next();
  }
}

export async function findFileAndGetSignedUrl(pasta, nomeProtocolo, log = systemLog, onProgress, externalSignal) {
  const cacheKey = `busca:${pasta}:${nomeProtocolo}`;
  const cached = await cacheGet(cacheKey);
  if (cached) {
    log.info('Cache hit busca unificada');
    onProgress?.({ type: 'cache_hit', message: 'Resultado encontrado no cache' });
    return { ...cached, _meta: { ...(cached._meta || {}), cache: true } };
  }

  if (activeSearches.has(cacheKey)) {
    log.info('Busca duplicada, aguardando resultado existente');
    onProgress?.({ type: 'dedup', message: 'Busca já em andamento, aguardando...' });
    return activeSearches.get(cacheKey);
  }

  const searchPromise = doSearch(pasta, nomeProtocolo, log, onProgress, cacheKey, externalSignal);
  activeSearches.set(cacheKey, searchPromise);

  try {
    return await searchPromise;
  } finally {
    activeSearches.delete(cacheKey);
  }
}

async function doSearch(pasta, nomeProtocolo, log, onProgress, cacheKey, externalSignal) {
  const inicio = Date.now();
  const globalAbort = new AbortController();
  const globalSignal = globalAbort.signal;
  const globalTimer = setTimeout(() => globalAbort.abort(), GLOBAL_TIMEOUT_MS);

  if (externalSignal) {
    externalSignal.addEventListener(
      'abort',
      () => {
        if (!globalSignal.aborted) globalAbort.abort();
      },
      { once: true },
    );
  }

  log.section('INICIANDO BUSCA UNIFICADA');

  let s3Status;
  let localStatus = 'nao_consultado';
  const mergedMeta = { cache: false };

  try {
    log.info('1. Tentando busca no S3...');
    onProgress?.({ type: 's3_start', message: 'Buscando no S3 (nuvem)...' });
    const tS3 = Date.now();
    try {
      const s3Response = await findInS3(pasta, nomeProtocolo, log);
      const s3Timing = ((Date.now() - tS3) / 1000).toFixed(2);
      log.info(`   [TIMING] S3 retornou em ${s3Timing}s`);
      Object.assign(mergedMeta, s3Response?._meta || {}, { tempo_s3: `${s3Timing}s` });

      if (s3Response?.arquivos) {
        if (globalSignal.aborted) {
          s3Status = 'cancelado';
        } else {
          log.success('Arquivo(os) encontrado(os) no S3.');
          onProgress?.({ type: 's3_done', message: 'S3: concluído' });
          log.section(`BUSCA FINALIZADA (${((Date.now() - inicio) / 1000).toFixed(2)}s)`);
          const s3ResultObj = {
            arquivos: s3Response.arquivos,
            status: { s3: 'ok', local: localStatus },
            _meta: mergedMeta,
          };
          await cacheSet(
            cacheKey,
            { arquivos: s3ResultObj.arquivos, status: s3ResultObj.status, _meta: mergedMeta },
            FOUND_CACHE_TTL,
          );
          return s3ResultObj;
        }
      } else {
        log.info('S3: Nenhum arquivo encontrado.');
        onProgress?.({ type: 's3_done', message: 'S3: concluído' });
        s3Status = 'nao_encontrado';
      }
    } catch (err) {
      log.error(`S3 indisponível ou falha de conexão: ${translateError(err.message)}`);
      log.error('Erro original S3:', err);
      const s3Timing = ((Date.now() - tS3) / 1000).toFixed(2);
      log.info(`   [TIMING] S3 falhou em ${s3Timing}s`);
      onProgress?.({ type: 's3_done', message: 'S3: concluído (falha)' });
      s3Status = `erro: ${translateError(err.message)}`;
      mergedMeta.tempo_s3 = `${s3Timing}s`;
    }

    log.info('2. Tentando busca local (fallback)...');
    onProgress?.({ type: 'local_start', message: 'Escaneando servidores locais...' });
    const tLocal = Date.now();
    try {
      await acquireLocalSearchSlot();
      let localResponse;
      try {
        localResponse = await findLocally(pasta, nomeProtocolo, log, globalSignal, onProgress);
      } finally {
        releaseLocalSearchSlot();
      }

      const localTiming = ((Date.now() - tLocal) / 1000).toFixed(2);
      log.info(`   [TIMING] Local retornou em ${localTiming}s`);
      mergedMeta.tempo_local = `${localTiming}s`;

      const localFiles = localResponse?.arquivos;
      const localMeta = localResponse?._meta || {};
      Object.assign(mergedMeta, { servers: localMeta.servers || [] });

      if (Array.isArray(localFiles)) {
        if (localFiles.length > 0) {
          if (globalSignal.aborted) {
            log.warn('Arquivo(s) encontrado(s) localmente, mas a busca foi cancelada.');
          } else {
            log.success(`Arquivo(os) encontrado(os) localmente (${localFiles.length}).`);
            log.section(`BUSCA FINALIZADA (${((Date.now() - inicio) / 1000).toFixed(2)}s)`);
            const localResultObj = {
              arquivos: localFiles,
              status: { s3: s3Status, local: 'ok' },
              _meta: mergedMeta,
            };
            await cacheSet(
              cacheKey,
              { arquivos: localResultObj.arquivos, status: localResultObj.status, _meta: mergedMeta },
              FOUND_CACHE_TTL,
            );
            return localResultObj;
          }
        } else {
          log.info('Local: Nenhum arquivo encontrado.');
          localStatus = 'nao_encontrado';
        }
      } else if (localResponse?.erro) {
        log.error(`Busca local impossibilitada: ${translateError(localResponse.erro)}`);
        localStatus = `erro: ${translateError(localResponse.erro)}`;
      } else {
        localStatus = 'nao_encontrado';
      }
    } catch (err) {
      const localTiming = ((Date.now() - tLocal) / 1000).toFixed(2);
      log.info(`   [TIMING] Local falhou em ${localTiming}s`);
      mergedMeta.tempo_local = `${localTiming}s`;
      log.error(`Busca local falhou: ${translateError(err.message)}`);
      localStatus = `erro: ${translateError(err.message)}`;
    }

    if (globalSignal.aborted) {
      const isTimeout = Date.now() - inicio >= GLOBAL_TIMEOUT_MS;
      if (isTimeout) {
        log.warn('Busca interrompida (tempo limite excedido).');
        localStatus = 'erro: tempo limite excedido';
      } else {
        log.warn('Busca interrompida antes de concluir (cancelamento ou perda de conexão).');
        localStatus = 'cancelado';
      }
    }

    const duracao = ((Date.now() - inicio) / 1000).toFixed(2);
    log.destaque(`FALHA: Arquivo não encontrado em nenhuma fonte.`);
    log.section(`BUSCA FINALIZADA (${duracao}s)`);
    const cancelado = localStatus === 'cancelado';
    const nullResult = {
      arquivos: null,
      status: { s3: s3Status, local: localStatus, ...(cancelado ? { cancelado: true } : {}) },
      _meta: mergedMeta,
    };
    if (!cancelado)
      await cacheSet(cacheKey, { arquivos: null, status: nullResult.status, _meta: nullResult._meta }, NULL_CACHE_TTL);
    return nullResult;
  } finally {
    clearTimeout(globalTimer);
  }
}
