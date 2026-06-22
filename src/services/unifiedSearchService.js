import { findFileAndGetSignedUrl as findInS3 } from './s3SearchService.js';
import { findFileAndGetSignedUrl as findLocally } from './localSearchService.js';
import { translateError } from '../utils/errorCodes.js';
import { logger } from '../utils/logger.js';

export async function findFileAndGetSignedUrl(pasta, nomeProtocolo) {
  const inicio = Date.now();

  logger.section('INICIANDO BUSCA UNIFICADA');

  let s3Status;
  let localStatus = 'nao_consultado';

  logger.info('1. Tentando busca no S3...');
  try {
    const s3Result = await findInS3(pasta, nomeProtocolo);
    if (s3Result) {
      logger.success('Arquivo(os) encontrado(os) no S3.');
      logger.section(`BUSCA FINALIZADA (${((Date.now() - inicio) / 1000).toFixed(2)}s)`);
      return { arquivos: s3Result, status: { s3: 'ok', local: localStatus } };
    }
    logger.info('S3: Nenhum arquivo encontrado.');
    s3Status = 'nao_encontrado';
  } catch (err) {
    logger.error(`S3 indisponível ou falha de conexão: ${translateError(err.message)}`);
    s3Status = `erro: ${translateError(err.message)}`;
  }

  logger.info('2. Tentando busca local (fallback)...');
  try {
    const localResult = await findLocally(pasta, nomeProtocolo);

    if (Array.isArray(localResult)) {
      logger.success('Arquivo(os) encontrado(os) localmente.');
      logger.section(`BUSCA FINALIZADA (${((Date.now() - inicio) / 1000).toFixed(2)}s)`);
      return { arquivos: localResult, status: { s3: s3Status, local: 'ok' } };
    }

    if (localResult && localResult.erro) {
      logger.error(`Busca local impossibilitada: ${translateError(localResult.erro)}`);
      localStatus = `erro: ${translateError(localResult.erro)}`;
    } else {
      logger.info('Local: Nenhum arquivo encontrado.');
      localStatus = 'nao_encontrado';
    }
  } catch (err) {
    logger.error(`Busca local falhou: ${translateError(err.message)}`);
    localStatus = `erro: ${translateError(err.message)}`;
  }

  const duracao = ((Date.now() - inicio) / 1000).toFixed(2);
  logger.destaque(`FALHA: Arquivo não encontrado em nenhuma fonte.`);
  logger.section(`BUSCA FINALIZADA (${duracao}s)`);
  return { arquivos: null, status: { s3: s3Status, local: localStatus } };
}
