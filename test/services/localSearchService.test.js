import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

vi.mock('fs/promises', () => {
  const mock = {
    access: vi.fn(),
    stat: vi.fn(),
    readdir: vi.fn(),
  };
  return { ...mock, default: mock };
});

vi.mock('../../src/db/indexDb.js', () => ({
  runIndex: vi.fn(),
  saveIndex: vi.fn(),
  isDirScanned: vi.fn().mockReturnValue(false),
  markDirScanned: vi.fn(),
}));

import fs from 'fs/promises';
import { isDirScanned } from '../../src/db/indexDb.js';

describe('findFileAndGetSignedUrl', () => {
  let findFileAndGetSignedUrl;

  beforeAll(async () => {
    process.env.YEARS_SERVER1 = '2024';
    process.env.PATH_SERVER1 = '/mnt/share,sub1;sub2';
    const mod = await import('../../src/services/localSearchService.js');
    findFileAndGetSignedUrl = mod.findFileAndGetSignedUrl;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna null quando ano nao tem configuracao', async () => {
    const keep = {};
    for (const key of Object.keys(process.env).filter((k) => k.startsWith('YEARS_'))) {
      keep[key] = process.env[key];
      delete process.env[key];
    }

    const result = await findFileAndGetSignedUrl('2023/01/02', 'protocolo');

    expect(result).toBeNull();
    for (const [k, v] of Object.entries(keep)) process.env[k] = v;
  });

  it('retorna erro quando todos caminhos inacessiveis', async () => {
    fs.access.mockRejectedValue(new Error('EACCES'));

    const result = await findFileAndGetSignedUrl('2024/01/02', 'protocolo');

    expect(result).toEqual({ erro: 'Nenhum caminho de rede acessivel' });
  });

  it('retorna resultado quando acesso direto encontra arquivo', async () => {
    fs.access.mockResolvedValue(undefined);
    fs.stat.mockResolvedValue(undefined);

    const result = await findFileAndGetSignedUrl('2024/01/02', '0336637208');

    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      expect(result[0].downloadUrl).toContain('/download-local?file=');
      expect(result[0].nomeParaDownload).toBeTruthy();
    }
  });

  it('retorna null quando nada encontrado (direto falha + scan vazio)', async () => {
    fs.access.mockResolvedValueOnce(undefined);
    fs.access.mockRejectedValue(new Error('not found'));
    fs.stat.mockResolvedValue(undefined);
    isDirScanned.mockReturnValue(true);

    const result = await findFileAndGetSignedUrl('2024/01/02', '0336637208');

    expect(result).toBeNull();
  });
});
