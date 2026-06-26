import { Router } from 'express';
import path from 'path';
import { authMiddleware } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

export function createDownloadRoutes() {
  const router = Router();

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

  router.get('/download-local', authMiddleware, (req, res) => {
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

  return router;
}
