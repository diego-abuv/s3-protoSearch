import 'dotenv/config';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import https from 'https';
import dns from 'dns';
import path from 'path';

const dnsCache = new Map();
import { logger } from '../utils/logger.js';
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
      lookup: (hostname, options, callback) => {
        if (!hostname.includes('amazonaws.com')) {
          return dns.lookup(hostname, options, callback);
        }
        const cached = dnsCache.get(hostname);
        if (cached && Date.now() - cached.ts < 120000) {
          return callback(null, cached.ip, cached.family);
        }
        dns.resolve4(hostname, (err, addresses) => {
          if (err) return callback(err);
          dnsCache.set(hostname, { ip: addresses[0], ts: Date.now(), family: 4 });
          callback(null, addresses[0], 4);
        });
      },
    }),
  }),
});

const rawBucketName = process.env.AWS_BUCKET_NAME || '';
const bucketName = rawBucketName.replace(/s3:\/\/|\//g, '');

export function generatePrefixes(ano, mes, dia) {
  const m = Number(mes);
  const d = Number(dia);

  const m2 = String(m).padStart(2, '0');
  const d2 = String(d).padStart(2, '0');

  return [...new Set([`${ano}/${m}/${d}/`, `${ano}/${m}/${d2}/`, `${ano}/${m2}/${d2}/`, `${ano}/${m2}/${d}/`])];
}

async function fetchS3Listing(prefixo, signal) {
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
    const fetched = await fetchS3Listing(prefixo, signal);
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

export async function findFileAndGetSignedUrl(pasta, nomeProtocolo, log = logger) {
  const cacheKey = `s3:${pasta}:${nomeProtocolo}`;
  const cached = await cacheGet(cacheKey);
  if (cached) {
    log.info('Cache hit S3');
    return cached;
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
    return null;
  }

  log.info(`Gerando URLs para ${arquivosEncontrados.length} arquivos`);

  const resultados = arquivosEncontrados.map((obj) => {
    const nomeParaDownload = path.basename(obj.Key);
    return {
      downloadUrl: `/download-s3?key=${encodeURIComponent(obj.Key)}&nome=${encodeURIComponent(nomeParaDownload)}`,
      nomeParaDownload,
    };
  });

  await cacheSet(cacheKey, resultados, 600);

  log.section('Busca S3 finalizada');
  return resultados;
}
