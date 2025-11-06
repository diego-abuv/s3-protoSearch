import 'dotenv/config';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import path from 'path';

// ----------aws s3 client setup---------- //
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

// Validação para nome do bucket correto (rota do arquivo sem prefixos ou barras extras)
const rawBucketName = process.env.AWS_BUCKET_NAME || '';
const bucketName = rawBucketName.replace(/s3:\/\/|\//g, '');

// ----------funções de busca no s3---------- //

// Busca um arquivo no S3 e retorna uma URL assinada para download
export async function findFileAndGetSignedUrl(pasta, nomeProtocolo) {
    // O serviço recebe a pasta como 'YYYY/MM/DD' do frontend.
    // Para o S3, formatamos para 'YYYY/M/D' (sem zeros à esquerda no mês e dia).
    const [ano, mes, dia] = pasta.split('/');
    const mesSemZero = parseInt(mes, 10).toString();
    const diaSemZero = parseInt(dia, 10).toString();
    const prefixoBusca = `${ano}/${mesSemZero}/${diaSemZero}`;

    console.log(`\n--- Iniciando busca no S3 ---`);
    console.log(`- Bucket: ${bucketName}`);
    console.log(`- Prefixo (pasta): ${prefixoBusca}`);
    console.log(`- Termo de busca (nome do arquivo): ${nomeProtocolo}`);

    // -------- Paginação otimizada para busca do arquivo -------- //

    // isTruncated indica que há mais de uma página de resultados
    let isTruncated = true;
    // continuationToken armazena o token para a próxima página
    let continuationToken;
    // variavel para armazenar o arquivo quando for encontrado
    let arquivoEncontrado = null;

    // enquanto houver páginas e o arquivo não for encontrado, continua buscando.
    while (isTruncated) {
        // inicia objeto de listagem com os parâmetros necessários
        // (nome do bucket, prefixo e token de continuação se houver)
        const listCommand = new ListObjectsV2Command({
            Bucket: bucketName,
            Prefix: prefixoBusca,
            ContinuationToken: continuationToken,
        });
        
        // inicia a lista de objetos (página atual) e armazena na variável
        const listResponse = await s3Client.send(listCommand);
        
        // se houver itens na pagina recebida, processa e tenta encontrar o arquivo
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

        // Atualiza isTruncated e continuationToken para a próxima iteração caso não tenha encontrado o arquivo
        isTruncated = !!listResponse.IsTruncated;
        if (isTruncated) {
            continuationToken = listResponse.NextContinuationToken;
            console.log('- Arquivo não encontrado nesta página, buscando próxima...');
        }
    }

    // -------- Gerar URL assinada se o arquivo foi encontrado ------ //
    if (arquivoEncontrado) {
        const nomeParaDownload = path.basename(arquivoEncontrado.Key);
        const getCommand = new GetObjectCommand({
            Bucket: bucketName,
            Key: arquivoEncontrado.Key,
            ResponseContentDisposition: `attachment; filename="${nomeParaDownload}"`
        });
        
        // Gera a URL assinada com validade de 1 hora (3600 segundos)
        const downloadUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });

        console.log(`--- Busca no S3 finalizada com sucesso ---\n`);
        return { downloadUrl, nomeParaDownload };
    }


    // -------- Caso o arquivo não tenha sido encontrado ------- //
    console.error(`ERRO: Nenhum arquivo correspondente encontrado.`);
    console.log(`--- Busca no S3 finalizada com erro ---\n`);
    return null;
}