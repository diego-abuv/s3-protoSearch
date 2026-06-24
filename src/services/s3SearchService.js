import 'dotenv/config';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import https from 'https';
import path from 'path';
import { logger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  requestHandler: new NodeHttpHandler({
    requestTimeout: 15_000,
    connectionTimeout: 5_000,
    httpsAgent: new https.Agent({
      keepAlive: true,
      maxSockets: 25,
      keepAliveMsecs: 30000,
    }),
  }),
});

const rawBucketName = process.env.AWS_BUCKET_NAME || '';
const bucketName = rawBucketName.replace(/s3:\/\/|\//g, '');

function generatePrefixes(ano, mes, dia) {
  const m = Number(mes);
  const d = Number(dia);

  const m2 = String(m).padStart(2, '0');
  const d2 = String(d).padStart(2, '0');

  return [...new Set([`${ano}/${m}/${d}/`, `${ano}/${m}/${d2}/`, `${ano}/${m2}/${d2}/`, `${ano}/${m2}/${d}/`])];
}

async function searchPrefix(prefixo, termoBuscado, signal) {
  if (signal?.aborted) return null;

  logger.info(`Testando prefixo: ${prefixo}`);

  let continuationToken = undefined;
  let isTruncated = true;

  while (isTruncated) {
    if (signal?.aborted) return null;

    const listCommand = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefixo,
      ContinuationToken: continuationToken,
      MaxKeys: 1000,
    });

    const listResponse = await withRetry(() => s3Client.send(listCommand), {
      label: `ListObjects ${prefixo}`,
      maxRetries: 2,
      baseDelay: 500,
    });

    if (listResponse.Contents) {
      const encontrados = listResponse.Contents.filter((obj) => {
        const nomeBase = path.parse(obj.Key).name.toLowerCase();
        return nomeBase.includes(termoBuscado);
      });

      if (encontrados.length > 0) {
        logger.success(`Encontrados ${encontrados.length} arquivo(s) em ${prefixo}`);
        return encontrados;
      }
    }

    isTruncated = !!listResponse.IsTruncated;
    continuationToken = listResponse.NextContinuationToken;
  }

  return null;
}

export async function findFileAndGetSignedUrl(pasta, nomeProtocolo) {
  const [ano, mes, dia] = pasta.split('/');

  const prefixes = generatePrefixes(ano, mes, dia);

  const termoBuscado = path.parse(nomeProtocolo).name.toLowerCase();

  logger.section('Busca S3 iniciada');
  logger.info('Bucket:', bucketName);
  logger.info('Termo:', termoBuscado);
  logger.info('Prefixos:', prefixes);

  logger.info('Buscando em todos os prefixos em paralelo...');

  const abortController = new AbortController();
  const { signal } = abortController;

  const resultadosPrefixo = await Promise.all(
    prefixes.map(async (p) => {
      const result = await searchPrefix(p, termoBuscado, signal);
      if (result) abortController.abort();
      return result;
    })
  );

  const arquivosEncontrados = resultadosPrefixo
    .filter((r) => r !== null)
    .flat();

  if (arquivosEncontrados.length === 0) {
    logger.info('Nenhum arquivo encontrado no S3.');
    return null;
  }

  logger.info(`Gerando URLs para ${arquivosEncontrados.length} arquivos`);

  const resultados = await Promise.all(
    arquivosEncontrados.map(async (obj) => {
      const nomeParaDownload = path.basename(obj.Key);

      const getCommand = new GetObjectCommand({
        Bucket: bucketName,
        Key: obj.Key,
        ResponseContentDisposition: `attachment; filename="${nomeParaDownload}"`,
      });

      const downloadUrl = await withRetry(() => getSignedUrl(s3Client, getCommand, { expiresIn: 3600 }), {
        label: 'getSignedUrl',
        maxRetries: 1,
        baseDelay: 200,
      });

      return {
        downloadUrl,
        nomeParaDownload,
      };
    }),
  );

  logger.section('Busca S3 finalizada');
  return resultados;
}
