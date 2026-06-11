import 'dotenv/config';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import https from 'https';
import path from 'path';
import { logger } from '../utils/logger.js';

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

function generatePrefixes(ano, mes, dia) {
  const m = Number(mes);
  const d = Number(dia);

  const m2 = String(m).padStart(2, '0');
  const d2 = String(d).padStart(2, '0');

  return [...new Set([`${ano}/${m}/${d}/`, `${ano}/${m}/${d2}/`, `${ano}/${m2}/${d2}/`, `${ano}/${m2}/${d}/`])];
}

export async function findFileAndGetSignedUrl(pasta, nomeProtocolo) {
  const [ano, mes, dia] = pasta.split('/');

  const prefixes = generatePrefixes(ano, mes, dia);

  const termoBuscado = path.parse(nomeProtocolo).name.toLowerCase();

  logger.section('Busca S3 iniciada');
  logger.info('Bucket:', bucketName);
  logger.info('Termo:', termoBuscado);
  logger.info('Prefixos:', prefixes);

  const arquivosEncontrados = [];

  for (const prefixoBusca of prefixes) {
    logger.info(`Testando prefixo: ${prefixoBusca}`);

    let continuationToken = undefined;
    let isTruncated = true;

    while (isTruncated) {
      const listCommand = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefixoBusca,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      });

      const listResponse = await s3Client.send(listCommand);

      if (listResponse.Contents) {
        const encontrados = listResponse.Contents.filter((obj) => {
          const nomeBase = path.parse(obj.Key).name.toLowerCase();
          return nomeBase.includes(termoBuscado);
        });

        if (encontrados.length > 0) {
          logger.success(`Encontrados ${encontrados.length} arquivo(s)`);
          arquivosEncontrados.push(...encontrados);
          break;
        }
      }

      isTruncated = !!listResponse.IsTruncated;
      continuationToken = listResponse.NextContinuationToken;

      if (isTruncated) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    if (arquivosEncontrados.length > 0) break;
  }

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

      const downloadUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });

      return {
        downloadUrl,
        nomeParaDownload,
      };
    }),
  );

  logger.section('Busca S3 finalizada');
  return resultados;
}
