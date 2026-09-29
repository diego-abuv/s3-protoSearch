import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

vi.hoisted(() => {
  process.env.REDIS_URL = 'redis://localhost:6379';
});

vi.mock('../../src/utils/cache.js', () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  cacheDel: vi.fn(),
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(),
  ListObjectsV2Command: vi.fn(),
}));

import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { cacheGet, cacheSet } from '../../src/utils/cache.js';

const mockSend = vi.fn();
S3Client.mockImplementation(function () {
  return { send: mockSend };
});
ListObjectsV2Command.mockImplementation(function (input) {
  return { input };
});

describe('generatePrefixes', () => {
  let generatePrefixes;

  beforeAll(async () => {
    const mod = await import('../../src/services/s3SearchService.js');
    generatePrefixes = mod.generatePrefixes;
  });

  // Isola os testes do AWS_PREFIX_ROOTS real do .env do projeto (carregado via dotenv/config) —
  // os testes abaixo assumem o comportamento padrão (sem prefixo raiz) a menos que configurem
  // a variável explicitamente.
  beforeEach(() => {
    delete process.env.AWS_PREFIX_ROOTS;
  });

  it('retorna 4 prefixos para mes/dia sem padding', () => {
    const result = generatePrefixes('2025', '1', '1');
    expect(result).toEqual(['2025/1/1/', '2025/1/01/', '2025/01/01/', '2025/01/1/']);
  });

  it('retorna 4 prefixos sem duplicatas para mes/dia com padding', () => {
    const result = generatePrefixes('2025', '01', '01');
    expect(result).toHaveLength(4);
    expect(result).toEqual(['2025/1/1/', '2025/1/01/', '2025/01/01/', '2025/01/1/']);
  });

  it('preserva mes=12 nas combinacoes', () => {
    const result = generatePrefixes('2025', '12', '5');
    expect(result).toContain('2025/12/5/');
    expect(result).toContain('2025/12/05/');
    expect(result).toHaveLength(2);
  });

  it('preserva dia=10 sem confundir com 1', () => {
    const result = generatePrefixes('2025', '1', '10');
    expect(result).toContain('2025/1/10/');
    expect(result).toContain('2025/01/10/');
    expect(result).not.toContain('2025/01/1/');
    expect(result).not.toContain('2025/1/1/');
    expect(result).toHaveLength(2);
  });

  describe('prefixo raiz configuravel (AWS_PREFIX_ROOTS)', () => {
    afterEach(() => {
      delete process.env.AWS_PREFIX_ROOTS;
    });

    it('sem AWS_PREFIX_ROOTS, busca apenas na raiz do bucket (comportamento atual)', () => {
      const result = generatePrefixes('2025', '1', '1');

      expect(result).toEqual(['2025/1/1/', '2025/1/01/', '2025/01/01/', '2025/01/1/']);
    });

    it('com AWS_PREFIX_ROOTS=,audio testa raiz e subpasta para o mesmo ano', () => {
      process.env.AWS_PREFIX_ROOTS = ',audio';

      const result = generatePrefixes('2025', '10', '27');

      expect(result).toContain('2025/10/27/');
      expect(result).toContain('audio/2025/10/27/');
      expect(result).toHaveLength(2); // mes e dia ja tem 2 digitos, sem variantes de padding x 2 raizes
    });

    it('busca somente na subpasta quando AWS_PREFIX_ROOTS nao inclui item vazio', () => {
      process.env.AWS_PREFIX_ROOTS = 'audio';

      const result = generatePrefixes('2026', '4', '1');

      expect(result.every((p) => p.startsWith('audio/'))).toBe(true);
      expect(result).not.toContain('2026/4/1/');
    });

    it('normaliza barras extras e espacos em cada raiz da lista', () => {
      process.env.AWS_PREFIX_ROOTS = ' /audio/ , /hmb ';

      const result = generatePrefixes('2025', '1', '1');

      expect(result).toContain('audio/2025/1/1/');
      expect(result).toContain('hmb/2025/1/1/');
    });

    it('deduplica raizes repetidas na lista', () => {
      process.env.AWS_PREFIX_ROOTS = 'audio,audio,/audio/';

      const result = generatePrefixes('2025', '1', '1');

      expect(result.filter((p) => p === 'audio/2025/1/1/')).toHaveLength(1);
    });
  });
});

describe('findFileAndGetSignedUrl', () => {
  let findFileAndGetSignedUrl;

  beforeAll(async () => {
    const mod = await import('../../src/services/s3SearchService.js');
    findFileAndGetSignedUrl = mod.findFileAndGetSignedUrl;
  });

  beforeEach(() => {
    delete process.env.AWS_PREFIX_ROOTS;
    mockSend.mockReset();
    ListObjectsV2Command.mockClear();
    cacheGet.mockReset();
    cacheSet.mockReset();
  });

  it('retorna array com downloadUrl quando S3 encontra arquivo em 1 prefixo', async () => {
    mockSend.mockImplementation((command) => {
      const prefix = command.input.Prefix;
      if (prefix === '2024/01/02/') {
        return Promise.resolve({
          Contents: [{ Key: '2024/01/02/0336637208_audio.wav' }],
        });
      }
      return Promise.resolve({ Contents: [] });
    });

    const result = await findFileAndGetSignedUrl('2024/01/02', '0336637208');

    expect(result.arquivos).toHaveLength(1);
    expect(result.arquivos[0].downloadUrl).toContain('/download-s3?key=');
    expect(result.arquivos[0].downloadUrl).toContain(encodeURIComponent('2024/01/02/0336637208_audio.wav'));
    expect(result.arquivos[0].nomeParaDownload).toBe('0336637208_audio.wav');
    expect(result._meta.bucket).toBe('bc-audios');
    expect(result._meta.cache).toBe(false);
  });

  it('retorna null quando S3 nao encontra arquivos', async () => {
    mockSend.mockResolvedValue({
      Contents: [{ Key: '2024/01/02/outro_arquivo.pdf' }],
    });

    const result = await findFileAndGetSignedUrl('2024/01/02', '0336637208');

    expect(result.arquivos).toBeNull();
    expect(result._meta.bucket).toBe('bc-audios');
  });

  it('propaga erro quando S3 lanca excecao', async () => {
    mockSend.mockRejectedValue(new Error('AccessDenied'));

    await expect(findFileAndGetSignedUrl('2024/01/02', '0336637208')).rejects.toThrow('AccessDenied');
  });

  it('combina resultados de multiplos prefixos', async () => {
    mockSend.mockImplementation((command) => {
      const prefix = command.input.Prefix;
      const files = {
        '2024/1/2/': [{ Key: '2024/1/2/a.mp3' }],
        '2024/1/02/': [{ Key: '2024/1/02/b.mp3' }],
      };
      return Promise.resolve({
        Contents: files[prefix] || [],
      });
    });

    const result = await findFileAndGetSignedUrl('2024/01/02', 'a');

    expect(result.arquivos).toHaveLength(1);
    expect(result.arquivos[0].nomeParaDownload).toBe('a.mp3');
  });

  it('usa cache quando disponivel e nao chama S3', async () => {
    const cachedResult = [{ downloadUrl: '/download-s3?key=cached.mp3', nomeParaDownload: 'cached.mp3' }];
    cacheGet.mockResolvedValue(cachedResult);

    const result = await findFileAndGetSignedUrl('2024/01/02', 'protocolo');

    expect(result.arquivos).toEqual(cachedResult);
    expect(result._meta.cache).toBe(true);
    expect(mockSend).not.toHaveBeenCalled();
    expect(cacheGet).toHaveBeenCalled();
  });

  it('reutiliza cache no novo formato preservando prefixos', async () => {
    const cachedResult = {
      arquivos: [{ downloadUrl: '/download-s3?key=cached.mp3', nomeParaDownload: 'cached.mp3' }],
      prefixes: ['2024/01/02/', '2024/01/2/'],
    };
    cacheGet.mockResolvedValue(cachedResult);

    const result = await findFileAndGetSignedUrl('2024/01/02', 'protocolo');

    expect(result.arquivos).toEqual(cachedResult.arquivos);
    expect(result._meta.cache).toBe(true);
    expect(result._meta.prefixes).toEqual(['2024/01/02/', '2024/01/2/']);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('consulta S3 e popula cache quando cache miss', async () => {
    cacheGet.mockResolvedValue(null);
    mockSend.mockImplementation((command) => {
      const prefix = command.input.Prefix;
      if (prefix === '2024/01/02/') {
        return Promise.resolve({
          Contents: [{ Key: '2024/01/02/arquivo.mp3' }],
        });
      }
      return Promise.resolve({ Contents: [] });
    });

    const result = await findFileAndGetSignedUrl('2024/01/02', 'arquivo');

    expect(result.arquivos).toHaveLength(1);
    expect(mockSend).toHaveBeenCalled();
    expect(cacheSet).toHaveBeenCalled();
  });
});
