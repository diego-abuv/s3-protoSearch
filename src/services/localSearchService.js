import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';

function getPathConfigsForYear(anoBusca) {
  const configs = [];
  const anoBuscaStr = anoBusca.toString();

  for (const key in process.env) {
    if (key.startsWith('YEARS_')) {
      const years = process.env[key].split(',').map((y) => y.trim());
      if (years.includes(anoBuscaStr)) {
        const serverId = key.replace('YEARS_', '');
        const pathKey = `PATH_${serverId}`;
        const configString = process.env[pathKey];

        if (configString) {
          const [basePath, subRootsString] = configString.split(',');
          if (subRootsString) {
            const searchRoots = subRootsString.split(';').map((p) => path.join(basePath.trim(), p.trim()));
            configs.push({ basePath: basePath.trim(), searchRoots, structure: 'special' });
          } else {
            const searchRoots = basePath.split(';').map((p) => p.trim());
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
  logger.section('Início da requisição de busca local');
  logger.info(`- Data do Protocolo (pasta): ${pasta}`);
  logger.info(`- Nome do Arquivo (nomeProtocolo): ${nomeProtocolo}`);

  const [ano, mes, dia] = pasta.split('/');
  const anoBusca = parseInt(ano, 10);

  const pathConfigs = getPathConfigsForYear(anoBusca);

  if (!pathConfigs || pathConfigs.length === 0) {
    logger.error(`Nenhuma configuração de caminho associada ao ano ${anoBusca} encontrada no .env.`);
    return null;
  }

  let algumCaminhoAcessivel = false;

  for (const pathConfig of pathConfigs) {
    for (const searchRoot of pathConfig.searchRoots) {
      try {
        if (!fs.existsSync(searchRoot)) {
          logger.warn(`O caminho de busca "${searchRoot}" não está acessível. Pulando...`);
          continue;
        }
      } catch (err) {
        logger.warn(`Erro ao acessar caminho "${searchRoot}": ${err.message}. Pulando...`);
        continue;
      }

      algumCaminhoAcessivel = true;

      let prefixPath;

      if (pathConfig.structure === 'special') {
        prefixPath = path.join(ano, mes, dia);
      } else {
        const mesSemZero = parseInt(mes, 10).toString();
        const diaSemZero = parseInt(dia, 10).toString();
        prefixPath = path.join(ano, mesSemZero, diaSemZero);
      }

      const fullPath = path.join(searchRoot, prefixPath);

      logger.info(`Buscando no diretório: ${fullPath}`);

      try {
        if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) {
          logger.info(`Diretório não encontrado: ${fullPath}`);
          continue;
        }
      } catch (err) {
        logger.warn(`Erro ao acessar diretório "${fullPath}": ${err.message}. Pulando...`);
        continue;
      }

      let allFiles;
      try {
        allFiles = listFilesRecursively(fullPath);
      } catch (err) {
        logger.warn(`Erro ao listar arquivos em "${fullPath}": ${err.message}. Pulando...`);
        continue;
      }

      const relativeBasePath = pathConfig.basePath || searchRoot;

      const contents = allFiles.map((filePath) => {
        const relativePath = path.relative(relativeBasePath, filePath);
        const pathKey = relativePath.replace(/\\/g, '/');
        return { Key: pathKey };
      });

      const termoBuscado = path.parse(nomeProtocolo).name.toLowerCase();

      const arquivosEncontrados = contents.filter((obj) => {
        const nomeBaseNaChave = path.parse(obj.Key).name.toLowerCase();
        return nomeBaseNaChave.includes(termoBuscado);
      });

      if (arquivosEncontrados.length > 0) {
        const resultados = arquivosEncontrados.map((obj) => {
          logger.success(`Arquivo encontrado! Chave: ${obj.Key}`);

          const caminhoCompletoDoArquivo = path.join(relativeBasePath, obj.Key.replace(/\//g, path.sep));
          const nomeParaDownload = path.basename(obj.Key);
          const downloadUrl = `/download-local?file=${encodeURIComponent(caminhoCompletoDoArquivo)}`;

          logger.info(`Arquivo físico em: ${caminhoCompletoDoArquivo}`);
          logger.info(`URL de download: ${downloadUrl}`);

          return { downloadUrl, nomeParaDownload };
        });

        logger.section('Busca local finalizada com sucesso');
        return resultados;
      }
    }
  }

  if (!algumCaminhoAcessivel) {
    logger.error('Nenhum caminho de busca local está acessível.');
    logger.section('Busca local finalizada com erro');
    return { erro: 'Nenhum caminho de rede acessivel' };
  }

  logger.info('Nenhum arquivo correspondente encontrado localmente.');
  logger.section('Busca local finalizada');
  return null;
}
