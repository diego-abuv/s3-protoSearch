import fs from 'fs';
import path from 'path';
import 'dotenv/config';

/**
 * Lê as variáveis de ambiente (PATH_xxx, YEARS_xxx) e retorna uma lista de configurações de busca
 * para o ano fornecido.
 * @param {number} anoBusca - O ano da data que está sendo pesquisada.
 * @returns {Array<{basePath: string, searchRoots: string[], structure: 'special' | 'default'}>}
 */
 function getPathConfigsForYear(anoBusca) {
    const configs = [];
    const anoBuscaStr = anoBusca.toString();

    for (const key in process.env) {
        if (key.startsWith('YEARS_')) {
            const years = process.env[key].split(',').map(y => y.trim());
            if (years.includes(anoBuscaStr)) {
                const serverId = key.replace('YEARS_', ''); // ex: '196'
                const pathKey = `PATH_${serverId}`;
                const configString = process.env[pathKey];

                if (configString) {
                    const [basePath, subRootsString] = configString.split(',');
                    if (subRootsString) {
                        // Estrutura especial (ex: .196)
                        const searchRoots = subRootsString.split(';').map(p => path.join(basePath.trim(), p.trim()));
                        configs.push({ basePath: basePath.trim(), searchRoots, structure: 'special' });
                    } else {
                        // Estrutura padrão
                        const searchRoots = basePath.split(';').map(p => p.trim());
                        configs.push({ basePath: null, searchRoots, structure: 'default' });
                    }
                }
            }
        }
    }
    return configs;
 }

function listFilesRecursively(dirPath) {
    const files = [];
    const items = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const item of items) {
        const fullPath = path.join(dirPath, item.name);
        if (item.isDirectory()) {
            files.push(...listFilesRecursively(fullPath));
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

    // A data vem como 'YYYY/MM/DD'. Vamos extrair o ano.
    const [ano, mes, dia] = pasta.split('/');
    const anoBusca = parseInt(ano, 10);

    // Obtém a configuração de caminhos para o ano da busca
    const pathConfigs = getPathConfigsForYear(anoBusca);

    if (!pathConfigs || pathConfigs.length === 0) {
        console.error(`Nenhuma configuração de caminho (PATH_${anoBusca}) encontrada no .env.`);
        return null;
    }

    // Itera sobre cada objeto de configuração (pode haver múltiplos por ano)
    for (const pathConfig of pathConfigs) {
        // Itera sobre cada diretório de busca (seja um caminho completo ou uma subpasta)
        for (const searchRoot of pathConfig.searchRoots) {
            if (!fs.existsSync(searchRoot)) {
                console.warn(`AVISO: O caminho de busca "${searchRoot}" não está acessível. Pulando...`);
                continue;
            }

            let prefixPath;
            // Lógica condicional para a estrutura de pastas
            if (pathConfig.structure === 'special') {
                // Estrutura especial: YYYY/MM/DD (com zeros)
                prefixPath = path.join(ano, mes, dia);
            } else {
                // Estrutura padrão: YYYY/M/D (sem zeros)
                const mesSemZero = parseInt(mes, 10).toString();
                const diaSemZero = parseInt(dia, 10).toString();
                prefixPath = path.join(ano, mesSemZero, diaSemZero);
            }

            const fullPath = path.join(searchRoot, prefixPath);

            console.log(`Buscando no diretório: ${fullPath}`);

            if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
                const allFiles = listFilesRecursively(fullPath);

                const relativeBasePath = pathConfig.basePath || searchRoot;

                const contents = allFiles.map(filePath => {
                    const relativePath = path.relative(relativeBasePath, filePath);
                    const s3Key = relativePath.replace(/\\/g, '/');
                    return { Key: s3Key };
                });

                const arquivoEncontrado = contents.find(obj => {
                    // Normaliza para minúsculas para uma comparação case-insensitive
                    const nomeBaseNaChave = path.parse(obj.Key).name.toLowerCase();
                    const termoBuscado = nomeProtocolo.toLowerCase();
                    return nomeBaseNaChave.includes(termoBuscado);
                });

                if (arquivoEncontrado) {
                    console.log(`Arquivo encontrado! Chave completa: ${arquivoEncontrado.Key}`);
                    const caminhoCompletoDoArquivo = path.join(relativeBasePath, arquivoEncontrado.Key.replace(/\//g, path.sep));
                    const nomeParaDownload = path.basename(arquivoEncontrado.Key);
                    const downloadUrl = `/download-local?file=${encodeURIComponent(caminhoCompletoDoArquivo)}`;

                    console.log(`Arquivo físico em: ${caminhoCompletoDoArquivo}`);
                    console.log(`URL de download para o novo endpoint: ${downloadUrl}`);
                    console.log('--- Requisição finalizada com sucesso ---\n');
                    return { downloadUrl, nomeParaDownload };
                }
            }
        }
    }

    console.error('ERRO: Nenhum arquivo correspondente encontrado na lista.');
    console.log('--- Requisição finalizada com erro ---\n');
    return null;
}