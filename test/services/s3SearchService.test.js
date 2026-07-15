import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(),
  ListObjectsV2Command: vi.fn(),
}));

import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

const mockSend = vi.fn();
S3Client.mockImplementation(function () { return { send: mockSend }; });
ListObjectsV2Command.mockImplementation(function (input) { return { input }; });

describe('generatePrefixes', () => {
  let generatePrefixes;

  beforeAll(async () => {
    const mod = await import('../../src/services/s3SearchService.js');
    generatePrefixes = mod.generatePrefixes;
  });

  it('retorna 4 prefixos para mes/dia sem padding', () => {
    const result = generatePrefixes('2025', '1', '1');
    expect(result).toEqual([
      '2025/1/1/',
      '2025/1/01/',
      '2025/01/01/',
      '2025/01/1/',
    ]);
  });

  it('retorna 4 prefixos sem duplicatas para mes/dia com padding', () => {
    const result = generatePrefixes('2025', '01', '01');
    expect(result).toHaveLength(4);
    expect(result).toEqual([
      '2025/1/1/',
      '2025/1/01/',
      '2025/01/01/',
      '2025/01/1/',
    ]);
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
});

describe('findFileAndGetSignedUrl', () => {
  let findFileAndGetSignedUrl;

  beforeAll(async () => {
    const mod = await import('../../src/services/s3SearchService.js');
    findFileAndGetSignedUrl = mod.findFileAndGetSignedUrl;
  });

  beforeEach(() => {
    mockSend.mockReset();
    ListObjectsV2Command.mockClear();
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

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0].downloadUrl).toContain('/download-s3?key=');
    expect(result[0].downloadUrl).toContain(encodeURIComponent('2024/01/02/0336637208_audio.wav'));
    expect(result[0].nomeParaDownload).toBe('0336637208_audio.wav');
  });

  it('retorna null quando S3 nao encontra arquivos', async () => {
    mockSend.mockResolvedValue({
      Contents: [
        { Key: '2024/01/02/outro_arquivo.pdf' },
      ],
    });

    const result = await findFileAndGetSignedUrl('2024/01/02', '0336637208');

    expect(result).toBeNull();
  });

  it('propaga erro quando S3 lanca excecao', async () => {
    mockSend.mockRejectedValue(new Error('AccessDenied'));

    await expect(findFileAndGetSignedUrl('2024/01/02', '0336637208'))
      .rejects.toThrow('AccessDenied');
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

    expect(result).toHaveLength(1);
    expect(result[0].nomeParaDownload).toBe('a.mp3');
  });
});
