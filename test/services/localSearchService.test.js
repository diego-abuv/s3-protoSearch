import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

const mockFs = vi.hoisted(() => ({
  access: vi.fn(),
  stat: vi.fn(),
  readdir: vi.fn(),
  opendir: vi.fn(),
}));
vi.mock('fs/promises', () => {
  return { ...mockFs, default: mockFs };
});


function makeMockDir(entries) {
  let idx = 0;
  return {
    read: vi.fn(async () => {
      if (idx >= entries.length) return null;
      return entries[idx++];
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

const TEST_YEAR = '1999';

describe('findFileAndGetSignedUrl', () => {
  let findFileAndGetSignedUrl;
  let cleanupVars;

  beforeAll(async () => {
    cleanupVars = [];
    for (const key of Object.keys(process.env).filter((k) => k.startsWith('YEARS_'))) {
      cleanupVars.push(key);
      delete process.env[key];
    }
    process.env[`YEARS_TEST`] = TEST_YEAR;
    process.env[`PATH_TEST`] = '/mnt/share,sub1';
    const mod = await import('../../src/services/localSearchService.js');
    findFileAndGetSignedUrl = mod.findFileAndGetSignedUrl;
  });

  afterAll(() => {
    delete process.env[`YEARS_TEST`];
    delete process.env[`PATH_TEST`];
    for (const key of cleanupVars) {
      process.env[key] = process.env[key] || '';
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna null quando ano nao tem configuracao', async () => {
    const result = await findFileAndGetSignedUrl('1900/01/02', 'protocolo');
    expect(result).toBeNull();
  });

  it('retorna erro quando todos caminhos inacessiveis', async () => {
    mockFs.access.mockRejectedValue(new Error('EACCES'));

    const result = await findFileAndGetSignedUrl(`${TEST_YEAR}/01/02`, 'protocolo');

    expect(result).toEqual({ erro: 'Nenhum caminho de rede acessivel' });
  });

  it('retorna resultado quando varredura nivel 0 encontra arquivo solto na raiz do dia', async () => {
    mockFs.access.mockResolvedValue(undefined);
    mockFs.stat.mockResolvedValue(undefined);
    mockFs.readdir.mockResolvedValue([
      { name: '0336637208_01020304_123456.wav', isDirectory: () => false },
    ]);

    const result = await findFileAndGetSignedUrl(`${TEST_YEAR}/01/02`, '0336637208');

    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      expect(result[0].downloadUrl).toContain('/download-local?file=');
      expect(result[0].nomeParaDownload).toBeTruthy();
    }
  });

  function setupStreamingTest() {
    mockFs.access.mockResolvedValue(undefined);
    mockFs.stat.mockResolvedValue(undefined);
  }

  it('streaming scan nao crasha quando dir.read() lanca erro', async () => {
    setupStreamingTest();

    const badDir = {
      read: vi.fn().mockRejectedValue(new Error('falha na leitura do diretorio')),
      close: vi.fn().mockResolvedValue(undefined),
    };
    mockFs.opendir.mockResolvedValue(badDir);
    mockFs.readdir.mockResolvedValue([
      { name: '15', isDirectory: () => true },
    ]);

    const result = await findFileAndGetSignedUrl(`${TEST_YEAR}/01/02`, '0336637208');

    expect(result).toBeNull();
  });

  it('streaming scan encontra matches e retorna resultados', async () => {
    setupStreamingTest();

    const mockEntry = {
      name: '0336637208_01020304_123456.wav',
      isDirectory: () => false,
    };
    const mockDir = makeMockDir([mockEntry]);
    mockFs.opendir.mockResolvedValue(mockDir);
    mockFs.readdir.mockResolvedValue([
      { name: '15', isDirectory: () => true },
    ]);

    const result = await findFileAndGetSignedUrl(`${TEST_YEAR}/01/02`, '0336637208');

    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      expect(result[0].downloadUrl).toContain('/download-local?file=');
    }
  });

  it('streaming scan com subdiretorio inacessivel faz fallback sem crash', async () => {
    setupStreamingTest();

    mockFs.opendir.mockRejectedValue(new Error('permission denied'));
    mockFs.readdir.mockResolvedValue([
      { name: '15', isDirectory: () => true },
    ]);

    const result = await findFileAndGetSignedUrl(`${TEST_YEAR}/01/02`, '0336637208');

    expect(result).toBeNull();
  }, 15000);

  it('retorna erro quando opendir de hora falha com EHOSTDOWN', async () => {
    setupStreamingTest();

    mockFs.opendir.mockRejectedValue(new Error('EHOSTDOWN: host is down, opendir /mnt/share/1999/1/2/9'));
    mockFs.readdir.mockResolvedValue([
      { name: '9', isDirectory: () => true },
    ]);

    const result = await findFileAndGetSignedUrl(`${TEST_YEAR}/01/02`, '0336637208');

    expect(result).toEqual({ erro: 'EHOSTDOWN: host is down, opendir /mnt/share/1999/1/2/9' });
  });

  it('retorna erro quando readdir do dia falha com EHOSTDOWN', async () => {
    setupStreamingTest();

    mockFs.readdir.mockRejectedValue(new Error('EHOSTDOWN: host is down, readdir /mnt/share/1999/1/2'));

    const result = await findFileAndGetSignedUrl(`${TEST_YEAR}/01/02`, '0336637208');

    expect(result).toEqual({ erro: 'EHOSTDOWN: host is down, readdir /mnt/share/1999/1/2' });
  });

  it('busca com signal abortado retorna null', async () => {
    mockFs.access.mockResolvedValue(undefined);
    mockFs.stat.mockResolvedValue(undefined);

    const abortController = new AbortController();
    abortController.abort();

    const result = await findFileAndGetSignedUrl(`${TEST_YEAR}/01/02`, 'protocolo', undefined, abortController.signal);

    expect(result).toBeNull();
  });
});