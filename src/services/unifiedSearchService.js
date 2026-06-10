import { findFileAndGetSignedUrl as findInS3 } from './s3SearchService.js';
import { findFileAndGetSignedUrl as findLocally } from './localSearchService.js';

export async function findFileAndGetSignedUrl(pasta, nomeProtocolo) {
  console.log('\n--- INICIANDO BUSCA UNIFICADA ---');

  let s3Status;
  let localStatus = 'nao_consultado';

  console.log('1. Tentando busca no S3...');
  try {
    const s3Result = await findInS3(pasta, nomeProtocolo);
    if (s3Result) {
      console.log('-> SUCESSO: Arquivo(os) encontrado(os) no S3.');
      return { arquivos: s3Result, status: { s3: 'ok', local: localStatus } };
    }
    console.log('-> S3: Nenhum arquivo encontrado.');
    s3Status = 'nao_encontrado';
  } catch (err) {
    console.error('-> [ERRO] S3 indisponível ou falha de conexão:', err.message);
    s3Status = `erro: ${err.message}`;
  }

  console.log('2. Tentando busca local (fallback)...');
  try {
    const localResult = await findLocally(pasta, nomeProtocolo);

    if (Array.isArray(localResult)) {
      console.log('-> SUCESSO: Arquivo(os) encontrado(os) localmente.');
      return { arquivos: localResult, status: { s3: s3Status, local: 'ok' } };
    }

    if (localResult && localResult.erro) {
      console.error('-> [ERRO] Busca local impossibilitada:', localResult.erro);
      localStatus = `erro: ${localResult.erro}`;
    } else {
      console.log('-> Local: Nenhum arquivo encontrado.');
      localStatus = 'nao_encontrado';
    }
  } catch (err) {
    console.error('-> [ERRO] Busca local falhou:', err.message);
    localStatus = `erro: ${err.message}`;
  }

  console.log('-> FALHA: Arquivo não encontrado em nenhuma fonte.');
  console.log('--- BUSCA FINALIZADA ---');
  return { arquivos: null, status: { s3: s3Status, local: localStatus } };
}
