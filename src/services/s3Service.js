import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import path from 'path';
import 'dotenv/config';

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

// Garante que o nome do bucket não contenha prefixos ou barras extras.
const rawBucketName = process.env.AWS_BUCKET_NAME || '';
const bucketName = rawBucketName.replace(/s3:\/\/|\//g, '');


export async function findFileAndGetSignedUrl(pasta, nomeProtocolo) {
    // O serviço recebe a pasta como 'YYYY/MM/DD'.
    // Para o S3, formatamos para 'YYYY/M/D' (sem zeros à esquerda no mês e dia).
    const [ano, mes, dia] = pasta.split('/');
    const mesSemZero = parseInt(mes, 10).toString();
    const diaSemZero = parseInt(dia, 10).toString();
    const prefixoBusca = `${ano}/${mesSemZero}/${diaSemZero}`;

    console.log(`\n--- Iniciando busca no S3 ---`);
    console.log(`- Bucket: ${bucketName}`);
    console.log(`- Prefixo (pasta): ${prefixoBusca}`);
    console.log(`- Termo de busca (nome do arquivo): ${nomeProtocolo}`);

    let isTruncated = true;
    let continuationToken;
    let arquivoEncontrado = null;

    // Loop otimizado para paginação. Ele para assim que o arquivo é encontrado.
    while (isTruncated) {
        const listCommand = new ListObjectsV2Command({
            Bucket: bucketName,
            Prefix: prefixoBusca,
            ContinuationToken: continuationToken,
        });
        
        const listResponse = await s3Client.send(listCommand);
        
        if (listResponse.Contents) {
            console.log(`- Verificando ${listResponse.Contents.length} objetos nesta página...`);
            
            // Tenta encontrar o arquivo no lote atual de objetos
            const encontradoNaPagina = listResponse.Contents.find(obj => {
                const nomeBaseNaChave = path.parse(obj.Key).name.toLowerCase();
                const termoBuscado = path.parse(nomeProtocolo).name.toLowerCase();
                return nomeBaseNaChave.includes(termoBuscado);
            });

            if (encontradoNaPagina) {
                console.log(`- Arquivo correspondente encontrado: ${encontradoNaPagina.Key}`);
                arquivoEncontrado = encontradoNaPagina;
                break; // Sai do loop while, pois já encontramos o que queríamos.
            }
        }

        // Prepara para a próxima iteração, se houver mais páginas
        isTruncated = !!listResponse.IsTruncated;
        if (isTruncated) {
            continuationToken = listResponse.NextContinuationToken;
            console.log('- Arquivo não encontrado nesta página, buscando próxima...');
        }
    }

    if (arquivoEncontrado) {
        const nomeParaDownload = path.basename(arquivoEncontrado.Key);

        // Adiciona ResponseContentDisposition para forçar o download no navegador
        const getCommand = new GetObjectCommand({
            Bucket: bucketName,
            Key: arquivoEncontrado.Key,
            ResponseContentDisposition: `attachment; filename="${nomeParaDownload}"`,
        });
        const downloadUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });

        console.log(`--- Busca no S3 finalizada com sucesso ---\n`);
        return { downloadUrl, nomeParaDownload };
    }

    console.error(`ERRO: Nenhum arquivo correspondente encontrado.`);
    console.log(`--- Busca no S3 finalizada com erro ---\n`);
    return null;
}