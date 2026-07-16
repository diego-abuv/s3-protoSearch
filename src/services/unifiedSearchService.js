import path from 'path';
import { findFileAndGetSignedUrl as findInS3 } from './s3SearchService.js';
import { findFileAndGetSignedUrl as findLocally } from './localSearchService.js';
import { translateError } from '../utils/errorCodes.js';
import { logger } from '../utils/logger.js';
import { queryIndex } from '../db/indexDb.js';
import { cacheGet, cacheSet } from '../utils/cache.js';

export async function findFileAndGetSignedUrl(pasta, nomeProtocolo, log = logger) {
  const cacheKey = `busca:${pasta}:${nomeProtocolo}`;
  const cached = await cacheGet(cacheKey);
  if (cached) {
    log.info('Cache hit busca unificada');
    return cached;
  }

  const inicio = Date.now();

  log.section('INICIANDO BUSCA UNIFICADA');

  let s3Status;
  let localStatus = 'nao_consultado';

  log.info('1. Tentando busca no S3...');
  const tS3 = Date.now();
  try {
    const s3Result = await findInS3(pasta, nomeProtocolo, log);
    log.info(`   [TIMING] S3 retornou em ${((Date.now() - tS3) / 1000).toFixed(2)}s`);
    if (s3Result) {
      log.success('Arquivo(os) encontrado(os) no S3.');
      log.section(`BUSCA FINALIZADA (${((Date.now() - inicio) / 1000).toFixed(2)}s)`);
      const s3ResultObj = { arquivos: s3Result, status: { s3: 'ok', local: localStatus } };
      await cacheSet(cacheKey, s3ResultObj, 300);
      return s3ResultObj;
    }
    log.info('S3: Nenhum arquivo encontrado.');
    s3Status = 'nao_encontrado';
  } catch (err) {
    log.error(`S3 indisponível ou falha de conexão: ${translateError(err.message)}`);
    log.info(`   [TIMING] S3 falhou em ${((Date.now() - tS3) / 1000).toFixed(2)}s`);
    s3Status = `erro: ${translateError(err.message)}`;
  }

  // Tenta o índice local antes do scan completo no filesystem
  const termoBuscado = path.parse(nomeProtocolo).name.toLowerCase();
  try {
    const protocolPrefix = String(parseInt((termoBuscado.match(/^\d+/) || [termoBuscado])[0], 10));
    const idxResults = queryIndex(`SELECT file_path, file_name FROM file_index WHERE protocol_number LIKE ? || '%'`, [
      protocolPrefix,
    ]);

    if (idxResults && idxResults.length > 0) {
      log.success(`Arquivo(s) encontrado(s) no índice local (${idxResults.length}).`);
      const arquivos = idxResults.map((r) => ({
        downloadUrl: `/download-local?file=${encodeURIComponent(r.file_path)}`,
        nomeParaDownload: path.basename(r.file_name),
      }));
      log.section(`BUSCA FINALIZADA (${((Date.now() - inicio) / 1000).toFixed(2)}s)`);
      const idxResult = { arquivos, status: { s3: s3Status, local: 'indexado' } };
      await cacheSet(cacheKey, idxResult, 300);
      return idxResult;
    }
    log.info('Índice local: Nenhum arquivo encontrado.');
  } catch (idxErr) {
    log.warn(`Índice local indisponível, seguindo para fallback: ${translateError(idxErr.message)}`);
  }

  // Fallback: busca por substring no nome do arquivo
  try {
    const likeResults = queryIndex(`SELECT file_path, file_name FROM file_index WHERE file_name LIKE ? LIMIT 20`, [
      `%${termoBuscado}%`,
    ]);
    if (likeResults && likeResults.length > 0) {
      log.success(`Arquivo(s) encontrado(s) no índice local por substring (${likeResults.length}).`);
      const arquivos = likeResults.map((r) => ({
        downloadUrl: `/download-local?file=${encodeURIComponent(r.file_path)}`,
        nomeParaDownload: path.basename(r.file_name),
      }));
      log.section(`BUSCA FINALIZADA (${((Date.now() - inicio) / 1000).toFixed(2)}s)`);
      const likeResult = { arquivos, status: { s3: s3Status, local: 'indexado' } };
      await cacheSet(cacheKey, likeResult, 300);
      return likeResult;
    }
    log.info('Índice local: Nenhum arquivo encontrado por substring.');
  } catch (likeErr) {
    log.warn(`Busca por substring indisponível: ${translateError(likeErr.message)}`);
  }

  log.info('2. Tentando busca local (fallback)...');
  try {
    const localResult = await findLocally(pasta, nomeProtocolo, log);

    if (Array.isArray(localResult)) {
      if (localResult.length > 0) {
        log.success(`Arquivo(os) encontrado(os) localmente (${localResult.length}).`);
        log.section(`BUSCA FINALIZADA (${((Date.now() - inicio) / 1000).toFixed(2)}s)`);
        const localResultObj = { arquivos: localResult, status: { s3: s3Status, local: 'ok' } };
        await cacheSet(cacheKey, localResultObj, 300);
        return localResultObj;
      }
      log.info('Local: Nenhum arquivo encontrado.');
      localStatus = 'nao_encontrado';
    } else if (localResult && localResult.erro) {
      log.error(`Busca local impossibilitada: ${translateError(localResult.erro)}`);
      localStatus = `erro: ${translateError(localResult.erro)}`;
    }
  } catch (err) {
    log.error(`Busca local falhou: ${translateError(err.message)}`);
    localStatus = `erro: ${translateError(err.message)}`;
  }

  const duracao = ((Date.now() - inicio) / 1000).toFixed(2);
  log.destaque(`FALHA: Arquivo não encontrado em nenhuma fonte.`);
  log.section(`BUSCA FINALIZADA (${duracao}s)`);
  const nullResult = { arquivos: null, status: { s3: s3Status, local: localStatus } };
  await cacheSet(cacheKey, nullResult, 300);
  return nullResult;
}
