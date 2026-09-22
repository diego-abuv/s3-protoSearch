import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

vi.mock('jsonwebtoken');

vi.mock('../../src/db/sqlite.js', () => ({
  get: vi.fn(),
}));

process.env.JWT_SECRET = 'test-secret';
process.env.API_KEY = 'my-secret-api-key';

async function importMiddleware() {
  const mod = await import('../../src/middleware/auth.js');
  return mod;
}

function mockReq(overrides = {}) {
  return {
    headers: {},
    cookies: {},
    ...overrides,
  };
}

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('jwtMiddleware', () => {
  let jwtMiddleware;
  let sqlite;

  beforeEach(async () => {
    vi.clearAllMocks();
    sqlite = await import('../../src/db/sqlite.js');
    sqlite.get.mockReset();
    const mod = await importMiddleware();
    jwtMiddleware = mod.jwtMiddleware;
  });

  it('retorna 401 se Authorization header ausente', () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    jwtMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token não fornecido' });
    expect(next).not.toHaveBeenCalled();
  });

  it('retorna 401 se Authorization nao comeca com Bearer', () => {
    const req = mockReq({ headers: { authorization: 'Basic token' } });
    const res = mockRes();
    const next = vi.fn();

    jwtMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token não fornecido' });
    expect(next).not.toHaveBeenCalled();
  });

  it('retorna 401 se token expirou', () => {
    jwt.verify.mockImplementation(() => {
      const err = new Error('jwt expired');
      err.name = 'TokenExpiredError';
      throw err;
    });

    const req = mockReq({ headers: { authorization: 'Bearer expired.token.here' } });
    const res = mockRes();
    const next = vi.fn();

    jwtMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token expirado', code: 'TOKEN_EXPIRED' });
    expect(next).not.toHaveBeenCalled();
  });

  it('retorna 401 se token invalido', () => {
    jwt.verify.mockImplementation(() => {
      throw new Error('invalid signature');
    });

    const req = mockReq({ headers: { authorization: 'Bearer bad.token.here' } });
    const res = mockRes();
    const next = vi.fn();

    jwtMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token inválido' });
    expect(next).not.toHaveBeenCalled();
  });

  it('chama next() e define req.user se token valido e sessao ativa', () => {
    const decodedUser = { id: 1, username: 'test', role: 'user' };
    jwt.verify.mockReturnValue(decodedUser);
    sqlite.get.mockReturnValue({ token_hash: 'abc123' });

    const req = mockReq({ headers: { authorization: 'Bearer valid.token.here' } });
    const res = mockRes();
    const next = vi.fn();

    jwtMiddleware(req, res, next);

    expect(jwt.verify).toHaveBeenCalledWith('valid.token.here', 'test-secret');
    expect(req.user).toEqual(decodedUser);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('retorna 401 SESSION_REVOKED se nao ha sessao ativa', () => {
    const decodedUser = { id: 1, username: 'test', role: 'user' };
    jwt.verify.mockReturnValue(decodedUser);
    sqlite.get.mockReturnValue(undefined);

    const req = mockReq({ headers: { authorization: 'Bearer valid.token.here' } });
    const res = mockRes();
    const next = vi.fn();

    jwtMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Sessão revogada', code: 'SESSION_REVOKED' });
    expect(next).not.toHaveBeenCalled();
  });

  it('nao chama get do sqlite se token invalido', () => {
    jwt.verify.mockImplementation(() => {
      throw new Error('invalid signature');
    });

    const req = mockReq({ headers: { authorization: 'Bearer bad.token.here' } });
    const res = mockRes();
    const next = vi.fn();

    jwtMiddleware(req, res, next);

    expect(sqlite.get).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});

describe('apiKeyMiddleware', () => {
  let apiKeyMiddleware;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await importMiddleware();
    apiKeyMiddleware = mod.apiKeyMiddleware;
  });

  it('retorna 403 se X-API-Key ausente', () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    apiKeyMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'API key inválida' });
    expect(next).not.toHaveBeenCalled();
  });

  it('retorna 403 se X-API-Key incorreta', () => {
    const req = mockReq({ headers: { 'x-api-key': 'wrong-key' } });
    const res = mockRes();
    const next = vi.fn();

    apiKeyMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'API key inválida' });
    expect(next).not.toHaveBeenCalled();
  });

  it('chama next() e define req.user se API key valida', () => {
    const req = mockReq({ headers: { 'x-api-key': 'my-secret-api-key' } });
    const res = mockRes();
    const next = vi.fn();

    apiKeyMiddleware(req, res, next);

    expect(req.user).toEqual({ id: 0, username: 'api', role: 'api' });
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('authMiddleware', () => {
  let authMiddleware;
  let sqlite;

  beforeEach(async () => {
    vi.clearAllMocks();
    sqlite = await import('../../src/db/sqlite.js');
    sqlite.get.mockReset();
    const mod = await importMiddleware();
    authMiddleware = mod.authMiddleware;
  });

  it('usa apiKeyMiddleware se X-API-Key presente', () => {
    const req = mockReq({ headers: { 'x-api-key': 'my-secret-api-key' } });
    const res = mockRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(req.user).toEqual({ id: 0, username: 'api', role: 'api' });
    expect(next).toHaveBeenCalledOnce();
  });

  it('usa jwtMiddleware se X-API-Key ausente', () => {
    jwt.verify.mockReturnValue({ id: 1, username: 'test', role: 'user' });
    sqlite.get.mockReturnValue({ token_hash: 'active-session-hash' });

    const req = mockReq({ headers: { authorization: 'Bearer valid.token.here' } });
    const res = mockRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(req.user).toEqual({ id: 1, username: 'test', role: 'user' });
    expect(next).toHaveBeenCalledOnce();
  });

  it('retorna 401 se nenhum token fornecido', () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token não fornecido' });
    expect(next).not.toHaveBeenCalled();
  });
});

describe('adminMiddleware', () => {
  let adminMiddleware;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await importMiddleware();
    adminMiddleware = mod.adminMiddleware;
  });

  it('retorna 403 se role nao for admin', () => {
    const req = mockReq({ user: { id: 1, username: 'test', role: 'user' } });
    const res = mockRes();
    const next = vi.fn();

    adminMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Acesso restrito a administradores' });
    expect(next).not.toHaveBeenCalled();
  });

  it('chama next() se role for admin', () => {
    const req = mockReq({ user: { id: 1, username: 'admin', role: 'admin' } });
    const res = mockRes();
    const next = vi.fn();

    adminMiddleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('retorna 403 se req.user nao existe', () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    adminMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('hasActiveSession', () => {
  let hasActiveSession;
  let sqlite;

  beforeEach(async () => {
    vi.clearAllMocks();
    sqlite = await import('../../src/db/sqlite.js');
    sqlite.get.mockReset();
    const mod = await importMiddleware();
    hasActiveSession = mod.hasActiveSession;
  });

  it('retorna true se existe sessao ativa', () => {
    sqlite.get.mockReturnValue({ token_hash: 'abc' });
    expect(hasActiveSession(1)).toBe(true);
    expect(sqlite.get).toHaveBeenCalledWith(
      expect.stringContaining('refresh_tokens'),
      [1],
    );
  });

  it('retorna false se nao ha sessao ativa', () => {
    sqlite.get.mockReturnValue(undefined);
    expect(hasActiveSession(99)).toBe(false);
  });
});
