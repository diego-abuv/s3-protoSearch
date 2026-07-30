import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import { authMiddleware } from '../middleware/auth.js';
import { sanitizeError } from '../utils/errorCodes.js';
import { logger, createContextLogger } from '../utils/logger.js';
import { logAudit } from '../db/sqlite.js';

const searchTokens = new Map();

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
      const meta = res.searchMeta;
      let suffix = '';
      if (meta) {
        if (meta.error) suffix = ` (erro: ${meta.error})`;
        else if (meta.status?.cancelado) suffix = ' (cancelado)';
        else {
          const parts = [];
          if (meta.status?.s3 && !['ok', 'encontrado'].includes(meta.status.s3)) parts.push(`s3=${meta.status.s3}`);
          if (meta.status?.local && !['ok', 'encontrado'].includes(meta.status.local))
            parts.push(`local=${meta.status.local}`);
          if (meta.encontrado) parts.unshift(`encontrado: ${meta.count ?? 'sim'}`);
          else parts.unshift('não encontrado');
          suffix = ` (${parts.join(', ')})`;
        }
      }
      ctxLogger.info(`Response: ${res.statusCode} ${req.method} ${req.originalUrl}${suffix}`);
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

    const externalAbort = new AbortController();
    let searchToken = null;

    if (wantsSSE) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      searchToken = crypto.randomUUID();
      searchTokens.set(searchToken, externalAbort);
      res.write(`event: searchToken\ndata: ${JSON.stringify({ token: searchToken })}\n\n`);

      const heartbeatInterval = setInterval(() => {
        try {
          res.write(`event: heartbeat\ndata: {}\n\n`);
        } catch {
          /* connection already closed */
        }
      }, 60_000);

      const cleanup = () => {
        clearInterval(heartbeatInterval);
        if (searchToken) searchTokens.delete(searchToken);
        if (!res.writableEnded) externalAbort.abort();
      };
      res.on('close', cleanup);
      res.on('error', cleanup);
    }

    try {
      const resultado = await searchableService.findFileAndGetSignedUrl(
        pastaFormatada,
        nomeProtocolo,
        ctxLogger,
        onProgress,
        externalAbort.signal,
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
          res.searchMeta = { encontrado: false, status: { s3: 'nao_consultado', local: 'nao_consultado' } };
          res.end();
          return;
        }
        res.searchMeta = { encontrado: false, status: { s3: 'nao_consultado', local: 'nao_consultado' } };
        return res.status(404).json({
          encontrado: false,
          arquivos: null,
          status: { s3: 'nao_consultado', local: 'nao_consultado' },
        });
      }

      const found = resultado.arquivos && resultado.arquivos.length > 0;
      const count = resultado.arquivos?.length || 0;
      const wasInterrupted = resultado.status?.local?.startsWith('erro:') || resultado.status?.s3?.startsWith('erro:');
      const details =
        `encontrados=${count}, tempo=${elapsed}s, s3=${resultado.status.s3}, local=${resultado.status.local}` +
        (wasInterrupted ? ', interrompida=true' : '');

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
        res.searchMeta = { encontrado: found, count, status: resultado.status };
        res.end();
        return;
      }

      if (found) {
        res.searchMeta = { encontrado: true, count, status: resultado.status };
        return res.status(200).json({
          encontrado: true,
          arquivos: resultado.arquivos,
          status: resultado.status,
        });
      }

      res.searchMeta = { encontrado: false, status: resultado.status };
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
        res.searchMeta = { error: sanitizeError(err) };
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

      res.searchMeta = { error: sanitizeError(err) };
      return res.status(500).json({
        encontrado: false,
        arquivos: null,
        status: { s3: `erro: ${sanitizeError(err)}`, local: 'nao_consultado' },
        error: 'Ocorreu um erro inesperado no servidor.',
      });
    }
  });

  router.post('/cancel-search/:token', authMiddleware, (req, res) => {
    const abortController = searchTokens.get(req.params.token);
    if (!abortController) {
      return res.status(404).json({ error: 'Busca nao encontrada ou ja finalizada' });
    }
    abortController.abort();
    searchTokens.delete(req.params.token);
    res.json({ message: 'Busca cancelada' });
  });

  return router;
}
