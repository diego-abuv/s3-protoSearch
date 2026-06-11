import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createSearchRoutes } from './routes/search.js';
import { logger } from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp(searchableService) {
  const app = express();

  app.use(express.json());

  app.use(express.static(path.resolve(__dirname, '..', 'public')));

  if (process.env.NODE_ENV === 'busca-ligacoes') {
    logger.info('Busca local: rota de download ativada.');

    const getAllBasePaths = () => {
      const paths = [];
      for (const key in process.env) {
        if (key.startsWith('PATH_')) {
          const configString = process.env[key] || '';
          const basePathPart = configString.split(',')[0];
          const basePaths = basePathPart.split(';').map((p) => p.trim());
          paths.push(...basePaths);
        }
      }
      return paths;
    };

    app.get('/download-local', (req, res) => {
      const filePath = req.query.file;

      if (!filePath) {
        return res.status(400).send('Parâmetro "file" não especificado.');
      }

      const validBasePaths = getAllBasePaths();
      const isPathValid = validBasePaths.some((basePath) => filePath.startsWith(basePath));

      if (!isPathValid) {
        logger.warn(`Tentativa de acesso a arquivo fora de um diretório base válido: ${filePath}`);
        return res.status(403).send('Acesso negado.');
      }

      res.download(filePath);
    });
  }

  const searchRoutes = createSearchRoutes(searchableService);
  app.use(searchRoutes);

  return app;
}
