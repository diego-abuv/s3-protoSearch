import 'dotenv/config';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import path from 'path';

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const rawBucketName = process.env.AWS_BUCKET_NAME || '';
const bucketName = rawBucketName.replace(/s3:\/\/|\//g, '');

function generatePrefixes(ano, mes, dia) {
  const m = Number(mes);
  const d = Number(dia);

  const m2 = String(m).padStart(2, '0');
  const d2 = String(d).padStart(2, '0');

  return [`${ano}/${m}/${d}/`, `${ano}/${m}/${d2}/`, `${ano}/${m2}/${d2}/`, `${ano}/${m2}/${d}/`];
}

export async function findFileAndGetSignedUrl(pasta, nomeProtocolo) {
  const [ano, mes, dia] = pasta.split('/');

  const prefixes = generatePrefixes(ano, mes, dia);

  const termoBuscado = path.parse(nomeProtocolo).name.toLowerCase();

  console.log('\n--- Busca S3 iniciada ---');
  console.log('Bucket:', bucketName);
  console.log('Termo:', termoBuscado);
  console.log('Prefixos:', prefixes);

  const arquivosEncontrados = [];

  for (const prefixoBusca of prefixes) {
    console.log(`Testando prefixo: ${prefixoBusca}`);

    let continuationToken = undefined;
    let isTruncated = true;

    while (isTruncated) {
      const listCommand = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefixoBusca,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      });

      let listResponse;
      try {
        listResponse = await s3Client.send(listCommand);
      } catch (err) {
        console.error(`[ERRO] Falha ao listar objetos no prefixo "${prefixoBusca}": ${err.message}`);
        throw err;
      }

      if (listResponse.Contents) {
        const encontrados = listResponse.Contents.filter((obj) => {
          const nomeBase = path.parse(obj.Key).name.toLowerCase();
          return nomeBase.includes(termoBuscado);
        });

        if (encontrados.length > 0) {
          console.log(`Encontrados ${encontrados.length} arquivo(s)`);
          arquivosEncontrados.push(...encontrados);
          break;
        }
      }

      isTruncated = !!listResponse.IsTruncated;
      continuationToken = listResponse.NextContinuationToken;
    }

    if (arquivosEncontrados.length > 0) break;
  }

  if (arquivosEncontrados.length === 0) {
    console.log('Nenhum arquivo encontrado no S3.');
    return null;
  }

  console.log(`Gerando URLs para ${arquivosEncontrados.length} arquivos`);

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

  console.log('--- Busca S3 finalizada ---\n');
  return resultados;
}
