import fs from 'fs';
import path from 'path';
import 'dotenv/config';

function listFilesInDirectory(dirPath, baseDir) {
    const files = [];
    const items = fs.readdirSync(dirPath);

    for (const item of items) {
        const fullPath = path.join(dirPath, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            files.push(...listFilesInDirectory(fullPath, baseDir));
        } else {
            files.push(fullPath);
        }
    }
    return files;
}

export async function findFileAndGetSignedUrl(pasta, nomeProtocolo) {
    console.log('\n--- Início da requisição de busca (MOCK) ---');
    console.log(`- Data do Protocolo (pasta): ${pasta}`);
    console.log(`- Nome do Arquivo (nomeProtocolo): ${nomeProtocolo}`);

    const bucketPath = process.env.LOCAL_FILE_PATH;

    if (!bucketPath || !fs.existsSync(bucketPath)) {
        console.error(`O caminho LOCAL_FILE_PATH="${bucketPath}" não existe ou não foi configurado no .env`);
        return null;
    }

    const prefixoDaBusca = pasta.replace(/-/g, '/');
    const prefixPath = prefixoDaBusca.replace(/\//g, path.sep);
    const fullPath = path.join(bucketPath, prefixPath);

    console.log(`Prefixo de busca construído: ${prefixoDaBusca}`);

    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
        const allFiles = listFilesInDirectory(fullPath, bucketPath);

        const contents = allFiles.map(filePath => {
            const relativePath = path.relative(bucketPath, filePath);
            const s3Key = relativePath.replace(/\\/g, '/');
            return { Key: s3Key };
        });

        console.log(`Conteúdo encontrado para o prefixo:`, contents);

        const nomeProtocoloBase = path.parse(nomeProtocolo).name;

        const arquivoEncontrado = contents.find(obj => {
            const nomeDoArquivoNaChave = path.basename(obj.Key);
            const nomeBaseDoArquivoNaChave = path.parse(nomeDoArquivoNaChave).name;
            return nomeBaseDoArquivoNaChave === nomeProtocoloBase;
        });

        console.log(`Procurando por um arquivo com o nome base: "${nomeProtocoloBase}"`);

        if (arquivoEncontrado) {
            console.log(`Arquivo encontrado! Chave completa: ${arquivoEncontrado.Key}`);
            const nomeParaDownload = path.basename(arquivoEncontrado.Key);
            const downloadUrl = `/local-files/${arquivoEncontrado.Key}`;

            console.log(`URL de download gerada: ${downloadUrl}`);
            console.log('--- Requisição finalizada com sucesso ---\n');

            return { downloadUrl, nomeParaDownload };
        }
    }

    console.error('ERRO: Nenhum arquivo correspondente encontrado na lista.');
    console.log('--- Requisição finalizada com erro ---\n');
    return null;
}