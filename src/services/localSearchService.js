// ----------serviço de busca local---------- //

import 'dotenv/config';
import fs from 'fs';
import path from 'path';

// ----------funções de busca local---------- //

// Obtém as configurações de caminho do .env para um determinado ano
function getPathConfigsForYear(anoBusca) {
    const configs = [];
    const anoBuscaStr = anoBusca.toString();

    // configura a estrutura do caminho de busca
    for (const key in process.env) {
        if (key.startsWith('YEARS_')) {
            const years = process.env[key].split(',').map(y => y.trim());
            if (years.includes(anoBuscaStr)) {
                const serverId = key.replace('YEARS_', ''); // ex: '196'
                const pathKey = `PATH_${serverId}`;
                const configString = process.env[pathKey];
                
                // --- Estrutura da configuração:
                if (configString) {
                    const [basePath, subRootsString] = configString.split(',');
                    if (subRootsString) {
                        // Estrutura especial (ex: .196 que contém subpastas)
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

// --- Lista arquivos recursivamente em um diretório ---
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

// ----------função principal de busca local---------- //
export async function findFileAndGetSignedUrl(pasta, nomeProtocolo) {
    console.log('\n--- Início da requisição de busca local ---');
    console.log(`- Data do Protocolo (pasta): ${pasta}`);
    console.log(`- Nome do Arquivo (nomeProtocolo): ${nomeProtocolo}`);

    // A data vem como 'YYYY/MM/DD'
    // Extraindo o ano para determinar o caminho base
    const [ano, mes, dia] = pasta.split('/');
    const anoBusca = parseInt(ano, 10);

    // Obtém a configuração de caminhos para o ano da busca
    const pathConfigs = getPathConfigsForYear(anoBusca);

    // Validação: Verifica se há configurações para o ano solicitado
    if (!pathConfigs || pathConfigs.length === 0) {
        console.error(`Nenhuma configuração de caminho (PATH_${anoBusca}) encontrada no .env.`);
        return null;
    }

    // Itera sobre cada objeto de configuração (pode haver múltiplos por ano)
    for (const pathConfig of pathConfigs) {
        // ---- Itera sobre cada raiz de busca configurada ----
        for (const searchRoot of pathConfig.searchRoots) {
            if (!fs.existsSync(searchRoot)) {
                console.warn(`AVISO: O caminho de busca "${searchRoot}" não está acessível. Pulando...`);
                continue;
            }
            
            // inicia a variável de prefixoPath para uso posterior
            let prefixPath;

            // --- Lógica condicional para a estrutura de pastas ---
            if (pathConfig.structure === 'special') {
                // Estrutura especial: YYYY/MM/DD (com zeros)
                prefixPath = path.join(ano, mes, dia);
            } else {
                // Estrutura padrão: YYYY/M/D (sem zeros)
                const mesSemZero = parseInt(mes, 10).toString();
                const diaSemZero = parseInt(dia, 10).toString();
                prefixPath = path.join(ano, mesSemZero, diaSemZero);
            }
            
            // anexa o prefixPath ao searchRoot para formar o caminho completo
            const fullPath = path.join(searchRoot, prefixPath);

            console.log(`\nBuscando no diretório: ${fullPath}`);

            // Verifica se o diretório existe antes de listar arquivos
            if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
                
                // armazena todos os arquivos encontrados recursivamente
                const allFiles = listFilesRecursively(fullPath);   
                
                // Constrói um array de objetos no formato { Key: 'caminho/relativo/arquivo.ext' }
                // será usado para simular a busca similar ao S3
                const relativeBasePath = pathConfig.basePath || searchRoot;
                
                // mapeia os arquivos para o formato esperado
                const contents = allFiles.map(filePath => {
                    const relativePath = path.relative(relativeBasePath, filePath);
                    const pathKey = relativePath.replace(/\\/g, '/');
                    return { Key: pathKey };
                });


                // ------- Busca o arquivo e retorna um array de resultados ------- //

                const termoBuscado = path.parse(nomeProtocolo).name.toLowerCase();

                // filtra os arquivos que correspondem ao termo buscado
                const arquivosEncontrados = contents.filter(obj => {
                    
                    const nomeBaseNaChave = path.parse(obj.Key).name.toLowerCase();
                    
                    return nomeBaseNaChave.includes(termoBuscado);
                });

                // listagem dos arquivos se encontrar ao menos um
                if (arquivosEncontrados.length > 0) {
                    
                    // armazena os os objetos encontrados pelo .map na variavel como array
                    const resultados = arquivosEncontrados.map(obj => {
                        
                        // Log do arquivo encontrado passando a chave completa do objeto atual
                        console.log(`Arquivo encontrado! Chave completa: ${obj.Key}`);
                        
                        // Constrói o caminho completo do arquivo no sistema de arquivos
                        // e a URL de download para o endpoint local disponibilizar o arquivo
                        const caminhoCompletoDoArquivo = path.join(relativeBasePath, obj.Key.replace(/\//g, path.sep));
                        const nomeParaDownload = path.basename(obj.Key);
                        const downloadUrl = `/download-local?file=${encodeURIComponent(caminhoCompletoDoArquivo)}`;

                        // Log dos detalhes do arquivo encontrado
                        console.log(`Arquivo físico em: ${caminhoCompletoDoArquivo}`);
                        console.log(`URL de download para o novo endpoint: ${downloadUrl}`);
                        
                        // Retorna o objeto no formato esperado pela API
                        return { downloadUrl, nomeParaDownload };
                    });


                    console.log('--- Requisição finalizada com sucesso ---\n');
                    
                    // retorna o array com os objetos encontrados no mapping
                    return resultados;
                }
            }
        }
    }

    console.error('ERRO: Nenhum arquivo correspondente encontrado na lista.');
    console.log('--- Requisição finalizada com erro ---\n');
    return null;
}