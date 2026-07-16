import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';

vi.mock('fs', () => {
  const mockFs = {
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
  return { ...mockFs, default: mockFs };
});

import { initDatabase, getDb, get, all, run, save, logAudit } from '../../src/db/sqlite.js';

describe('sem initDatabase', () => {
  it('getDb() lanca erro antes de init', () => {
    expect(() => getDb()).toThrow('Database not initialized');
  });

  it('save() nao crasha sem db', () => {
    expect(() => save()).not.toThrow();
  });
});

describe('com initDatabase', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  afterEach(() => {
    run('DELETE FROM users');
    run('DELETE FROM refresh_tokens');
    run('DELETE FROM audit_log');
  });

  it('get() retorna unica linha', () => {
    run('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', ['test', 'hash', 'user']);
    const row = get('SELECT * FROM users WHERE username = ?', ['test']);
    expect(row).toEqual({
      id: 1,
      username: 'test',
      password_hash: 'hash',
      role: 'user',
      blocked: 0,
      created_at: expect.any(String),
    });
  });

  it('get() retorna undefined sem resultado', () => {
    const row = get('SELECT * FROM users WHERE username = ?', ['nonexistent']);
    expect(row).toBeUndefined();
  });

  it('all() retorna array', () => {
    run('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', ['a', 'h', 'u']);
    run('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', ['b', 'h', 'u']);
    run('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', ['c', 'h', 'u']);
    const rows = all('SELECT * FROM users ORDER BY username');
    expect(rows).toHaveLength(3);
    expect(rows[0].username).toBe('a');
    expect(rows[2].username).toBe('c');
  });

  it('all() retorna array vazio', () => {
    const rows = all('SELECT * FROM users WHERE username = ?', ['nonexistent']);
    expect(rows).toEqual([]);
  });

  it('run() executa INSERT', () => {
    run('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', ['inserted', 'hash', 'user']);
    const row = get('SELECT username FROM users WHERE username = ?', ['inserted']);
    expect(row.username).toBe('inserted');
  });

  it('run() executa UPDATE', () => {
    run('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', ['target', 'hash', 'user']);
    run('UPDATE users SET role = ? WHERE username = ?', ['admin', 'target']);
    const row = get('SELECT role FROM users WHERE username = ?', ['target']);
    expect(row.role).toBe('admin');
  });

  it('run() executa DELETE', () => {
    run('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', ['todelete', 'hash', 'user']);
    run('DELETE FROM users WHERE username = ?', ['todelete']);
    const row = get('SELECT * FROM users WHERE username = ?', ['todelete']);
    expect(row).toBeUndefined();
  });

  it('logAudit() insere em audit_log', () => {
    run('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', ['logger', 'hash', 'user']);
    const user = get('SELECT id FROM users WHERE username = ?', ['logger']);
    logAudit({ user_id: user.id, username: 'logger', action: 'login', target: null, details: null, ip: '127.0.0.1' });
    const log = get('SELECT * FROM audit_log WHERE username = ?', ['logger']);
    expect(log).toBeDefined();
    expect(log.action).toBe('login');
    expect(log.ip).toBe('127.0.0.1');
  });

  it('logAudit() nao crasha com campos vazios', () => {
    expect(() => logAudit({ user_id: null, username: 'system', action: 'test' })).not.toThrow();
  });

  it('prepared statement protege contra SQL injection', () => {
    run('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', [
      "malicious'; DROP TABLE users; --",
      'hash',
      'user',
    ]);
    expect(() => all('SELECT * FROM users')).not.toThrow();
    const row = get('SELECT username FROM users WHERE username = ?', ["malicious'; DROP TABLE users; --"]);
    expect(row).toBeDefined();
  });

  it('all() propaga erro em SQL invalido', () => {
    expect(() => all('SELECT * FROM nonexistent_table')).toThrow();
  });
});
