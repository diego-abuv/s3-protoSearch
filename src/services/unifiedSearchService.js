// ----- orquestrador de busca unificada ----- //


// importa os dois serviços de busca dos dois locais
import { findFileAndGetSignedUrl as findInS3 } from './s3SearchService.js';
import { findFileAndGetSignedUrl as findLocally } from './localSearchService.js';


// ----- função principal de busca ----- //
export async function findFileAndGetSignedUrl(pasta, nomeProtocolo) {
    console.log('\n--- INICIANDO BUSCA UNIFICADA ---');

    // Etapa 1: Tentar buscar no S3 usando o s3SearchService.js
    console.log('1. Tentando busca no S3...');
    const s3Result = await findInS3(pasta, nomeProtocolo);

    if (s3Result) {
        console.log('-> SUCESSO: Arquivo(os) encontrado(os) no S3. Retornando resultado.');
        return s3Result;
    }

    // Etapa 2: Fallback para a busca local, já que não foi encontrado no S3
    // usa o localSearchService.js
    console.log('2. Arquivo(os) não encontrado(os) no S3. Tentando busca local (fallback)...');
    const localResult = await findLocally(pasta, nomeProtocolo);

    if (localResult) {
        console.log('-> SUCESSO: Arquivo(os) encontrado(os) localmente. Retornando resultado.');
        return localResult;
    }

    // Nenhum dos dois serviços encontrou o arquivo
    console.log('-> FALHA: Arquivo(os) não encontrado(os) no S3 nem localmente.');
    console.log('--- BUSCA FINALIZADA ---');
    return null;
}