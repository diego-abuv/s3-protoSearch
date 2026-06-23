import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import { createSearchRoutes } from './routes/search.js';
import { logger } from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp(searchableService) {
  const app = express();

  app.use(express.json());

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
  });

  const searchLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({ error: 'Muitas requisições. Tente novamente em instantes.' });
    },
  });
  app.use('/buscar-arquivo', searchLimiter);

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
      const rawPath = req.query.file;

      if (!rawPath) {
        return res.status(400).send('Parâmetro "file" não especificado.');
      }

      const resolvedPath = path.resolve(rawPath);

      const validBasePaths = getAllBasePaths().map((p) => path.resolve(p.trim()));
      const isPathValid = validBasePaths.some((base) => {
        const normalizedBase = base.replace(/[\\/]$/, '');
        return resolvedPath.startsWith(normalizedBase + path.sep) || resolvedPath === normalizedBase;
      });

      if (!isPathValid) {
        logger.warn(`Tentativa de path-traversal bloqueada: ${rawPath} -> ${resolvedPath}`);
        return res.status(403).send('Acesso negado.');
      }

      res.download(resolvedPath);
    });
  }

  const searchRoutes = createSearchRoutes(searchableService);
  app.use(searchRoutes);

  return app;
}
