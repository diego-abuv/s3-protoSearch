import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

const mockFs = vi.hoisted(() => ({
  access: vi.fn(),
  stat: vi.fn(),
  readdir: vi.fn(),
  opendir: vi.fn(),
  readFile: vi.fn(),
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
const TEST_ALT_YEAR = '1998';
const SEARCH_ROOT = '/mnt/share/sub1';

const MOUNTINFO_SEM_SHARE =
  '25 0 8:1 / / rw,relatime - ext4 /dev/sda1 rw,relatime\n' + '30 25 8:2 / /mnt rw,relatime - ext4 /dev/sda2 rw\n';

// O mount CIFS real acontece no basePath (/mnt/share), nao na subpasta (/mnt/share/sub1) —
// varias subpastas podem compartilhar o mesmo mount, como no caso real do servidor 0.196.
const MOUNTINFO_COM_SHARE =
  MOUNTINFO_SEM_SHARE + '31 30 0:99 / /mnt/share rw,relatime - cifs //server/share rw,relatime\n';

function makeEnoent(op, fullPath) {
  const err = new Error(`ENOENT: no such file or directory, ${op} '${fullPath}'`);
  err.code = 'ENOENT';
  return err;
}

function makeErrno(code, op, fullPath) {
  const err = new Error(`${code}: ${op} '${fullPath}'`);
  err.code = code;
  return err;
}

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
    process.env[`YEARS_TEST_ALT`] = TEST_ALT_YEAR;
    process.env[`PATH_TEST_ALT`] = '/mnt/alt,shareA;shareB';
    const mod = await import('../../src/services/localSearchService.js');
    findFileAndGetSignedUrl = mod.findFileAndGetSignedUrl;
  });

  afterAll(() => {
    delete process.env[`YEARS_TEST`];
    delete process.env[`PATH_TEST`];
    delete process.env[`YEARS_TEST_ALT`];
    delete process.env[`PATH_TEST_ALT`];
    for (const key of cleanupVars) {
      process.env[key] = process.env[key] || '';
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockFs.readFile.mockRejectedValue(new Error('mountinfo indisponivel'));
  });

  it('retorna null quando ano nao tem configuracao', async () => {
    const result = await findFileAndGetSignedUrl('1900/01/02', 'protocolo');
    expect(result.arquivos).toBeNull();
  });

  it('retorna erro quando todos caminhos inacessiveis', async () => {
    mockFs.access.mockRejectedValue(makeErrno('EACCES', 'access', SEARCH_ROOT));

    const result = await findFileAndGetSignedUrl(`${TEST_YEAR}/01/02`, 'protocolo');

    expect(result).toEqual({
      arquivos: null,
      _meta: { servers: [], sharesIndisponiveis: ['Servidor:permissao'] },
      erro: 'share indisponivel: Servidor:permissao',
    });
  });

  it('retorna resultado quando varredura nivel 0 encontra arquivo solto na raiz do dia', async () => {
    mockFs.access.mockResolvedValue(undefined);
    mockFs.stat.mockResolvedValue(undefined);
    mockFs.readdir.mockResolvedValue([{ name: '0336637208_01020304_123456.wav', isDirectory: () => false }]);

    const result = await findFileAndGetSignedUrl(`${TEST_YEAR}/01/02`, '0336637208');

    expect(result.arquivos).toBeDefined();
    expect(Array.isArray(result.arquivos)).toBe(true);
    if (result.arquivos.length > 0) {
      expect(result.arquivos[0].downloadUrl).toContain('/download-local?file=');
      expect(result.arquivos[0].nomeParaDownload).toBeTruthy();
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
    mockFs.readdir.mockResolvedValue([{ name: '15', isDirectory: () => true }]);

    const result = await findFileAndGetSignedUrl(`${TEST_YEAR}/01/02`, '0336637208');

    expect(result.arquivos).toBeNull();
  });

  it('streaming scan encontra matches e retorna resultados', async () => {
    setupStreamingTest();

    const mockEntry = {
      name: '0336637208_01020304_123456.wav',
      isDirectory: () => false,
    };
    const mockDir = makeMockDir([mockEntry]);
    mockFs.opendir.mockResolvedValue(mockDir);
    mockFs.readdir.mockResolvedValue([{ name: '15', isDirectory: () => true }]);

    const result = await findFileAndGetSignedUrl(`${TEST_YEAR}/01/02`, '0336637208');

    expect(result.arquivos).toBeDefined();
    expect(Array.isArray(result.arquivos)).toBe(true);
    if (result.arquivos.length > 0) {
      expect(result.arquivos[0].downloadUrl).toContain('/download-local?file=');
    }
  });

  it('streaming scan com subdiretorio inacessivel faz fallback sem crash', async () => {
    setupStreamingTest();

    mockFs.opendir.mockRejectedValue(new Error('permission denied'));
    mockFs.readdir.mockResolvedValue([{ name: '15', isDirectory: () => true }]);

    const result = await findFileAndGetSignedUrl(`${TEST_YEAR}/01/02`, '0336637208');

    expect(result.arquivos).toBeNull();
  }, 15000);

  it('retorna erro quando opendir de hora falha com EHOSTDOWN', async () => {
    setupStreamingTest();

    mockFs.opendir.mockRejectedValue(new Error('EHOSTDOWN: host is down, opendir /mnt/share/1999/1/2/9'));
    mockFs.readdir.mockResolvedValue([{ name: '9', isDirectory: () => true }]);

    const result = await findFileAndGetSignedUrl(`${TEST_YEAR}/01/02`, '0336637208');

    expect(result).toEqual({
      arquivos: null,
      _meta: { servers: ['Servidor'] },
      erro: 'EHOSTDOWN: host is down, opendir /mnt/share/1999/1/2/9',
    });
  });

  it('retorna erro quando readdir do dia falha com EHOSTDOWN', async () => {
    setupStreamingTest();

    mockFs.readdir.mockRejectedValue(new Error('EHOSTDOWN: host is down, readdir /mnt/share/1999/1/2'));

    const result = await findFileAndGetSignedUrl(`${TEST_YEAR}/01/02`, '0336637208');

    expect(result).toEqual({
      arquivos: null,
      _meta: { servers: ['Servidor'] },
      erro: 'EHOSTDOWN: host is down, readdir /mnt/share/1999/1/2',
    });
  });

  describe('deteccao de share indisponivel', () => {
    it('retorna erro quando o share nao esta montado e todos os prefixos dao ENOENT', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.stat.mockRejectedValue(makeEnoent('stat', SEARCH_ROOT));
      mockFs.readFile.mockResolvedValue(MOUNTINFO_SEM_SHARE);

      const result = await findFileAndGetSignedUrl(`${TEST_YEAR}/01/02`, '1768379');

      expect(result.arquivos).toBeNull();
      expect(result.erro).toBe('share indisponivel: Servidor:nao-montado');
      expect(result._meta.sharesIndisponiveis).toEqual(['Servidor:nao-montado']);
    });

    it('nao le a raiz do share quando o mountinfo ja prova que ele nao existe', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.stat.mockRejectedValue(makeEnoent('stat', SEARCH_ROOT));
      mockFs.readFile.mockResolvedValue(MOUNTINFO_SEM_SHARE);

      await findFileAndGetSignedUrl(`${TEST_YEAR}/01/02`, '1768379');

      expect(mockFs.readdir).not.toHaveBeenCalled();
    });

    it('nao classifica como erro quando o share esta montado e o dia realmente nao existe', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.stat.mockRejectedValue(makeEnoent('stat', SEARCH_ROOT));
      mockFs.readFile.mockResolvedValue(MOUNTINFO_COM_SHARE);

      const result = await findFileAndGetSignedUrl(`${TEST_YEAR}/01/02`, '1768379');

      expect(result.arquivos).toBeNull();
      expect(result.erro).toBeUndefined();
      expect(result._meta.sharesIndisponiveis).toBeUndefined();
    });

    it('retorna erro quando a raiz do share esta vazia e o mountinfo nao pode ser lido', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.stat.mockRejectedValue(makeEnoent('stat', SEARCH_ROOT));
      mockFs.readFile.mockRejectedValue(makeErrno('ENOENT', 'open', '/proc/self/mountinfo'));
      mockFs.readdir.mockResolvedValue([]);

      const result = await findFileAndGetSignedUrl(`${TEST_YEAR}/01/02`, '1768379');

      expect(result.erro).toBe('share indisponivel: Servidor:vazio');
      expect(result._meta.sharesIndisponiveis).toEqual(['Servidor:vazio']);
    });

    it('nao classifica como erro quando a raiz tem conteudo e o mountinfo nao pode ser lido', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.stat.mockRejectedValue(makeEnoent('stat', SEARCH_ROOT));
      mockFs.readFile.mockRejectedValue(makeErrno('ENOENT', 'open', '/proc/self/mountinfo'));
      mockFs.readdir.mockResolvedValue([{ name: '2021', isDirectory: () => true }]);

      const result = await findFileAndGetSignedUrl(`${TEST_YEAR}/01/02`, '1768379');

      expect(result.arquivos).toBeNull();
      expect(result.erro).toBeUndefined();
    });

    it('marca o share como falha de rede quando o stat falha com EHOSTDOWN', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.stat.mockRejectedValue(makeErrno('EHOSTDOWN', 'stat', SEARCH_ROOT));

      const result = await findFileAndGetSignedUrl(`${TEST_YEAR}/01/02`, '1768379');

      expect(result.erro).toBe('share indisponivel: Servidor:rede');
      expect(result._meta.sharesIndisponiveis).toEqual(['Servidor:rede']);
    });

    it('nao consulta o mountinfo quando o share ja foi marcado como degradado', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.stat.mockRejectedValue(makeErrno('EHOSTDOWN', 'stat', SEARCH_ROOT));

      await findFileAndGetSignedUrl(`${TEST_YEAR}/01/02`, '1768379');

      expect(mockFs.readFile).not.toHaveBeenCalled();
    });

    it('nao classifica share cujo dia foi varrido sem erro', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([{ name: '15', isDirectory: () => true }]);
      mockFs.opendir.mockResolvedValue(makeMockDir([]));

      const result = await findFileAndGetSignedUrl(`${TEST_YEAR}/01/02`, '1768379');

      expect(result.arquivos).toBeNull();
      expect(result.erro).toBeUndefined();
      expect(result._meta.sharesIndisponiveis).toBeUndefined();
    });

    it('nao classifica share quando o arquivo e encontrado normalmente', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([{ name: '15', isDirectory: () => true }]);
      mockFs.opendir.mockResolvedValue(makeMockDir([{ name: '1768379_01_02_03.wav', isDirectory: () => false }]));

      const result = await findFileAndGetSignedUrl(`${TEST_YEAR}/01/02`, '1768379');

      expect(result.arquivos).toHaveLength(1);
      expect(result.erro).toBeUndefined();
    });
  });

  describe('shares parcialmente indisponiveis', () => {
    it('reporta erro quando apenas um dos dois shares falha no gate de acesso', async () => {
      mockFs.access.mockImplementation(async (target) => {
        if (target === '/mnt/alt/shareB') throw makeErrno('EACCES', 'access', target);
      });
      mockFs.stat.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([{ name: '15', isDirectory: () => true }]);
      mockFs.opendir.mockResolvedValue(makeMockDir([]));

      const result = await findFileAndGetSignedUrl(`${TEST_ALT_YEAR}/01/02`, '1768379');

      expect(result.erro).toBe('share indisponivel: Servidor:permissao');
      expect(result._meta.sharesIndisponiveis).toEqual(['Servidor:permissao']);
      expect(result._meta.servers).toEqual(['Servidor']);
    });

    it('nao reporta erro quando todos os shares respondem normalmente', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([{ name: '15', isDirectory: () => true }]);
      mockFs.opendir.mockResolvedValue(makeMockDir([]));

      const result = await findFileAndGetSignedUrl(`${TEST_ALT_YEAR}/01/02`, '1768379');

      expect(result.erro).toBeUndefined();
      expect(result._meta.servers).toEqual(['Servidor', 'Servidor']);
    });

    it('deduplica raizes do mesmo share quando todas falham com o mesmo status', async () => {
      mockFs.access.mockRejectedValue(makeErrno('EACCES', 'access', '/mnt/alt/shareA'));

      const result = await findFileAndGetSignedUrl(`${TEST_ALT_YEAR}/01/02`, '1768379');

      expect(result._meta.sharesIndisponiveis).toEqual(['Servidor:permissao']);
      expect(result.erro).toBe('share indisponivel: Servidor:permissao');
    });

    it('mantem status distintos do mesmo share sem mascarar a raiz inacessivel', async () => {
      mockFs.access.mockImplementation(async (target) => {
        if (target === '/mnt/alt/shareA') throw makeErrno('EACCES', 'access', target);
      });
      mockFs.stat.mockRejectedValue(makeEnoent('stat', '/mnt/alt/shareB'));
      mockFs.readFile.mockResolvedValue(MOUNTINFO_SEM_SHARE);

      const result = await findFileAndGetSignedUrl(`${TEST_ALT_YEAR}/01/02`, '1768379');

      expect(result._meta.sharesIndisponiveis).toEqual(['Servidor:permissao', 'Servidor:nao-montado']);
      expect(result.erro).toBe('share indisponivel: Servidor:permissao,Servidor:nao-montado');
      expect(result._meta.servers).toEqual(['Servidor']);
    });

    it('trata subpastas do mesmo servidor como um unico mount (bug do PATH_196)', async () => {
      // Reproduz a estrutura real do servidor 0.196: duas subpastas dentro do MESMO mount CIFS.
      // O mountpoint real e o basePath (/mnt/alt); shareA e shareB sao apenas subpastas dele,
      // nunca pontos de montagem proprios — a checagem de mountinfo deve usar o basePath.
      const MOUNTINFO_COM_ALT = MOUNTINFO_SEM_SHARE + '31 30 0:99 / /mnt/alt rw,relatime - cifs //server/alt rw,relatime\n';
      mockFs.access.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([{ name: '15', isDirectory: () => true }]);
      mockFs.opendir.mockResolvedValue(makeMockDir([]));
      mockFs.readFile.mockResolvedValue(MOUNTINFO_COM_ALT);

      const result = await findFileAndGetSignedUrl(`${TEST_ALT_YEAR}/01/02`, '1768379');

      expect(result.erro).toBeUndefined();
      expect(result._meta.sharesIndisponiveis).toBeUndefined();
    });
  });

  describe('nomes de servidor via SERVER_NAMES', () => {
    afterEach(() => {
      delete process.env.YEARS_IP_TEST;
      delete process.env.PATH_IP_TEST;
      delete process.env.SERVER_NAMES;
    });

    it('usa o nome customizado quando SERVER_NAMES mapeia o ip do share', async () => {
      process.env.YEARS_IP_TEST = TEST_YEAR;
      process.env.PATH_IP_TEST = '/mnt/10-0-0-5/share';
      process.env.SERVER_NAMES = '10-0-0-5:MEU-SERVIDOR';
      mockFs.access.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([{ name: '15', isDirectory: () => true }]);
      mockFs.opendir.mockResolvedValue(makeMockDir([]));

      const result = await findFileAndGetSignedUrl(`${TEST_YEAR}/01/02`, '1768379');

      expect(result._meta.servers).toContain('MEU-SERVIDOR');
    });

    it('cai no fallback "Servidor <ip>" com ip no formato de pastas reais (traco) quando SERVER_NAMES nao mapeia', async () => {
      // Formato real usado em producao: /sharepoint/<ip-com-tracos>, ex. /sharepoint/192-168-16-74
      process.env.YEARS_IP_TEST = TEST_YEAR;
      process.env.PATH_IP_TEST = '/mnt/10-0-0-9/share';
      mockFs.access.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([{ name: '15', isDirectory: () => true }]);
      mockFs.opendir.mockResolvedValue(makeMockDir([]));

      const result = await findFileAndGetSignedUrl(`${TEST_YEAR}/01/02`, '1768379');

      expect(result._meta.servers).toContain('Servidor 10-0-0-9');
    });

    it('cai no fallback "Servidor <ip>" com ip no formato de pontos quando SERVER_NAMES nao mapeia', async () => {
      process.env.YEARS_IP_TEST = TEST_YEAR;
      process.env.PATH_IP_TEST = '/mnt/10.0.0.9/share';
      mockFs.access.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([{ name: '15', isDirectory: () => true }]);
      mockFs.opendir.mockResolvedValue(makeMockDir([]));

      const result = await findFileAndGetSignedUrl(`${TEST_YEAR}/01/02`, '1768379');

      expect(result._meta.servers).toContain('Servidor 10.0.0.9');
    });
  });

  it('busca com signal abortado retorna null', async () => {
    mockFs.access.mockResolvedValue(undefined);
    mockFs.stat.mockResolvedValue(undefined);

    const abortController = new AbortController();
    abortController.abort();

    const result = await findFileAndGetSignedUrl(`${TEST_YEAR}/01/02`, 'protocolo', undefined, abortController.signal);

    expect(result.arquivos).toBeNull();
  });
});
