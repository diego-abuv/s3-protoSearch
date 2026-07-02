import 'dotenv/config';
import fs from 'fs/promises';
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
            configs.push({ basePath: basePath.trim(), searchRoots });
          } else {
            const searchRoots = basePath.split(';').map((p) => p.trim());
            configs.push({ basePath: null, searchRoots });
          }
        }
      }
    }
  }
  return configs;
}

async function listFiles(dirPath, signal, maxDepth = Infinity) {
  const files = [];
  const stack = [[dirPath, 0]];

  while (stack.length > 0) {
    if (signal?.aborted) return [];

    const [currentDir, depth] = stack.pop();
    let items;
    try {
      items = await fs.readdir(currentDir, { withFileTypes: true });
    } catch (err) {
      logger.warn(`Ignorando diret\u00f3rio sem acesso: ${currentDir} (${err.message})`);
      continue;
    }

    for (const item of items) {
      if (signal?.aborted) return [];
      const fullPath = path.join(currentDir, item.name);
      if (item.isDirectory()) {
        if (depth < maxDepth) {
          stack.push([fullPath, depth + 1]);
        }
      } else {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function raceToFirstResult(promises) {
  return new Promise((resolve) => {
    let settled = false;
    for (const p of promises) {
      p.then((result) => {
        if (settled) return;
        if (result) {
          settled = true;
          resolve(result);
        }
      }).catch(() => {});
    }
    Promise.allSettled(promises).then(() => {
      if (!settled) resolve(null);
    });
  });
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
        await fs.access(searchRoot);
      } catch {
        logger.warn(`O caminho de busca "${searchRoot}" não está acessível. Pulando...`);
        continue;
      }

      algumCaminhoAcessivel = true;

      const variantes = [
        path.join(ano, String(parseInt(mes, 10)), String(parseInt(dia, 10))),
        path.join(ano, String(parseInt(mes, 10)), dia.padStart(2, '0')),
        path.join(ano, mes.padStart(2, '0'), dia.padStart(2, '0')),
        path.join(ano, mes.padStart(2, '0'), String(parseInt(dia, 10))),
      ];
      const prefixosUnicos = [...new Set(variantes)];

      const relativeBasePath = pathConfig.basePath || searchRoot;
      const termoBuscado = path.parse(nomeProtocolo).name.toLowerCase();

      logger.info(`Buscando em: ${searchRoot}`);
      const t0 = performance.now();

      const abortController = new AbortController();
      const { signal } = abortController;

      const promessas = prefixosUnicos.map(async (prefixo) => {
        const fullPath = path.join(searchRoot, prefixo);
        logger.info(`Testando caminho: ${prefixo}`);

        const tStat = performance.now();
        try {
          const stat = await fs.stat(fullPath);
          logger.info(`   [TIMING] fs.stat OK (${(performance.now() - tStat).toFixed(0)}ms)`);
          if (!stat.isDirectory()) return null;
        } catch {
          logger.info(`   [TIMING] fs.stat ENOENT (${(performance.now() - tStat).toFixed(0)}ms)`);
          return null;
        }

        const tList = performance.now();
        const allFiles = await listFiles(fullPath, signal, 2);
        logger.info(
          `   [TIMING] listFiles: ${allFiles.length} arquivos (${(performance.now() - tList).toFixed(0)}ms)`,
        );

        const arquivosEncontrados = [];
        for (const filePath of allFiles) {
          const nomeBase = path.parse(filePath).name.toLowerCase();
          if (nomeBase.includes(termoBuscado)) {
            const relativePath = path.relative(relativeBasePath, filePath);
            const pathKey = relativePath.replace(/\\/g, '/');
            arquivosEncontrados.push({ filePath, Key: pathKey });
          }
        }

        if (arquivosEncontrados.length === 0) return null;

        abortController.abort();

        return arquivosEncontrados.map((obj) => {
          const nomeParaDownload = path.basename(obj.Key);
          const downloadUrl = `/download-local?file=${encodeURIComponent(obj.filePath)}`;

          logger.success(`Arquivo encontrado! Chave: ${obj.Key}`);
          logger.info(`Arquivo físico em: ${obj.filePath}`);
          logger.info(`URL de download: ${downloadUrl}`);

          return { downloadUrl, nomeParaDownload };
        });
      });

      const resultado = await raceToFirstResult(promessas);
      logger.info(`   [TIMING] Busca local resolvida em ${(performance.now() - t0).toFixed(0)}ms`);

      if (resultado) {
        logger.section('Busca local finalizada com sucesso');
        return resultado;
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
