import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-jwt-secret';
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

function makeAdminToken() {
  return jwt.sign({ id: 1, username: 'adminuser', role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '15m' });
}

function makeUserToken() {
  return jwt.sign({ id: 2, username: 'regularuser', role: 'user' }, process.env.JWT_SECRET, { expiresIn: '15m' });
}

describe('Admin Routes', () => {
  let app;
  let sqlite;

  beforeAll(async () => {
    app = await createApp({ findFileAndGetSignedUrl: vi.fn() });
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    sqlite = await import('../../src/db/sqlite.js');
    sqlite.get.mockReset();
    sqlite.all.mockReset();
    sqlite.run.mockReset();
    sqlite.save.mockReset();
    sqlite.logAudit.mockReset();
  });

  describe('GET /admin/users', () => {
    it('retorna 401 sem autenticacao', async () => {
      const res = await request(app).get('/admin/users');
      expect(res.status).toBe(401);
    });

    it('retorna 403 para usuario nao-admin', async () => {
      const res = await request(app).get('/admin/users').set('Authorization', `Bearer ${makeUserToken()}`);
      expect(res.status).toBe(403);
    });

    it('retorna 200 com lista de usuarios para admin', async () => {
      sqlite.all.mockReturnValue([
        { id: 1, username: 'admin', role: 'admin' },
        { id: 2, username: 'user1', role: 'user' },
      ]);
      const res = await request(app).get('/admin/users').set('Authorization', `Bearer ${makeAdminToken()}`);
      expect(res.status).toBe(200);
      expect(res.body.users).toHaveLength(2);
      expect(res.body.message).toBe('Lista de usuários');
    });
  });

  describe('POST /admin/users', () => {
    it('retorna 401 sem autenticacao', async () => {
      const res = await request(app).post('/admin/users').send({ username: 'newadmin', password: 'Abcd1234@xyz' });
      expect(res.status).toBe(401);
    });

    it('retorna 403 para usuario nao-admin', async () => {
      const res = await request(app)
        .post('/admin/users')
        .set('Authorization', `Bearer ${makeUserToken()}`)
        .send({ username: 'newadmin', password: 'Abcd1234@xyz' });
      expect(res.status).toBe(403);
    });

    it('retorna 400 quando username ausente', async () => {
      const res = await request(app)
        .post('/admin/users')
        .set('Authorization', `Bearer ${makeAdminToken()}`)
        .send({ password: 'Abcd1234@xyz' });
      expect(res.status).toBe(400);
    });

    it('retorna 400 quando password ausente', async () => {
      const res = await request(app)
        .post('/admin/users')
        .set('Authorization', `Bearer ${makeAdminToken()}`)
        .send({ username: 'newadmin' });
      expect(res.status).toBe(400);
    });

    it('retorna 409 quando username ja existe', async () => {
      sqlite.get.mockReturnValue({ id: 1 });
      const res = await request(app)
        .post('/admin/users')
        .set('Authorization', `Bearer ${makeAdminToken()}`)
        .send({ username: 'existing', password: 'Abcd1234@xyz' });
      expect(res.status).toBe(409);
    });

    it('retorna 201 na criacao bem-sucedida', async () => {
      const res = await request(app)
        .post('/admin/users')
        .set('Authorization', `Bearer ${makeAdminToken()}`)
        .send({ username: 'newadmin', password: 'Abcd1234@xyz', role: 'admin' });
      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Usuário criado com sucesso');
      expect(sqlite.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        expect.arrayContaining(['newadmin']),
      );
    });
  });

  describe('PATCH /admin/users/:id', () => {
    it('retorna 401 sem autenticacao', async () => {
      const res = await request(app).patch('/admin/users/1').send({ username: 'updated' });
      expect(res.status).toBe(401);
    });

    it('retorna 403 para usuario nao-admin', async () => {
      const res = await request(app)
        .patch('/admin/users/1')
        .set('Authorization', `Bearer ${makeUserToken()}`)
        .send({ username: 'updated' });
      expect(res.status).toBe(403);
    });

    it('retorna 404 quando usuario nao encontrado', async () => {
      sqlite.get.mockReturnValue(undefined);
      const res = await request(app)
        .patch('/admin/users/999')
        .set('Authorization', `Bearer ${makeAdminToken()}`)
        .send({ username: 'updated' });
      expect(res.status).toBe(404);
    });

    it('retorna 200 na atualizacao bem-sucedida', async () => {
      sqlite.get.mockReturnValue({ id: 1, username: 'oldname', role: 'user' });
      const res = await request(app)
        .patch('/admin/users/1')
        .set('Authorization', `Bearer ${makeAdminToken()}`)
        .send({ username: 'newname', role: 'admin' });
      expect(res.status).toBe(200);
      expect(sqlite.run).toHaveBeenCalled();
    });
  });

  describe('DELETE /admin/users/:id', () => {
    it('retorna 401 sem autenticacao', async () => {
      const res = await request(app).delete('/admin/users/1');
      expect(res.status).toBe(401);
    });

    it('retorna 403 para usuario nao-admin', async () => {
      const res = await request(app).delete('/admin/users/1').set('Authorization', `Bearer ${makeUserToken()}`);
      expect(res.status).toBe(403);
    });

    it('retorna 404 quando usuario nao encontrado', async () => {
      sqlite.get.mockReturnValue(undefined);
      const res = await request(app).delete('/admin/users/999').set('Authorization', `Bearer ${makeAdminToken()}`);
      expect(res.status).toBe(404);
    });

    it('retorna 200 na exclusao bem-sucedida', async () => {
      sqlite.get.mockReturnValue({ id: 1, username: 'todelete', role: 'user' });
      const res = await request(app).delete('/admin/users/1').set('Authorization', `Bearer ${makeAdminToken()}`);
      expect(res.status).toBe(200);
      expect(sqlite.run).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM users'), ['1']);
    });
  });

  describe('GET /admin/audit', () => {
    it('retorna 401 sem autenticacao', async () => {
      const res = await request(app).get('/admin/audit');
      expect(res.status).toBe(401);
    });

    it('retorna 403 para usuario nao-admin', async () => {
      const res = await request(app).get('/admin/audit').set('Authorization', `Bearer ${makeUserToken()}`);
      expect(res.status).toBe(403);
    });

    it('retorna 200 com logs de auditoria', async () => {
      sqlite.all.mockReturnValue([{ id: 1, action: 'login', username: 'user1', created_at: '2026-01-01' }]);
      sqlite.get.mockReturnValue({ total: 1 });
      const res = await request(app).get('/admin/audit').set('Authorization', `Bearer ${makeAdminToken()}`);
      expect(res.status).toBe(200);
      expect(res.body.logs).toHaveLength(1);
      expect(res.body.total).toBe(1);
    });

    it('aplica limit e offset padrao', async () => {
      sqlite.all.mockReturnValue([]);
      sqlite.get.mockReturnValue({ total: 0 });
      const res = await request(app).get('/admin/audit').set('Authorization', `Bearer ${makeAdminToken()}`);
      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(50);
      expect(res.body.offset).toBe(0);
    });
  });

  describe('GET /admin/stats', () => {
    it('retorna 401 sem autenticacao', async () => {
      const res = await request(app).get('/admin/stats');
      expect(res.status).toBe(401);
    });

    it('retorna 403 para usuario nao-admin', async () => {
      const res = await request(app).get('/admin/stats').set('Authorization', `Bearer ${makeUserToken()}`);
      expect(res.status).toBe(403);
    });

    it('retorna 200 com estatisticas', async () => {
      sqlite.get.mockReturnValueOnce({ total: 5 }).mockReturnValueOnce({ total: 42 }).mockReturnValueOnce({ total: 3 });
      const res = await request(app).get('/admin/stats').set('Authorization', `Bearer ${makeAdminToken()}`);
      expect(res.status).toBe(200);
      expect(res.body.users).toBe(5);
      expect(res.body.audit_logs).toBe(42);
      expect(res.body.active_sessions).toBe(3);
    });
  });
});
