import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.REDIS_URL = 'redis://localhost:6379';
});

vi.mock('../../src/utils/cache.js', () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  cacheDel: vi.fn(),
}));

vi.mock('../../src/services/s3SearchService.js', () => ({
  findFileAndGetSignedUrl: vi.fn(),
}));

vi.mock('../../src/services/localSearchService.js', () => ({
  findFileAndGetSignedUrl: vi.fn(),
}));

import { cacheGet, cacheSet } from '../../src/utils/cache.js';
import { findFileAndGetSignedUrl as findInS3 } from '../../src/services/s3SearchService.js';
import { findFileAndGetSignedUrl as findLocally } from '../../src/services/localSearchService.js';

describe('findFileAndGetSignedUrl', () => {
  let findFileAndGetSignedUrl;

  beforeAll(async () => {
    const mod = await import('../../src/services/unifiedSearchService.js');
    findFileAndGetSignedUrl = mod.findFileAndGetSignedUrl;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    cacheGet.mockReset();
    cacheSet.mockReset();
  });

  it('retorna resultado do S3 quando S3 encontra', async () => {
    findInS3.mockResolvedValue({
      arquivos: [{ downloadUrl: '/download-s3?key=file.mp3', nomeParaDownload: 'file.mp3' }],
      _meta: { bucket: 'test-bucket', prefixes: ['2024/01/02/'], cache: false },
    });

    const result = await findFileAndGetSignedUrl('2024/01/02', 'protocolo');

    expect(result.arquivos).toHaveLength(1);
    expect(result.arquivos[0].nomeParaDownload).toBe('file.mp3');
    expect(result.status).toEqual({ s3: 'ok', local: 'nao_consultado' });
    expect(findLocally).not.toHaveBeenCalled();
  });

  it('retorna resultado local quando S3 nao encontra', async () => {
    findInS3.mockResolvedValue({ arquivos: null, _meta: { bucket: 'test-bucket', prefixes: [], cache: false } });
    findLocally.mockResolvedValue({
      arquivos: [{ downloadUrl: '/download-local?file=/mnt/share/file.mp3', nomeParaDownload: 'file.mp3' }],
      _meta: { servers: ['STORAGE'] },
    });

    const result = await findFileAndGetSignedUrl('2024/01/02', 'protocolo');

    expect(result.arquivos).toHaveLength(1);
    expect(result.status).toEqual({ s3: 'nao_encontrado', local: 'ok' });
    expect(result._meta.tempo_local).toMatch(/^\d+\.\d{2}s$/);
    expect(result._meta.cache).toBe(false);
  });

  it('retorna resultado local quando S3 lanca erro', async () => {
    findInS3.mockRejectedValue(new Error('AccessDenied'));
    findLocally.mockResolvedValue({
      arquivos: [{ downloadUrl: '/download-local?file=/mnt/share/file.mp3', nomeParaDownload: 'file.mp3' }],
      _meta: { servers: ['STORAGE'] },
    });

    const result = await findFileAndGetSignedUrl('2024/01/02', 'protocolo');

    expect(result.arquivos).toHaveLength(1);
    expect(result.status.s3).toContain('erro');
    expect(result.status.local).toBe('ok');
  });

  it('retorna arquivos null quando todas fontes falham', async () => {
    findInS3.mockResolvedValue({ arquivos: null, _meta: { bucket: 'test-bucket', prefixes: [], cache: false } });
    findLocally.mockResolvedValue({ arquivos: null, _meta: { servers: [] } });

    const result = await findFileAndGetSignedUrl('2024/01/02', 'protocolo');

    expect(result.arquivos).toBeNull();
    expect(result.status.s3).toBe('nao_encontrado');
    expect(result.status.local).toBe('nao_encontrado');
  });

  it('retorna status erro quando local retorna objeto erro', async () => {
    findInS3.mockResolvedValue({ arquivos: null, _meta: { bucket: 'test-bucket', prefixes: [], cache: false } });
    findLocally.mockResolvedValue({ arquivos: null, _meta: { servers: [] }, erro: 'Nenhum caminho de rede acessivel' });

    const result = await findFileAndGetSignedUrl('2024/01/02', 'protocolo');

    expect(result.arquivos).toBeNull();
    expect(result.status.local).toContain('erro');
  });

  it('usa cache da busca unificada quando disponivel', async () => {
    const cachedResult = {
      arquivos: [{ downloadUrl: '/download-s3?key=cached.mp3', nomeParaDownload: 'cached.mp3' }],
      status: { s3: 'ok', local: 'nao_consultado' },
      _meta: { bucket: 'test-bucket', prefixes: ['2024/01/02/'], servers: ['STORAGE'], tempo_s3: '0.21s' },
    };
    cacheGet.mockResolvedValue(cachedResult);

    const result = await findFileAndGetSignedUrl('2024/01/02', 'protocolo');

    expect(result.arquivos).toEqual(cachedResult.arquivos);
    expect(result.status).toEqual({ s3: 'ok', local: 'nao_consultado' });
    expect(result._meta).toEqual({ ...cachedResult._meta, cache: true });
    expect(findInS3).not.toHaveBeenCalled();
    expect(findLocally).not.toHaveBeenCalled();
  });

  it('popula cache apos buscar normalmente', async () => {
    cacheGet.mockResolvedValue(null);
    findInS3.mockResolvedValue({
      arquivos: [{ downloadUrl: '/download-s3?key=file.mp3', nomeParaDownload: 'file.mp3' }],
      _meta: { bucket: 'test-bucket', prefixes: ['2024/01/02/'], cache: false },
    });

    const result = await findFileAndGetSignedUrl('2024/01/02', 'protocolo');

    expect(result.status.s3).toBe('ok');
    expect(cacheSet).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ arquivos: expect.anything(), _meta: expect.anything() }),
      expect.any(Number),
    );
  });

  it('popula cache mesmo quando resultado e null (para evitar repeticoes)', async () => {
    cacheGet.mockResolvedValue(null);
    findInS3.mockResolvedValue({ arquivos: null, _meta: { bucket: 'test-bucket', prefixes: [], cache: false } });
    findLocally.mockResolvedValue({ arquivos: null, _meta: { servers: [] } });

    const result = await findFileAndGetSignedUrl('2024/01/02', 'protocolo');

    expect(result.arquivos).toBeNull();
    expect(cacheSet).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ arquivos: null, _meta: expect.anything() }),
      expect.any(Number),
    );
  });

  it('deduplica buscas concorrentes com mesmo cacheKey', async () => {
    cacheGet.mockResolvedValue(null);
    findInS3.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ arquivos: null, _meta: { bucket: 'b', prefixes: [], cache: false } }), 100)));
    findLocally.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ arquivos: null, _meta: { servers: [] } }), 100)));

    const promise1 = findFileAndGetSignedUrl('2024/01/02', 'protocolo');
    const promise2 = findFileAndGetSignedUrl('2024/01/02', 'protocolo');

    const [result1, result2] = await Promise.all([promise1, promise2]);

    expect(result1.arquivos).toBeNull();
    expect(result2.arquivos).toBeNull();
    expect(findInS3).toHaveBeenCalledTimes(1);
  });

  it('usa cache de busca unificada para resultado null (evita nova consulta)', async () => {
    cacheGet.mockResolvedValueOnce(null).mockResolvedValueOnce({
      arquivos: null,
      status: { s3: 'nao_encontrado', local: 'nao_encontrado' },
    });
    findInS3.mockResolvedValue({ arquivos: null, _meta: { bucket: 'b', prefixes: [], cache: false } });
    findLocally.mockResolvedValue({ arquivos: null, _meta: { servers: [] } });

    await findFileAndGetSignedUrl('2024/01/02', 'protocolo');

    cacheGet.mockImplementation(() =>
      Promise.resolve({
        arquivos: null,
        status: { s3: 'nao_encontrado', local: 'nao_encontrado' },
      }),
    );

    const result2 = await findFileAndGetSignedUrl('2024/01/02', 'protocolo');

    expect(result2.arquivos).toBeNull();
    expect(findInS3).toHaveBeenCalledTimes(1);
  });

  it('preserva _meta no cache-hit de resultado null (regressao: auditoria sem detalhes)', async () => {
    cacheGet.mockResolvedValue({
      arquivos: null,
      status: { s3: 'nao_encontrado', local: 'nao_encontrado' },
      _meta: {
        bucket: 'bc-audios',
        prefixes: ['2023/01/01/', '2023/01/01/'],
        servers: ['STORAGE', 'BACKUP'],
        tempo_s3: '0.21s',
        tempo_local: '0.18s',
      },
    });

    const result = await findFileAndGetSignedUrl('2024/01/02', 'protocolo');

    expect(result.arquivos).toBeNull();
    expect(result._meta).toEqual({
      bucket: 'bc-audios',
      prefixes: ['2023/01/01/', '2023/01/01/'],
      servers: ['STORAGE', 'BACKUP'],
      tempo_s3: '0.21s',
      tempo_local: '0.18s',
      cache: true,
    });
    expect(findInS3).not.toHaveBeenCalled();
    expect(findLocally).not.toHaveBeenCalled();
  });

  function makeAbortAwareLocalMock() {
    return (_dirPath, _targetName, _log, signal) =>
      new Promise((resolve) => {
        if (signal?.aborted) { resolve({ arquivos: null, _meta: { servers: [] }, erro: 'conexão perdida' }); return; }
        const timer = setTimeout(() => resolve({ arquivos: null, _meta: { servers: [] } }), 50);
        const onAbort = () => { clearTimeout(timer); resolve({ arquivos: null, _meta: { servers: [] }, erro: 'conexão perdida' }); };
        signal?.addEventListener('abort', onAbort, { once: true });
      });
  }

  it('retorna status cancelado quando externalSignal abortado durante busca local', async () => {
    const externalAbort = new AbortController();

    cacheGet.mockResolvedValue(null);
    findInS3.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ arquivos: null, _meta: { bucket: 'b', prefixes: [], cache: false } }), 50)));
    findLocally.mockImplementation(makeAbortAwareLocalMock());

    const searchPromise = findFileAndGetSignedUrl(
      '2024/01/02',
      'protocolo',
      undefined,
      undefined,
      externalAbort.signal,
    );

    // yield so doSearch attaches the event listener before we abort
    await new Promise((r) => setImmediate(r));

    externalAbort.abort();

    const result = await searchPromise;

    expect(result.arquivos).toBeNull();
    expect(result.status.cancelado).toBe(true);
    expect(result.status.s3).toBe('nao_encontrado');
    expect(result.status.local).toBe('cancelado');
    expect(cacheSet).not.toHaveBeenCalled();
  });

  it('retorna status cancelado quando S3 falha e usuario cancela durante local', async () => {
    const externalAbort = new AbortController();

    cacheGet.mockResolvedValue(null);
    findInS3.mockRejectedValue(new Error('AccessDenied'));
    findLocally.mockImplementation(makeAbortAwareLocalMock());

    const searchPromise = findFileAndGetSignedUrl(
      '2024/01/02',
      'protocolo',
      undefined,
      undefined,
      externalAbort.signal,
    );

    await new Promise((r) => setImmediate(r));
    externalAbort.abort();

    const result = await searchPromise;

    expect(result.arquivos).toBeNull();
    expect(result.status.s3).toContain('erro');
    expect(result.status.local).toBe('cancelado');
    expect(result.status.cancelado).toBe(true);
  });

  it('usa NULL_CACHE_TTL=15 para resultado null', async () => {
    cacheGet.mockResolvedValue(null);
    findInS3.mockResolvedValue({ arquivos: null, _meta: { bucket: 'b', prefixes: [], cache: false } });
    findLocally.mockResolvedValue({ arquivos: null, _meta: { servers: [] } });

    await findFileAndGetSignedUrl('2024/01/02', 'protocolo');

    expect(cacheSet).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ arquivos: null }), 15);
  });

  it('retorna erro de tempo limite excedido quando global timeout expira durante busca local', async () => {
    vi.useFakeTimers();
    try {
      cacheGet.mockResolvedValue(null);
      findInS3.mockResolvedValue({ arquivos: null, _meta: { bucket: 'b', prefixes: [], cache: false } });

      let localResolve;
      findLocally.mockImplementation(
        (_dirPath, _targetName, _log, _signal) => new Promise((r) => { localResolve = r; }),
      );

      const searchPromise = findFileAndGetSignedUrl('2024/01/02', 'protocolo');

      await null;
      await null;
      await null;

      vi.advanceTimersByTime(10_000_000);
      localResolve({ arquivos: null, _meta: { servers: [] } });

      const result = await searchPromise;

      expect(result.arquivos).toBeNull();
      expect(result.status.local).toBe('erro: tempo limite excedido');
    } finally {
      vi.useRealTimers();
    }
  });
});
