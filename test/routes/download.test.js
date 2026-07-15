import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Readable } from 'stream';

vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.PATH_TEST = 'C:\\valid_base';
  process.env.AWS_REGION = 'us-east-1';
  process.env.AWS_ACCESS_KEY_ID = 'test-key';
  process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
  process.env.AWS_BUCKET_NAME = 'test-bucket';
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

const { mockSend } = vi.hoisted(() => {
  const mockSend = vi.fn();
  return { mockSend };
});
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(function () {
    return { send: mockSend };
  }),
  GetObjectCommand: vi.fn(),
}));

import { createApp } from '../../src/app.js';

function makeToken() {
  return jwt.sign({ id: 1, username: 'downloaduser', role: 'user' }, process.env.JWT_SECRET, { expiresIn: '15m' });
}

describe('Download Routes', () => {
  let app;

  beforeAll(async () => {
    app = await createApp({ findFileAndGetSignedUrl: vi.fn() });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /download-local', () => {
    it('retorna 401 sem autenticacao', async () => {
      const res = await request(app).get('/download-local');
      expect(res.status).toBe(401);
    });

    it('retorna 400 quando parametro file ausente', async () => {
      const res = await request(app).get('/download-local').set('Authorization', `Bearer ${makeToken()}`);
      expect(res.status).toBe(400);
    });

    it('retorna 403 para tentativa de path traversal', async () => {
      const res = await request(app)
        .get('/download-local')
        .set('Authorization', `Bearer ${makeToken()}`)
        .query({ file: '..\\..\\windows\\system32\\config' });
      expect(res.status).toBe(403);
    });
  });

  describe('GET /download-s3', () => {
    it('retorna 401 sem autenticacao', async () => {
      const res = await request(app).get('/download-s3');
      expect(res.status).toBe(401);
    });

    it('retorna 400 quando parametro key ausente', async () => {
      const res = await request(app).get('/download-s3').set('Authorization', `Bearer ${makeToken()}`);
      expect(res.status).toBe(400);
    });

    it('retorna 500 quando S3 falha', async () => {
      mockSend.mockRejectedValue(new Error('S3 error'));
      const res = await request(app)
        .get('/download-s3')
        .set('Authorization', `Bearer ${makeToken()}`)
        .query({ key: '2024/01/02/test.mp3' });
      expect(res.status).toBe(500);
    });

    it('faz stream do arquivo quando S3 retorna sucesso', async () => {
      const mockStream = Readable.from(['audio content']);
      mockSend.mockResolvedValue({
        Body: mockStream,
        ContentType: 'audio/mpeg',
      });
      const res = await request(app)
        .get('/download-s3')
        .set('Authorization', `Bearer ${makeToken()}`)
        .query({ key: '2024/01/02/test.mp3', nome: 'test.mp3' });
      expect(res.status).toBe(200);
    });

    it('usa filename do parametro nome no header Content-Disposition', async () => {
      const mockStream = Readable.from(['audio']);
      mockSend.mockResolvedValue({
        Body: mockStream,
        ContentType: 'audio/mpeg',
      });
      const res = await request(app)
        .get('/download-s3')
        .set('Authorization', `Bearer ${makeToken()}`)
        .query({ key: '2024/01/02/test.mp3', nome: 'custom_name.mp3' });
      expect(res.status).toBe(200);
    });
  });
});
