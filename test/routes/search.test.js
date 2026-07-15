import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-jwt-secret';
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

vi.mock('../../src/db/indexDb.js', () => ({
  initIndexDb: vi.fn().mockResolvedValue(undefined),
}));

import { createApp } from '../../src/app.js';

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
      expect(mockService.findFileAndGetSignedUrl).toHaveBeenCalledWith('2024/01/02', '12345', expect.any(Object));
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
  });
});
