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

    // Define o termo de busca uma vez fora do loop para otimização
    const termoBuscado = path.parse(nomeProtocolo).name.toLowerCase();

    // -------- Paginação para coletar TODOS os arquivos correspondentes -------- //
    let isTruncated = true; // Indica se há mais páginas para buscar
    let continuationToken; // Token para a próxima página
    // Array para acumular todos os arquivos encontrados em todas as páginas.
    const todosOsArquivosEncontrados = [];

    // O loop continua enquanto houver mais páginas de resultados a serem buscadas.
    while (isTruncated ) {
        const listCommand = new ListObjectsV2Command({
            Bucket: bucketName,
            Prefix: prefixoBusca,
            ContinuationToken: continuationToken,
        });
        
        // Executa o comando de listagem no S3
        const listResponse = await s3Client.send(listCommand);
        
        // condição que verifica se há objetos na resposta e faz a busca
        if (listResponse.Contents) {
            console.log(`- Verificando ${listResponse.Contents.length} objetos nesta página...`);
            
            // ---- Filtra todos os arquivos na página atual que correspondem ao termo buscado. ---- //
            const encontradosNestaPagina = listResponse.Contents.filter(obj => {
                const nomeBaseNaChave = path.parse(obj.Key).name.toLowerCase(); // extrai o nome base do arquivo
                return nomeBaseNaChave.includes(termoBuscado); // compara o nome do arquivo e compara com o termo buscado
            });

            // Se encontramos arquivos, adicionamos ao nosso array acumulador.
            if (encontradosNestaPagina.length > 0) {
                console.log(`- Encontrados ${encontradosNestaPagina.length} arquivo(s) correspondente(s) nesta página.`);
                todosOsArquivosEncontrados.push(...encontradosNestaPagina);
                // Interrompe o loop while, pois já encontramos o que precisávamos.
                break;
            }
        }
        
        // Prepara para a próxima iteração, se houver mais páginas.
        isTruncated = !!listResponse.IsTruncated;
        if (isTruncated) {
            continuationToken = listResponse.NextContinuationToken;
            console.log('- Buscando próxima página de resultados...');
        }
    }

    // -------- Gerar URLs assinadas para todos os arquivos encontrados ------ //
    if (todosOsArquivosEncontrados.length > 0) {
        console.log(`\nGerando URLs de download para ${todosOsArquivosEncontrados.length} arquivo(s) encontrado(s)...`);

        // Mapeia cada arquivo encontrado para uma promessa que gera a URL assinada e armazena o nome para download
        const resultados = todosOsArquivosEncontrados.map(obj => {
            const nomeParaDownload = path.basename(obj.Key);
            const getCommand = new GetObjectCommand({
                Bucket: bucketName,
                Key: obj.Key,
                ResponseContentDisposition: `attachment; filename="${nomeParaDownload}"` // Força o download
            });

            return getSignedUrl(s3Client, getCommand, { expiresIn: 3600 }).then(downloadUrl => ({
                downloadUrl,
                nomeParaDownload
            }));
        });

        console.log(`--- Busca no S3 finalizada com sucesso ---\n`);
        // Espera todas as promessas de URL serem resolvidas e retorna o array de resultados.
        return Promise.all(resultados);
    }

    // -------- Caso o arquivo não tenha sido encontrado ------- //
    console.error(`ERRO: Nenhum arquivo correspondente encontrado.`);
    console.log(`--- Busca no S3 finalizada com erro ---\n`);
    return null;
}