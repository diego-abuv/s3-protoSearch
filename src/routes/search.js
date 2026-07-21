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

    const pastaFormatada = pasta.replace(/-/g, '/');
    const wantsSSE = req.headers.accept === 'text/event-stream';
    const start = performance.now();
    const ctxLogger = createContextLogger({ username: req.user.username });

    res.on('finish', () => {
      ctxLogger.info(`Response: ${res.statusCode} ${req.method} ${req.originalUrl}`);
    });

    const onProgress = wantsSSE
      ? (data) => {
          try {
            res.write(`event: progress\ndata: ${JSON.stringify(data)}\n\n`);
          } catch {
            /* connection already closed */
          }
        }
      : undefined;

    if (wantsSSE) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();
    }

    try {
      const resultado = await searchableService.findFileAndGetSignedUrl(
        pastaFormatada,
        nomeProtocolo,
        ctxLogger,
        onProgress,
      );
      const elapsed = ((performance.now() - start) / 1000).toFixed(2);

      if (!resultado) {
        logAudit({
          user_id: req.user.id,
          username: req.user.username,
          action: 'search',
          target: `${pasta}/${nomeProtocolo}`,
          details: `encontrados=0, tempo=${elapsed}s, s3=nao_consultado, local=nao_consultado`,
          ip: req.ip,
        });
        if (wantsSSE) {
          res.write(
            `event: result\ndata: ${JSON.stringify({
              encontrado: false,
              arquivos: null,
              status: { s3: 'nao_consultado', local: 'nao_consultado' },
            })}\n\n`,
          );
          res.end();
          return;
        }
        return res.status(404).json({
          encontrado: false,
          arquivos: null,
          status: { s3: 'nao_consultado', local: 'nao_consultado' },
        });
      }

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

      if (wantsSSE) {
        res.write(
          `event: result\ndata: ${JSON.stringify({
            encontrado: found,
            arquivos: resultado.arquivos,
            status: resultado.status,
          })}\n\n`,
        );
        res.end();
        return;
      }

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

      if (wantsSSE) {
        res.write(
          `event: result\ndata: ${JSON.stringify({
            encontrado: false,
            arquivos: null,
            status: { s3: `erro: ${sanitizeError(err)}`, local: 'nao_consultado' },
            error: 'Ocorreu um erro inesperado no servidor.',
          })}\n\n`,
        );
        res.end();
        return;
      }

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
