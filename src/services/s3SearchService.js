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

// ---------- estruturando nome do bucket ---------- //
const rawBucketName = process.env.AWS_BUCKET_NAME || ''; // extrai nome do bucket do .env, pode ser no formato "s3://meu-bucket" ou "meu-bucket"
const bucketName = rawBucketName.replace(/s3:\/\/|\//g, ''); // remove "s3://" e quaisquer barras, deixando apenas o nome limpo do bucket


// ---------- gera variações de prefixo ---------- //

function generatePrefixes(ano, mes, dia) {

    const m = Number(mes); 
    const d = Number(dia);

    const m2 = String(m).padStart(2, '0'); // caso tenha um mês com zero à esquerda, garante que a versão sem zero também seja testada
    const d2 = String(d).padStart(2, '0'); // mesma lógica para o dia
    
    return [
      `${ano}/${m}/${d}/`,
      `${ano}/${m}/${d2}/`,
      `${ano}/${m2}/${d2}/`,
      `${ano}/${m2}/${d}/`
    ];
}


// ---------- busca no s3 ---------- //

// Função principal que busca o arquivo no S3 e retorna URLs de download assinadas
export async function findFileAndGetSignedUrl(pasta, nomeProtocolo) {

    const [ano, mes, dia] = pasta.split('/'); // extrai ano, mês e dia da pasta para gerar os prefixos de busca (informado pelo frontend)

    const prefixes = generatePrefixes(ano, mes, dia); // armazena as variações de prefixo a serem testadas no S3

    const termoBuscado = path.parse(nomeProtocolo).name.toLowerCase(); // extrai o nome base do protocolo (sem extensão) e converte para minúsculas para comparação mais flexível

    console.log("\n--- Busca S3 iniciada ---");
    console.log("Bucket:", bucketName);
    console.log("Termo:", termoBuscado);
    console.log("Prefixos:", prefixes);

    const arquivosEncontrados = [];

    for (const prefixoBusca of prefixes) {

        console.log(`Testando prefixo: ${prefixoBusca}`);

        // Variáveis para controle de paginação (1000 objetos por página)
        let continuationToken = undefined;
        let isTruncated = true;

        // enquanto houver mais páginas de resultados, continua buscando
        while (isTruncated) {

            // utiliza listObjectsV2
            const listCommand = new ListObjectsV2Command({
                Bucket: bucketName,
                Prefix: prefixoBusca,
                ContinuationToken: continuationToken, // token para próxima página, começa com undefined para a primeira página
                MaxKeys: 1000 // limite máximo de objetos por página
            });

            // executa a busca e armazena a resposta em listResponse
            const listResponse = await s3Client.send(listCommand);

            if (listResponse.Contents) {
                 // armazen os objetos encontrados na página atual (obtida por meio da listResponse)
                const encontrados = listResponse.Contents.filter(obj => { // filtra os objetos retornados para armazenar somente os que correspondem ao termo buscado
                    // extrai o nome base do objeto (sem extensão) e converte para minúsculas para comparação
                    const nomeBase = path.parse(obj.Key).name.toLowerCase();
                    // compara se o nome do objeto inclui o termo buscado retornando true ou false no filter 
                    return nomeBase.includes(termoBuscado);

                });

                // se algum objeto correspondente for encontrado, armazena no array arquivosEncontrados e interrompe a busca por outros prefixos
                if (encontrados.length > 0) {

                    console.log(`Encontrados ${encontrados.length} arquivo(s)`);

                    arquivosEncontrados.push(...encontrados);

                    break;
                }

            }

            // define o valor de isTruncated para controlar o loop de paginação = true se houver mais páginas, false se for a última página
            isTruncated = !!listResponse.IsTruncated;
            continuationToken = listResponse.NextContinuationToken; // atualiza o token para a próxima página, se houver mais resultados
        }
        // se encontrar ao menos um arquivo, interrompe a busca por outros prefixos, assumindo que o(os) arquivo(s) estão na pagina atual
        if (arquivosEncontrados.length > 0) break;

    }

    // se nenhum arquivo for encontrado após testar todos os prefixos, retorna null
    if (arquivosEncontrados.length === 0) {

        console.log("Nenhum arquivo encontrado.");
        return null;

    }

    // se arquivos forem encontrados, gera URLs de download assinadas para cada um deles
    console.log(`Gerando URLs para ${arquivosEncontrados.length} arquivos`);

    // a promise.all é utilizada para processar todas as requisições de geração de URL de forma concorrente, melhorando a performance quando há múltiplos arquivos encontrados 
    const resultados = await Promise.all(
    
        arquivosEncontrados.map(async (obj) => {

            const nomeParaDownload = path.basename(obj.Key);

            // o getCommand é configurado para obter o objeto específico do S3, incluindo um header para sugerir o nome do arquivo no download
            const getCommand = new GetObjectCommand({
                Bucket: bucketName,
                Key: obj.Key,
                ResponseContentDisposition: `attachment; filename="${nomeParaDownload}"`
            });

            // configuração da url de download
            const downloadUrl = await getSignedUrl(
                s3Client,
                getCommand,
                { expiresIn: 3600 }
            );

            // retorna o objeto contendo a URL de download e o nome do arquivo para download, que será utilizado pelo frontend para iniciar o download do arquivo encontrado no S3
            return {
                downloadUrl,
                nomeParaDownload
            };

        })

    );

    console.log("--- Busca finalizada ---\n");

    // retorna todo o array de obj que passaram pela promise e mapeamento
    return resultados;

}