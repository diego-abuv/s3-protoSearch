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
      sqlite.get.mockReturnValue({ total: 2 });
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
      sqlite.get
        .mockReturnValueOnce({ total: 5 })
        .mockReturnValueOnce({ total: 42 })
        .mockReturnValueOnce({ total: 2 })
        .mockReturnValueOnce({ total: 10 })
        .mockReturnValueOnce({ total: 0 })
        .mockReturnValueOnce({ total: 0 })
        .mockReturnValueOnce({ total: 0 })
        .mockReturnValueOnce({ avg_s: 1.5 });
      const res = await request(app).get('/admin/stats').set('Authorization', `Bearer ${makeAdminToken()}`);
      expect(res.status).toBe(200);
      expect(res.body.users).toBe(5);
      expect(res.body.audit_logs).toBe(42);
      expect(res.body.searches_today).toBe(10);
      expect(res.body.active_users).toBe(2);
    });

    it('retorna avg_duration_s com valor correto', async () => {
      sqlite.get
        .mockReturnValueOnce({ total: 1 })
        .mockReturnValueOnce({ total: 1 })
        .mockReturnValueOnce({ total: 1 })
        .mockReturnValueOnce({ total: 1 })
        .mockReturnValueOnce({ total: 0 })
        .mockReturnValueOnce({ total: 1 })
        .mockReturnValueOnce({ total: 1 })
        .mockReturnValueOnce({ avg_s: 3.25 });
      const res = await request(app).get('/admin/stats').set('Authorization', `Bearer ${makeAdminToken()}`);
      expect(res.status).toBe(200);
      expect(res.body.avg_duration_s).toBe(3.3);
    });
  });

  describe('PATCH /admin/users/:id/block', () => {
    it('retorna 401 sem autenticacao', async () => {
      const res = await request(app).patch('/admin/users/1/block');
      expect(res.status).toBe(401);
    });

    it('retorna 403 para usuario nao-admin', async () => {
      const res = await request(app).patch('/admin/users/1/block').set('Authorization', `Bearer ${makeUserToken()}`);
      expect(res.status).toBe(403);
    });

    it('retorna 404 quando usuario nao encontrado', async () => {
      sqlite.get.mockReturnValue(undefined);
      const res = await request(app).patch('/admin/users/999/block').set('Authorization', `Bearer ${makeAdminToken()}`);
      expect(res.status).toBe(404);
    });

    it('bloqueia usuario (blocked 0 -> 1)', async () => {
      sqlite.get.mockReturnValue({ id: 1, username: 'testuser', blocked: 0 });
      const res = await request(app).patch('/admin/users/1/block').set('Authorization', `Bearer ${makeAdminToken()}`);
      expect(res.status).toBe(200);
      expect(res.body.message).toContain('bloqueado');
      expect(sqlite.run).toHaveBeenCalledWith(expect.stringContaining('UPDATE users SET blocked'), [1, '1']);
    });

    it('desbloqueia usuario (blocked 1 -> 0)', async () => {
      sqlite.get.mockReturnValue({ id: 1, username: 'testuser', blocked: 1 });
      const res = await request(app).patch('/admin/users/1/block').set('Authorization', `Bearer ${makeAdminToken()}`);
      expect(res.status).toBe(200);
      expect(res.body.message).toContain('desbloqueado');
      expect(sqlite.run).toHaveBeenCalledWith(expect.stringContaining('UPDATE users SET blocked'), [0, '1']);
    });

    it('revoga tokens ao bloquear', async () => {
      sqlite.get.mockReturnValue({ id: 1, username: 'testuser', blocked: 0 });
      await request(app).patch('/admin/users/1/block').set('Authorization', `Bearer ${makeAdminToken()}`);
      expect(sqlite.run).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM refresh_tokens WHERE user_id'), [
        '1',
      ]);
    });

    it('registra audit admin_block_user', async () => {
      sqlite.get.mockReturnValue({ id: 1, username: 'testuser', blocked: 0 });
      await request(app).patch('/admin/users/1/block').set('Authorization', `Bearer ${makeAdminToken()}`);
      expect(sqlite.logAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'admin_block_user', target: 'testuser' }),
      );
    });

    it('registra audit admin_unblock_user', async () => {
      sqlite.get.mockReturnValue({ id: 1, username: 'testuser', blocked: 1 });
      await request(app).patch('/admin/users/1/block').set('Authorization', `Bearer ${makeAdminToken()}`);
      expect(sqlite.logAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'admin_unblock_user', target: 'testuser' }),
      );
    });
  });

  describe('POST /admin/users/:id/force-logout', () => {
    it('retorna 401 sem autenticacao', async () => {
      const res = await request(app).post('/admin/users/1/force-logout');
      expect(res.status).toBe(401);
    });

    it('retorna 403 para usuario nao-admin', async () => {
      const res = await request(app)
        .post('/admin/users/1/force-logout')
        .set('Authorization', `Bearer ${makeUserToken()}`);
      expect(res.status).toBe(403);
    });

    it('retorna 404 quando usuario nao encontrado', async () => {
      sqlite.get.mockReturnValue(undefined);
      const res = await request(app)
        .post('/admin/users/999/force-logout')
        .set('Authorization', `Bearer ${makeAdminToken()}`);
      expect(res.status).toBe(404);
    });

    it('deleta refresh_tokens do usuario', async () => {
      sqlite.get.mockReturnValue({ id: 1, username: 'testuser' });
      const res = await request(app)
        .post('/admin/users/1/force-logout')
        .set('Authorization', `Bearer ${makeAdminToken()}`);
      expect(res.status).toBe(200);
      expect(sqlite.run).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM refresh_tokens WHERE user_id'), [
        '1',
      ]);
    });

    it('registra audit admin_force_logout', async () => {
      sqlite.get.mockReturnValue({ id: 1, username: 'testuser' });
      await request(app).post('/admin/users/1/force-logout').set('Authorization', `Bearer ${makeAdminToken()}`);
      expect(sqlite.logAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'admin_force_logout', target: 'testuser' }),
      );
    });
  });

  describe('POST /admin/users/:id/reset-password', () => {
    it('retorna 401 sem autenticacao', async () => {
      const res = await request(app).post('/admin/users/1/reset-password').send({ password: 'NovaSenha123@' });
      expect(res.status).toBe(401);
    });

    it('retorna 403 para usuario nao-admin', async () => {
      const res = await request(app)
        .post('/admin/users/1/reset-password')
        .set('Authorization', `Bearer ${makeUserToken()}`)
        .send({ password: 'NovaSenha123@' });
      expect(res.status).toBe(403);
    });

    it('retorna 404 quando usuario nao encontrado', async () => {
      sqlite.get.mockReturnValue(undefined);
      const res = await request(app)
        .post('/admin/users/999/reset-password')
        .set('Authorization', `Bearer ${makeAdminToken()}`)
        .send({ password: 'NovaSenha123@' });
      expect(res.status).toBe(404);
    });

    it('retorna 400 para senha fraca', async () => {
      sqlite.get.mockReturnValue({ id: 1, username: 'testuser' });
      const res = await request(app)
        .post('/admin/users/1/reset-password')
        .set('Authorization', `Bearer ${makeAdminToken()}`)
        .send({ password: '123' });
      expect(res.status).toBe(400);
    });

    it('retorna 400 quando password ausente', async () => {
      sqlite.get.mockReturnValue({ id: 1, username: 'testuser' });
      const res = await request(app)
        .post('/admin/users/1/reset-password')
        .set('Authorization', `Bearer ${makeAdminToken()}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('atualiza senha do usuario', async () => {
      sqlite.get.mockReturnValue({ id: 1, username: 'testuser' });
      const res = await request(app)
        .post('/admin/users/1/reset-password')
        .set('Authorization', `Bearer ${makeAdminToken()}`)
        .send({ password: 'NovaSenha123@' });
      expect(res.status).toBe(200);
      expect(sqlite.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET password_hash'),
        expect.arrayContaining([expect.stringContaining('hashed:')]),
      );
    });

    it('registra audit admin_reset_password', async () => {
      sqlite.get.mockReturnValue({ id: 1, username: 'testuser' });
      await request(app)
        .post('/admin/users/1/reset-password')
        .set('Authorization', `Bearer ${makeAdminToken()}`)
        .send({ password: 'NovaSenha123@' });
      expect(sqlite.logAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'admin_reset_password', target: 'testuser' }),
      );
    });
  });

  describe('GET /admin/users - status online', () => {
    it('retorna campo is_online para cada usuario', async () => {
      sqlite.get.mockReturnValue({ total: 2 });
      sqlite.all.mockReturnValue([
        { id: 1, username: 'admin', role: 'admin', blocked: 0, last_login: '2026-01-01', is_online: 1 },
        { id: 2, username: 'user1', role: 'user', blocked: 0, last_login: null, is_online: 0 },
      ]);
      const res = await request(app).get('/admin/users').set('Authorization', `Bearer ${makeAdminToken()}`);
      expect(res.status).toBe(200);
      expect(res.body.users[0].is_online).toBe(1);
      expect(res.body.users[1].is_online).toBe(0);
    });

    it('retorna campo blocked para cada usuario', async () => {
      sqlite.get.mockReturnValue({ total: 2 });
      sqlite.all.mockReturnValue([
        { id: 1, username: 'admin', role: 'admin', blocked: 0, last_login: null, is_online: 0 },
        { id: 2, username: 'blocked_user', role: 'user', blocked: 1, last_login: null, is_online: 0 },
      ]);
      const res = await request(app).get('/admin/users').set('Authorization', `Bearer ${makeAdminToken()}`);
      expect(res.status).toBe(200);
      expect(res.body.users[1].blocked).toBe(1);
    });

    it('retorna campo last_login para cada usuario', async () => {
      sqlite.get.mockReturnValue({ total: 1 });
      sqlite.all.mockReturnValue([
        { id: 1, username: 'admin', role: 'admin', blocked: 0, last_login: '2026-07-15 10:00:00', is_online: 1 },
      ]);
      const res = await request(app).get('/admin/users').set('Authorization', `Bearer ${makeAdminToken()}`);
      expect(res.status).toBe(200);
      expect(res.body.users[0].last_login).toBe('2026-07-15 10:00:00');
    });
  });

  describe('GET /admin/audit - filtros', () => {
    it('filtra por username', async () => {
      sqlite.all.mockReturnValue([{ id: 1, action: 'login', username: 'user1', created_at: '2026-01-01' }]);
      sqlite.get.mockReturnValue({ total: 1 });
      const res = await request(app).get('/admin/audit?user=user1').set('Authorization', `Bearer ${makeAdminToken()}`);
      expect(res.status).toBe(200);
      expect(sqlite.all).toHaveBeenCalledWith(
        expect.stringContaining('username = ?'),
        expect.arrayContaining(['user1']),
      );
    });

    it('filtra por action', async () => {
      sqlite.all.mockReturnValue([]);
      sqlite.get.mockReturnValue({ total: 0 });
      const res = await request(app)
        .get('/admin/audit?action=login')
        .set('Authorization', `Bearer ${makeAdminToken()}`);
      expect(res.status).toBe(200);
      expect(sqlite.all).toHaveBeenCalledWith(expect.stringContaining('action = ?'), expect.arrayContaining(['login']));
    });

    it('filtra por periodo (from/to)', async () => {
      sqlite.all.mockReturnValue([]);
      sqlite.get.mockReturnValue({ total: 0 });
      const res = await request(app)
        .get('/admin/audit?from=2026-01-01&to=2026-12-31')
        .set('Authorization', `Bearer ${makeAdminToken()}`);
      expect(res.status).toBe(200);
      expect(sqlite.all).toHaveBeenCalledWith(
        expect.stringContaining('date(created_at) >= ?'),
        expect.arrayContaining(['2026-01-01']),
      );
      expect(sqlite.all).toHaveBeenCalledWith(
        expect.stringContaining('date(created_at) <= ?'),
        expect.arrayContaining(['2026-12-31']),
      );
    });

    it('combina multiplos filtros', async () => {
      sqlite.all.mockReturnValue([]);
      sqlite.get.mockReturnValue({ total: 0 });
      const res = await request(app)
        .get('/admin/audit?user=user1&action=login&from=2026-01-01')
        .set('Authorization', `Bearer ${makeAdminToken()}`);
      expect(res.status).toBe(200);
      expect(sqlite.all).toHaveBeenCalledWith(
        expect.stringContaining('username = ?'),
        expect.arrayContaining(['user1', 'login', '2026-01-01']),
      );
    });

    it('retorna total correto com filtros', async () => {
      sqlite.all.mockReturnValue([{ id: 1, action: 'login', username: 'user1' }]);
      sqlite.get.mockReturnValue({ total: 5 });
      const res = await request(app).get('/admin/audit?user=user1').set('Authorization', `Bearer ${makeAdminToken()}`);
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(5);
    });
  });

  describe('GET /admin/audit/export', () => {
    it('retorna 401 sem autenticacao', async () => {
      const res = await request(app).get('/admin/audit/export');
      expect(res.status).toBe(401);
    });

    it('retorna 403 para usuario nao-admin', async () => {
      const res = await request(app).get('/admin/audit/export').set('Authorization', `Bearer ${makeUserToken()}`);
      expect(res.status).toBe(403);
    });

    it('retorna Content-Type text/csv', async () => {
      sqlite.all.mockReturnValue([]);
      const res = await request(app).get('/admin/audit/export').set('Authorization', `Bearer ${makeAdminToken()}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
    });

    it('retorna CSV com cabecalho correto', async () => {
      sqlite.all.mockReturnValue([]);
      const res = await request(app).get('/admin/audit/export').set('Authorization', `Bearer ${makeAdminToken()}`);
      expect(res.status).toBe(200);
      expect(res.text).toContain('id,user_id,username,action,target,details,ip,created_at');
    });

    it('respeita filtros', async () => {
      sqlite.all.mockReturnValue([]);
      await request(app).get('/admin/audit/export?user=user1').set('Authorization', `Bearer ${makeAdminToken()}`);
      expect(sqlite.all).toHaveBeenCalledWith(
        expect.stringContaining('username = ?'),
        expect.arrayContaining(['user1']),
      );
    });

    it('aplica filtro from no export com date()', async () => {
      sqlite.all.mockReturnValue([]);
      await request(app)
        .get('/admin/audit/export?from=2026-06-01')
        .set('Authorization', `Bearer ${makeAdminToken()}`);
      expect(sqlite.all).toHaveBeenCalledWith(
        expect.stringContaining('date(created_at) >= ?'),
        expect.arrayContaining(['2026-06-01']),
      );
    });

    it('aplica filtro from e to no export com date()', async () => {
      sqlite.all.mockReturnValue([]);
      await request(app)
        .get('/admin/audit/export?from=2026-06-01&to=2026-06-30')
        .set('Authorization', `Bearer ${makeAdminToken()}`);
      const sql = sqlite.all.mock.calls[sqlite.all.mock.calls.length - 1][0];
      expect(sql).toContain('date(created_at) >= ?');
      expect(sql).toContain('date(created_at) <= ?');
    });

    it('limita a 10000 registros sem filtro', async () => {
      sqlite.all.mockReturnValue([]);
      await request(app).get('/admin/audit/export').set('Authorization', `Bearer ${makeAdminToken()}`);
      expect(sqlite.all).toHaveBeenCalledWith(expect.stringContaining('10000'), expect.any(Array));
    });

    it('aplica filtro to no export', async () => {
      sqlite.all.mockReturnValue([]);
      await request(app)
        .get('/admin/audit/export?to=2026-12-31')
        .set('Authorization', `Bearer ${makeAdminToken()}`);
      expect(sqlite.all).toHaveBeenCalledWith(
        expect.stringContaining('date(created_at) <= ?'),
        expect.arrayContaining(['2026-12-31']),
      );
    });
  });

  describe('GET /admin/stats/chart', () => {
    it('retorna 401 sem autenticacao', async () => {
      const res = await request(app).get('/admin/stats/chart');
      expect(res.status).toBe(401);
    });

    it('retorna 403 para usuario nao-admin', async () => {
      const res = await request(app).get('/admin/stats/chart').set('Authorization', `Bearer ${makeUserToken()}`);
      expect(res.status).toBe(403);
    });

    it('retorna 200 com array de 7 dias', async () => {
      sqlite.all.mockReturnValue([
        { day: '2026-07-10', total: 5 },
        { day: '2026-07-11', total: 3 },
      ]);
      const res = await request(app).get('/admin/stats/chart').set('Authorization', `Bearer ${makeAdminToken()}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('retorna dados com day e total', async () => {
      sqlite.all.mockReturnValue([{ day: '2026-07-10', total: 5 }]);
      const res = await request(app).get('/admin/stats/chart').set('Authorization', `Bearer ${makeAdminToken()}`);
      expect(res.status).toBe(200);
      expect(res.body.data[0]).toHaveProperty('day');
      expect(res.body.data[0]).toHaveProperty('total');
    });
  });
});
