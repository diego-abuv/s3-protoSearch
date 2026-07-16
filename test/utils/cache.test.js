import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

let cacheGet, cacheSet, cacheDel;
let _resetRedis;
let mockRedis;

vi.hoisted(() => {
  process.env.REDIS_URL = 'redis://localhost:6379';
});

vi.mock('ioredis', () => {
  const instance = {
    get: vi.fn(),
    setex: vi.fn(),
    keys: vi.fn(),
    del: vi.fn(),
    on: vi.fn().mockReturnThis(),
  };
  mockRedis = instance;
  return {
    default: function () {
      return instance;
    },
  };
});

describe('com REDIS_URL', () => {
  beforeAll(async () => {
    const mod = await import('../../src/utils/cache.js');
    cacheGet = mod.cacheGet;
    cacheSet = mod.cacheSet;
    cacheDel = mod.cacheDel;
    _resetRedis = mod._resetRedis;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    _resetRedis();
  });

  it('cacheGet retorna valor parseado quando chave existe', async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify({ data: 'value' }));
    const result = await cacheGet('mykey');
    expect(result).toEqual({ data: 'value' });
    expect(mockRedis.get).toHaveBeenCalledWith('mykey');
  });

  it('cacheGet retorna null quando chave nao existe', async () => {
    mockRedis.get.mockResolvedValue(null);
    const result = await cacheGet('missing');
    expect(result).toBeNull();
  });

  it('cacheGet retorna null quando Redis falha', async () => {
    mockRedis.get.mockRejectedValue(new Error('connection error'));
    const result = await cacheGet('mykey');
    expect(result).toBeNull();
  });

  it('cacheSet chama setex com key, ttl e JSON', async () => {
    await cacheSet('mykey', { data: 'value' }, 300);
    expect(mockRedis.setex).toHaveBeenCalledWith('mykey', 300, JSON.stringify({ data: 'value' }));
  });

  it('cacheSet usa TTL padrao quando nao especificado', async () => {
    await cacheSet('mykey', 'value');
    expect(mockRedis.setex).toHaveBeenCalledWith('mykey', 300, JSON.stringify('value'));
  });

  it('cacheSet nao lanca quando Redis falha', async () => {
    mockRedis.setex.mockRejectedValue(new Error('error'));
    await expect(cacheSet('mykey', 'value')).resolves.toBeUndefined();
  });

  it('cacheDel chama keys e del', async () => {
    mockRedis.keys.mockResolvedValue(['key1', 'key2']);
    await cacheDel('pattern:*');
    expect(mockRedis.keys).toHaveBeenCalledWith('pattern:*');
    expect(mockRedis.del).toHaveBeenCalledWith('key1', 'key2');
  });

  it('cacheDel nao chama del quando keys vazio', async () => {
    mockRedis.keys.mockResolvedValue([]);
    await cacheDel('pattern:*');
    expect(mockRedis.del).not.toHaveBeenCalled();
  });

  it('cacheDel nao lanca quando Redis falha', async () => {
    mockRedis.keys.mockRejectedValue(new Error('error'));
    await expect(cacheDel('pattern:*')).resolves.toBeUndefined();
  });
});

describe('sem REDIS_URL', () => {
  beforeAll(async () => {
    const mod = await import('../../src/utils/cache.js');
    cacheGet = mod.cacheGet;
    cacheSet = mod.cacheSet;
    cacheDel = mod.cacheDel;
    _resetRedis = mod._resetRedis;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.REDIS_URL;
    _resetRedis();
  });

  it('cacheGet retorna null sem REDIS_URL', async () => {
    const result = await cacheGet('any');
    expect(result).toBeNull();
    expect(mockRedis.get).not.toHaveBeenCalled();
  });

  it('cacheSet nao faz nada sem REDIS_URL', async () => {
    await cacheSet('any', 'value');
    expect(mockRedis.setex).not.toHaveBeenCalled();
  });

  it('cacheDel nao faz nada sem REDIS_URL', async () => {
    await cacheDel('any');
    expect(mockRedis.keys).not.toHaveBeenCalled();
  });
});
