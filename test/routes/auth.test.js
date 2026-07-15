import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.API_KEY = 'test-api-key';
  process.env.ADMIN_KEY = 'test-admin-key';
});

vi.mock('express-rate-limit', () => ({
  default: () => (req, res, next) => next(),
}));

vi.mock('bcryptjs', () => ({
  default: {
    hashSync: (pwd) => `hashed:${pwd}`,
    compareSync: (pwd, hash) => hash === `hashed:${pwd}`,
  },
  hashSync: (pwd) => `hashed:${pwd}`,
  compareSync: (pwd, hash) => hash === `hashed:${pwd}`,
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

describe('Auth Routes', () => {
  let app;
  let sqlite;

  beforeAll(async () => {
    app = await createApp({ findFileAndGetSignedUrl: vi.fn() });
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    sqlite = await import('../../src/db/sqlite.js');
    sqlite.get.mockReturnValue(undefined);
  });

  describe('POST /register', () => {
    it('retorna 400 quando username ausente', async () => {
      const res = await request(app).post('/register').send({ password: 'Abcd1234@xyz', adminKey: 'test-admin-key' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('username');
    });

    it('retorna 400 quando password ausente', async () => {
      const res = await request(app).post('/register').send({ username: 'newuser', adminKey: 'test-admin-key' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('password');
    });

    it('retorna 400 quando ambos ausentes', async () => {
      const res = await request(app).post('/register').send({ adminKey: 'test-admin-key' });
      expect(res.status).toBe(400);
    });

    it('retorna 400 para username invalido', async () => {
      const res = await request(app)
        .post('/register')
        .send({ username: 'ab', password: 'Abcd1234@xyz', adminKey: 'test-admin-key' });
      expect(res.status).toBe(400);
    });

    it('retorna 400 para password invalido', async () => {
      const res = await request(app)
        .post('/register')
        .send({ username: 'validuser', password: '123', adminKey: 'test-admin-key' });
      expect(res.status).toBe(400);
    });

    it('retorna 403 com adminKey errada', async () => {
      const res = await request(app)
        .post('/register')
        .send({ username: 'newuser', password: 'Abcd1234@xyz', adminKey: 'wrong' });
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('admin');
    });

    it('retorna 409 quando usuario ja existe', async () => {
      sqlite.get.mockReturnValue({ id: 1 });
      const res = await request(app)
        .post('/register')
        .send({ username: 'existing', password: 'Abcd1234@xyz', adminKey: 'test-admin-key' });
      expect(res.status).toBe(409);
    });

    it('retorna 201 no registro bem-sucedido', async () => {
      const res = await request(app)
        .post('/register')
        .send({ username: 'newuser', password: 'Abcd1234@xyz', adminKey: 'test-admin-key' });
      expect(res.status).toBe(201);
      expect(res.body.message).toBe('usuário criado');
      expect(sqlite.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        expect.arrayContaining(['newuser']),
      );
    });

    it('cria usuario com role padrao "user"', async () => {
      const res = await request(app)
        .post('/register')
        .send({ username: 'defaultrole', password: 'Abcd1234@xyz', adminKey: 'test-admin-key' });
      expect(res.status).toBe(201);
      expect(sqlite.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        expect.arrayContaining(['defaultrole', expect.any(String), 'user']),
      );
    });

    it('cria usuario com role customizada', async () => {
      const res = await request(app)
        .post('/register')
        .send({ username: 'customrole', password: 'Abcd1234@xyz', adminKey: 'test-admin-key', role: 'admin' });
      expect(res.status).toBe(201);
      expect(sqlite.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        expect.arrayContaining(['customrole', expect.any(String), 'admin']),
      );
    });
  });

  describe('POST /login', () => {
    it('retorna 400 quando credenciais ausentes', async () => {
      const res = await request(app).post('/login').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('username');
    });

    it('retorna 401 para credenciais invalidas', async () => {
      const res = await request(app).post('/login').send({ username: 'nonexistent', password: 'Abcd1234@xyz' });
      expect(res.status).toBe(401);
    });

    it('retorna 200 com access_token no login valido', async () => {
      sqlite.get.mockReturnValue({
        id: 2,
        username: 'logintest',
        password_hash: 'hashed:mypassword',
        role: 'user',
      });
      const res = await request(app).post('/login').send({ username: 'logintest', password: 'mypassword' });
      expect(res.status).toBe(200);
      expect(res.body.access_token).toBeDefined();
      expect(typeof res.body.access_token).toBe('string');
      expect(res.body.expires_in).toBe(900);
    });

    it('define cookie refresh_token no login', async () => {
      sqlite.get.mockReturnValue({
        id: 1,
        username: 'cookieuser',
        password_hash: 'hashed:pass',
        role: 'user',
      });
      const res = await request(app).post('/login').send({ username: 'cookieuser', password: 'pass' });
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies.some((c) => c.startsWith('refresh_token='))).toBe(true);
    });
  });

  describe('POST /refresh', () => {
    it('retorna 401 sem refresh_token cookie', async () => {
      const res = await request(app).post('/refresh');
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('refresh');
    });

    it('retorna 401 com refresh token invalido', async () => {
      const res = await request(app).post('/refresh').set('Cookie', 'refresh_token=invalid-or-expired');
      expect(res.status).toBe(401);
    });

    it('retorna 200 com novo access_token para refresh valido', async () => {
      sqlite.get.mockReturnValue({
        user_id: 1,
        username: 'refreshtest',
        role: 'user',
        token_hash: expect.any(String),
        revoked: 0,
        expires_at: '2099-01-01 00:00:00',
      });
      const res = await request(app).post('/refresh').set('Cookie', 'refresh_token=valid-refresh-token');
      expect(res.status).toBe(200);
      expect(res.body.access_token).toBeDefined();
      expect(typeof res.body.access_token).toBe('string');
    });
  });

  describe('POST /logout', () => {
    it('retorna 401 sem token de autenticacao', async () => {
      const res = await request(app).post('/logout');
      expect(res.status).toBe(401);
    });

    it('retorna 200 no logout bem-sucedido', async () => {
      const token = jwt.sign({ id: 1, username: 'logoutuser', role: 'user' }, process.env.JWT_SECRET, {
        expiresIn: '15m',
      });
      const res = await request(app).post('/logout').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('logout ok');
    });

    it('revoga refresh token no logout', async () => {
      const token = jwt.sign({ id: 1, username: 'revokeuser', role: 'user' }, process.env.JWT_SECRET, {
        expiresIn: '15m',
      });
      const res = await request(app)
        .post('/logout')
        .set('Authorization', `Bearer ${token}`)
        .set('Cookie', 'refresh_token=some-token');
      expect(res.status).toBe(200);
    });
  });

  describe('GET /me', () => {
    it('retorna 401 sem autenticacao', async () => {
      const res = await request(app).get('/me');
      expect(res.status).toBe(401);
    });

    it('retorna dados do usuario com token valido', async () => {
      const token = jwt.sign({ id: 5, username: 'meuser', role: 'admin' }, process.env.JWT_SECRET, {
        expiresIn: '15m',
      });
      const res = await request(app).get('/me').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(5);
      expect(res.body.username).toBe('meuser');
      expect(res.body.role).toBe('admin');
    });

    it('retorna 401 com token expirado', async () => {
      const token = jwt.sign({ id: 1, username: 'expired', role: 'user' }, process.env.JWT_SECRET, { expiresIn: '0s' });
      await new Promise((r) => setTimeout(r, 100));
      const res = await request(app).get('/me').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('TOKEN_EXPIRED');
    });
  });
});
