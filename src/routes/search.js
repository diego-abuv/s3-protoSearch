import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from '../middleware/auth.js';
import { sanitizeError } from '../utils/errorCodes.js';
import { logger, createContextLogger } from '../utils/logger.js';
import { logAudit } from '../db/sqlite.js';

export function createSearchRoutes(searchableService) {
  const router = Router();

  const searchLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({ error: 'Muitas requisições. Tente novamente em instantes.' });
    },
  });

  router.post('/buscar-arquivo', authMiddleware, searchLimiter, async (req, res) => {
    const { pasta, nomeProtocolo } = req.body;

    if (!pasta || !nomeProtocolo) {
      return res.status(400).json({
        encontrado: false,
        arquivos: null,
        status: { s3: 'nao_consultado', local: 'nao_consultado' },
        error: 'Data e nome do arquivo são obrigatórios.',
      });
    }

    try {
      const pastaFormatada = pasta.replace(/-/g, '/');

      const start = performance.now();
      const ctxLogger = createContextLogger({ username: req.user.username });
      const resultado = await searchableService.findFileAndGetSignedUrl(pastaFormatada, nomeProtocolo, ctxLogger);
      const elapsed = ((performance.now() - start) / 1000).toFixed(2);

      const found = resultado.arquivos && resultado.arquivos.length > 0;
      const count = resultado.arquivos?.length || 0;
      const details = `encontrados=${count}, tempo=${elapsed}s, s3=${resultado.status.s3}, local=${resultado.status.local}`;

      logAudit({
        user_id: req.user.id,
        username: req.user.username,
        action: 'search',
        target: `${pasta}/${nomeProtocolo}`,
        details,
        ip: req.ip,
      });

      if (found) {
        return res.status(200).json({
          encontrado: true,
          arquivos: resultado.arquivos,
          status: resultado.status,
        });
      }

      return res.status(404).json({
        encontrado: false,
        arquivos: null,
        status: resultado.status,
      });
    } catch (err) {
      logger.error('Erro não tratado na rota de busca:', err);
      logAudit({
        user_id: req.user.id,
        username: req.user.username,
        action: 'search',
        target: `${pasta}/${nomeProtocolo}`,
        details: `erro=${sanitizeError(err)}`,
        ip: req.ip,
      });
      return res.status(500).json({
        encontrado: false,
        arquivos: null,
        status: { s3: `erro: ${sanitizeError(err)}`, local: 'nao_consultado' },
        error: 'Ocorreu um erro inesperado no servidor.',
      });
    }
  });

  return router;
}
