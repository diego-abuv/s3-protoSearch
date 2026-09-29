import 'dotenv/config';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import https from 'https';
import path from 'path';
import { systemLog } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
import { cacheGet, cacheSet } from '../utils/cache.js';

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  requestHandler: new NodeHttpHandler({
    httpsAgent: new https.Agent({
      keepAlive: true,
      maxSockets: 25,
      keepAliveMsecs: 30000,
    }),
  }),
});

const rawBucketName = process.env.AWS_BUCKET_NAME || '';
const bucketName = rawBucketName.replace(/s3:\/\/|\//g, '');

// Raízes candidatas do bucket, testadas em paralelo — cobre migrações de estrutura (ex: "audio/")
// que começaram no meio do ano, quando o mesmo ano tem arquivos na raiz e na subpasta nova.
function getBucketRootPrefixes() {
  const raw = process.env.AWS_PREFIX_ROOTS;
  if (raw === undefined) return [''];

  const roots = raw.split(',').map(normalizeRootPrefix);
  return roots.length > 0 ? [...new Set(roots)] : [''];
}

function normalizeRootPrefix(prefix) {
  const trimmed = (prefix || '').trim().replace(/^\/+|\/+$/g, '');
  return trimmed ? `${trimmed}/` : '';
}

export function generatePrefixes(ano, mes, dia) {
  const m = Number(mes);
  const d = Number(dia);

  const m2 = String(m).padStart(2, '0');
  const d2 = String(d).padStart(2, '0');

  const raizes = getBucketRootPrefixes();
  const datas = [`${ano}/${m}/${d}/`, `${ano}/${m}/${d2}/`, `${ano}/${m2}/${d2}/`, `${ano}/${m2}/${d}/`];

  const prefixos = raizes.flatMap((raiz) => datas.map((data) => `${raiz}${data}`));
  return [...new Set(prefixos)];
}

async function fetchS3Listing(prefixo, signal, log) {
  let allContents = [];
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
      maxRetries: 4,
      baseDelay: 2000,
      log,
    });

    if (listResponse.Contents) {
      allContents.push(...listResponse.Contents);
    }

    isTruncated = !!listResponse.IsTruncated;
    continuationToken = listResponse.NextContinuationToken;
  }

  return allContents;
}

async function searchPrefix(prefixo, termoBuscado, signal, log) {
  if (signal?.aborted) return null;

  log.info(`Testando prefixo: ${prefixo}`);

  const cacheKey = `s3-list:${prefixo}`;
  const cachedListing = await cacheGet(cacheKey);

  let contents;

  if (cachedListing) {
    log.info(`Cache hit: lista S3 para ${prefixo}`);
    contents = cachedListing;
  } else {
    const fetched = await fetchS3Listing(prefixo, signal, log);
    if (!fetched) return null;
    await cacheSet(cacheKey, fetched, 300);
    contents = fetched;
  }

  const encontrados = contents.filter((obj) => {
    const nomeBase = path.parse(obj.Key).name.toLowerCase();
    return nomeBase.includes(termoBuscado);
  });

  if (encontrados.length > 0) {
    log.success(`Encontrados ${encontrados.length} arquivo(s) em ${prefixo}`);
    return encontrados;
  }

  return null;
}

export async function findFileAndGetSignedUrl(pasta, nomeProtocolo, log = systemLog) {
  const cacheKey = `s3:${pasta}:${nomeProtocolo}`;
  const cached = await cacheGet(cacheKey);
  if (cached) {
    log.info('Cache hit S3');
    if (Array.isArray(cached)) {
      return { arquivos: cached, _meta: { bucket: bucketName, prefixes: [], cache: true } };
    }
    return { arquivos: cached.arquivos, _meta: { bucket: bucketName, prefixes: cached.prefixes || [], cache: true } };
  }

  const [ano, mes, dia] = pasta.split('/');

  const prefixes = generatePrefixes(ano, mes, dia);

  const termoBuscado = path.parse(nomeProtocolo).name.toLowerCase();

  log.section('Busca S3 iniciada');
  log.info('Bucket:', bucketName);
  log.info('Termo:', termoBuscado);
  log.info('Prefixos:', prefixes);

  const abortController = new AbortController();
  const { signal } = abortController;

  log.info('Buscando com ListObjectsV2...');

  const resultadosPrefixo = await Promise.all(
    prefixes.map(async (p) => {
      const result = await searchPrefix(p, termoBuscado, signal, log);
      if (result) abortController.abort();
      return result;
    }),
  );

  const arquivosEncontrados = resultadosPrefixo.filter((r) => r !== null).flat();

  if (arquivosEncontrados.length === 0) {
    log.info('Nenhum arquivo encontrado no S3.');
    return { arquivos: null, _meta: { bucket: bucketName, prefixes, cache: false } };
  }

  log.info(`Gerando URLs para ${arquivosEncontrados.length} arquivos`);

  const resultados = arquivosEncontrados.map((obj) => {
    const nomeParaDownload = path.basename(obj.Key);
    return {
      downloadUrl: `/download-s3?key=${encodeURIComponent(obj.Key)}&nome=${encodeURIComponent(nomeParaDownload)}`,
      nomeParaDownload,
    };
  });

  await cacheSet(cacheKey, { arquivos: resultados, prefixes }, 600);

  log.section('Busca S3 finalizada');
  return { arquivos: resultados, _meta: { bucket: bucketName, prefixes, cache: false } };
}
