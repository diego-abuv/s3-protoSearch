import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import http from 'http';

vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.API_KEY = 'test-api-key';
});

vi.mock('express-rate-limit', () => ({
  default: () => (req, res, next) => next(),
}));

vi.mock('../../src/db/sqlite.js', () => ({
  initDatabase: vi.fn().mockResolvedValue(undefined),
  get: vi.fn(),
  all: vi.fn(),
  run: vi.fn(),
  save: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), success: vi.fn(), warn: vi.fn(), section: vi.fn(), destaque: vi.fn() },
  createContextLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    section: vi.fn(),
    destaque: vi.fn(),
  })),
}));

import { createApp } from '../../src/app.js';
import crypto from 'node:crypto';

function makeToken() {
  return jwt.sign({ id: 1, username: 'searchuser', role: 'user' }, process.env.JWT_SECRET, { expiresIn: '15m' });
}

describe('Search Routes', () => {
  let app;
  let mockService;
  let sqlite;

  beforeAll(async () => {
    mockService = { findFileAndGetSignedUrl: vi.fn() };
    app = await createApp(mockService);
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    sqlite = await import('../../src/db/sqlite.js');
  });

  describe('POST /buscar-arquivo', () => {
    it('retorna 401 sem token de autenticacao', async () => {
      const res = await request(app).post('/buscar-arquivo').send({ pasta: '2024/01/02', nomeProtocolo: '12345' });
      expect(res.status).toBe(401);
    });

    it('retorna 400 quando pasta ausente', async () => {
      const res = await request(app)
        .post('/buscar-arquivo')
        .set('Authorization', `Bearer ${makeToken()}`)
        .send({ nomeProtocolo: '12345' });
      expect(res.status).toBe(400);
      expect(res.body.encontrado).toBe(false);
    });

    it('retorna 400 quando nomeProtocolo ausente', async () => {
      const res = await request(app)
        .post('/buscar-arquivo')
        .set('Authorization', `Bearer ${makeToken()}`)
        .send({ pasta: '2024/01/02' });
      expect(res.status).toBe(400);
      expect(res.body.encontrado).toBe(false);
    });

    it('retorna 200 com arquivos quando encontrados', async () => {
      const fakeFiles = [{ url: 'https://s3.example.com/file.mp3', nome: '12345.mp3' }];
      mockService.findFileAndGetSignedUrl.mockResolvedValue({
        arquivos: fakeFiles,
        status: { s3: 'sucesso', local: 'nao_consultado' },
      });
      const res = await request(app)
        .post('/buscar-arquivo')
        .set('Authorization', `Bearer ${makeToken()}`)
        .send({ pasta: '2024/01/02', nomeProtocolo: '12345' });
      expect(res.status).toBe(200);
      expect(res.body.encontrado).toBe(true);
      expect(res.body.arquivos).toEqual(fakeFiles);
      expect(res.body.status.s3).toBe('sucesso');
    });

    it('substitui hifen por barra na pasta', async () => {
      mockService.findFileAndGetSignedUrl.mockResolvedValue({
        arquivos: [{ url: 'url', nome: 'file' }],
        status: { s3: 'sucesso', local: 'nao_consultado' },
      });
      await request(app)
        .post('/buscar-arquivo')
        .set('Authorization', `Bearer ${makeToken()}`)
        .send({ pasta: '2024-01-02', nomeProtocolo: '12345' });
      expect(mockService.findFileAndGetSignedUrl).toHaveBeenCalledWith(
        '2024/01/02',
        '12345',
        expect.any(Object),
        undefined,
        expect.any(Object),
      );
    });

    it('retorna 404 quando nenhum arquivo encontrado', async () => {
      mockService.findFileAndGetSignedUrl.mockResolvedValue({
        arquivos: [],
        status: { s3: 'sem_resultados', local: 'nao_consultado' },
      });
      const res = await request(app)
        .post('/buscar-arquivo')
        .set('Authorization', `Bearer ${makeToken()}`)
        .send({ pasta: '2024/01/02', nomeProtocolo: 'inexistente' });
      expect(res.status).toBe(404);
      expect(res.body.encontrado).toBe(false);
      expect(res.body.arquivos).toBeNull();
    });

    it('retorna 500 quando servico lanca erro', async () => {
      mockService.findFileAndGetSignedUrl.mockRejectedValue(new Error('Falha interna'));
      const res = await request(app)
        .post('/buscar-arquivo')
        .set('Authorization', `Bearer ${makeToken()}`)
        .send({ pasta: '2024/01/02', nomeProtocolo: '12345' });
      expect(res.status).toBe(500);
      expect(res.body.encontrado).toBe(false);
    });

    it('registra auditoria na busca', async () => {
      mockService.findFileAndGetSignedUrl.mockResolvedValue({
        arquivos: [{ url: 'url', nome: 'file' }],
        status: { s3: 'sucesso', local: 'nao_consultado' },
      });
      await request(app)
        .post('/buscar-arquivo')
        .set('Authorization', `Bearer ${makeToken()}`)
        .send({ pasta: '2024/01/02', nomeProtocolo: '12345' });
      expect(sqlite.logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'search',
          target: '2024/01/02/12345',
        }),
      );
    });

    it('audit registra interrompida=true quando status contem erro', async () => {
      mockService.findFileAndGetSignedUrl.mockResolvedValue({
        arquivos: null,
        status: { s3: 'erro: AccessDenied', local: 'nao_consultado' },
      });

      await request(app)
        .post('/buscar-arquivo')
        .set('Authorization', `Bearer ${makeToken()}`)
        .send({ pasta: '2024/01/02', nomeProtocolo: '12345' });

      expect(sqlite.logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.stringContaining('interrompida=true'),
        }),
      );
    });

    it('audit nao registra interrompida quando busca normal sem resultados', async () => {
      mockService.findFileAndGetSignedUrl.mockResolvedValue({
        arquivos: null,
        status: { s3: 'nao_encontrado', local: 'nao_encontrado' },
      });

      await request(app)
        .post('/buscar-arquivo')
        .set('Authorization', `Bearer ${makeToken()}`)
        .send({ pasta: '2024/01/02', nomeProtocolo: '12345' });

      expect(sqlite.logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.not.stringContaining('interrompida'),
        }),
      );
    });

    it('autentica via x-api-key header', async () => {
      mockService.findFileAndGetSignedUrl.mockResolvedValue({
        arquivos: [{ url: 'url', nome: 'file.mp3' }],
        status: { s3: 'ok', local: 'nao_consultado' },
      });

      const res = await request(app)
        .post('/buscar-arquivo')
        .set('x-api-key', 'test-api-key')
        .send({ pasta: '2024/01/02', nomeProtocolo: '12345' });

      expect(res.status).toBe(200);
      expect(res.body.encontrado).toBe(true);
    });

    it('autentica via x-api-key e retorna 404 sem resultados', async () => {
      mockService.findFileAndGetSignedUrl.mockResolvedValue({
        arquivos: null,
        status: { s3: 'nao_encontrado', local: 'nao_encontrado' },
      });

      const res = await request(app)
        .post('/buscar-arquivo')
        .set('x-api-key', 'test-api-key')
        .send({ pasta: '2024/01/02', nomeProtocolo: 'inexistente' });

      expect(res.status).toBe(404);
      expect(res.body.encontrado).toBe(false);
    });

    it('rejeita x-api-key invalido', async () => {
      const res = await request(app)
        .post('/buscar-arquivo')
        .set('x-api-key', 'invalid-key')
        .send({ pasta: '2024/01/02', nomeProtocolo: '12345' });

      expect(res.status).toBe(403);
    });

    it('lida com busca demorada sem crash (simula 502/timeout)', async () => {
      const slowPromise = new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            arquivos: null,
            status: { s3: 'nao_encontrado', local: 'nao_encontrado' },
          });
        }, 2000);
      });
      mockService.findFileAndGetSignedUrl.mockReturnValue(slowPromise);

      const start = Date.now();
      const res = await request(app)
        .post('/buscar-arquivo')
        .set('Authorization', `Bearer ${makeToken()}`)
        .send({ pasta: '2024/01/02', nomeProtocolo: 'lento' });

      const elapsed = Date.now() - start;
      expect(res.status).toBe(404);
      expect(res.body.encontrado).toBe(false);
      expect(elapsed).toBeGreaterThanOrEqual(1900);
    });

    it('lida com resultado null do servico (sem arquivos nem status)', async () => {
      mockService.findFileAndGetSignedUrl.mockResolvedValue(null);

      const res = await request(app)
        .post('/buscar-arquivo')
        .set('Authorization', `Bearer ${makeToken()}`)
        .send({ pasta: '2024/01/02', nomeProtocolo: '12345' });

      expect(res.status).toBe(404);
    });

    it('suporta SSE com progresso e resultado', async () => {
      const buscaComSSE = vi.fn().mockImplementation(async (pasta, nome, log, onProgress) => {
        onProgress?.({ type: 's3_start', message: 'Buscando no S3...' });
        await new Promise((r) => setTimeout(r, 10));
        onProgress?.({ type: 's3_done', message: 'S3 concluido' });
        return {
          arquivos: [{ downloadUrl: '/download-local?file=/path/file.mp3', nomeParaDownload: 'file.mp3' }],
          status: { s3: 'ok', local: 'nao_consultado' },
        };
      });
      mockService.findFileAndGetSignedUrl.mockImplementation(buscaComSSE);

      const res = await request(app)
        .post('/buscar-arquivo')
        .set('Authorization', `Bearer ${makeToken()}`)
        .set('Accept', 'text/event-stream')
        .send({ pasta: '2024/01/02', nomeProtocolo: '12345' });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(res.text).toContain('event: progress');
      expect(res.text).toContain('event: result');
      expect(res.text).toContain('"encontrado":true');
    });

    it('SSE retorna erro quando servico lanca excecao', async () => {
      const originalError = console.error;
      console.error = vi.fn();

      mockService.findFileAndGetSignedUrl.mockRejectedValue(new Error('Falha interna SSE'));

      const res = await request(app)
        .post('/buscar-arquivo')
        .set('Authorization', `Bearer ${makeToken()}`)
        .set('Accept', 'text/event-stream')
        .send({ pasta: '2024/01/02', nomeProtocolo: '12345' });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(res.text).toContain('event: result');
      expect(res.text).toContain('encontrado');
      expect(res.text).toContain('Falha interna SSE');

      console.error = originalError;
    });

    it('cobre caso de resultado null do servico (regressao 502)', async () => {
      mockService.findFileAndGetSignedUrl.mockResolvedValue(null);

      const res = await request(app)
        .post('/buscar-arquivo')
        .set('x-api-key', 'test-api-key')
        .send({ pasta: '2024/01/02', nomeProtocolo: '12345' });

      expect(res.status).toBe(404);
      expect(res.body.encontrado).toBe(false);
      expect(res.body.arquivos).toBeNull();
    });

    it('logga encontrado no finish listener', async () => {
      mockService.findFileAndGetSignedUrl.mockResolvedValue({
        arquivos: [{ url: 'url', nome: 'file.mp3' }],
        status: { s3: 'ok', local: 'nao_consultado' },
      });

      await request(app)
        .post('/buscar-arquivo')
        .set('Authorization', `Bearer ${makeToken()}`)
        .send({ pasta: '2024/01/02', nomeProtocolo: '12345' });

      const loggerMod = await import('../../src/utils/logger.js');
      const ctxLogger = loggerMod.createContextLogger.mock.results[0].value;
      expect(ctxLogger.info).toHaveBeenCalledWith(expect.stringContaining('(encontrado: 1'));
    });

    it('logga nao encontrado no finish listener', async () => {
      mockService.findFileAndGetSignedUrl.mockResolvedValue({
        arquivos: [],
        status: { s3: 'sem_resultados', local: 'nao_consultado' },
      });

      await request(app)
        .post('/buscar-arquivo')
        .set('Authorization', `Bearer ${makeToken()}`)
        .send({ pasta: '2024/01/02', nomeProtocolo: 'inexistente' });

      const loggerMod = await import('../../src/utils/logger.js');
      const ctxLogger = loggerMod.createContextLogger.mock.results[0].value;
      expect(ctxLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Response: 404 POST /buscar-arquivo (não encontrado'),
      );
    });

    it('logga erro no finish listener', async () => {
      mockService.findFileAndGetSignedUrl.mockRejectedValue(new Error('Falha interna'));

      await request(app)
        .post('/buscar-arquivo')
        .set('Authorization', `Bearer ${makeToken()}`)
        .send({ pasta: '2024/01/02', nomeProtocolo: '12345' });

      const loggerMod = await import('../../src/utils/logger.js');
      const ctxLogger = loggerMod.createContextLogger.mock.results[0].value;
      expect(ctxLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Response: 500 POST /buscar-arquivo (erro: Falha interna)'),
      );
    });
  });

  describe('POST /cancel-search/:token', () => {
    it('retorna 401 sem autenticacao', async () => {
      const res = await request(app).post('/cancel-search/any-token');
      expect(res.status).toBe(401);
    });

    it('retorna 404 quando token invalido', async () => {
      const res = await request(app)
        .post('/cancel-search/token-invalido')
        .set('Authorization', `Bearer ${makeToken()}`);
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Busca nao encontrada ou ja finalizada');
    });

    it('cancela busca ativa com sucesso', async () => {
      const server = http.createServer(app);
      await new Promise((r) => server.listen(0, r));
      try {
        mockService.findFileAndGetSignedUrl.mockImplementation(
          (_pasta, _nome, _log, _onProgress, signal) =>
            new Promise((resolve) => {
              if (signal?.aborted) { resolve(null); return; }
              signal?.addEventListener('abort', () => resolve(null), { once: true });
            }),
        );

        const port = server.address().port;
        const tokenPromise = new Promise((resolve, reject) => {
          const postData = JSON.stringify({ pasta: '2024/01/02', nomeProtocolo: '12345' });
          const options = {
            hostname: 'localhost',
            port,
            method: 'POST',
            path: '/buscar-arquivo',
            headers: {
              Authorization: `Bearer ${makeToken()}`,
              Accept: 'text/event-stream',
              'Content-Type': 'application/json',
            },
          };
          const req = http.request(options, (res) => {
            let buf = '';
            let done = false;
            res.on('data', (chunk) => {
              buf += chunk;
              if (done) return;
              const m = buf.match(/"token":"([^"]+)"/);
              if (m) { done = true; resolve(m[1]); }
            });
            res.on('error', reject);
          });
          req.write(postData);
          req.end();
          setTimeout(() => reject(new Error('timeout capturing token')), 3000);
        });

        const token = await tokenPromise;
        const cancelRes = await request(app)
          .post(`/cancel-search/${token}`)
          .set('Authorization', `Bearer ${makeToken()}`);

        expect(cancelRes.status).toBe(200);
        expect(cancelRes.body.message).toBe('Busca cancelada');
      } finally {
        server.close();
      }
    });
  });
});
