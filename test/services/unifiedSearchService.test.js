import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

vi.mock('../../src/services/s3SearchService.js', () => ({
  findFileAndGetSignedUrl: vi.fn(),
}));

vi.mock('../../src/services/localSearchService.js', () => ({
  findFileAndGetSignedUrl: vi.fn(),
}));

vi.mock('../../src/db/indexDb.js', () => ({
  queryIndex: vi.fn(),
}));

import { findFileAndGetSignedUrl as findInS3 } from '../../src/services/s3SearchService.js';
import { findFileAndGetSignedUrl as findLocally } from '../../src/services/localSearchService.js';
import { queryIndex } from '../../src/db/indexDb.js';

describe('findFileAndGetSignedUrl', () => {
  let findFileAndGetSignedUrl;

  beforeAll(async () => {
    const mod = await import('../../src/services/unifiedSearchService.js');
    findFileAndGetSignedUrl = mod.findFileAndGetSignedUrl;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna resultado do S3 quando S3 encontra', async () => {
    findInS3.mockResolvedValue([
      { downloadUrl: '/download-s3?key=file.mp3', nomeParaDownload: 'file.mp3' },
    ]);

    const result = await findFileAndGetSignedUrl('2024/01/02', 'protocolo');

    expect(result.arquivos).toHaveLength(1);
    expect(result.arquivos[0].nomeParaDownload).toBe('file.mp3');
    expect(result.status).toEqual({ s3: 'ok', local: 'nao_consultado' });
    expect(findLocally).not.toHaveBeenCalled();
  });

  it('retorna resultado do indice exato quando S3 nao encontra', async () => {
    findInS3.mockResolvedValue(null);
    queryIndex.mockReturnValue([
      { file_path: '/mnt/share/file.mp3', file_name: 'file.mp3' },
    ]);

    const result = await findFileAndGetSignedUrl('2024/01/02', 'protocolo');

    expect(result.arquivos).toHaveLength(1);
    expect(result.arquivos[0].nomeParaDownload).toBe('file.mp3');
    expect(result.status).toEqual({ s3: 'nao_encontrado', local: 'indexado' });
    expect(findLocally).not.toHaveBeenCalled();
  });

  it('retorna resultado local quando S3 + indice falham', async () => {
    findInS3.mockResolvedValue(null);
    queryIndex.mockReturnValue([]);
    findLocally.mockResolvedValue([
      { downloadUrl: '/download-local?file=/mnt/share/file.mp3', nomeParaDownload: 'file.mp3' },
    ]);

    const result = await findFileAndGetSignedUrl('2024/01/02', 'protocolo');

    expect(result.arquivos).toHaveLength(1);
    expect(result.status).toEqual({ s3: 'nao_encontrado', local: 'ok' });
  });

  it('retorna resultado local quando S3 lanca erro', async () => {
    findInS3.mockRejectedValue(new Error('AccessDenied'));
    queryIndex.mockReturnValue([]);
    findLocally.mockResolvedValue([
      { downloadUrl: '/download-local?file=/mnt/share/file.mp3', nomeParaDownload: 'file.mp3' },
    ]);

    const result = await findFileAndGetSignedUrl('2024/01/02', 'protocolo');

    expect(result.arquivos).toHaveLength(1);
    expect(result.status.s3).toContain('erro');
    expect(result.status.local).toBe('ok');
  });

  it('segue para local FS mesmo quando queryIndex lanca erro', async () => {
    findInS3.mockResolvedValue(null);
    queryIndex.mockImplementation(() => { throw new Error('db locked'); });
    findLocally.mockResolvedValue([
      { downloadUrl: '/download-local?file=/mnt/share/file.mp3', nomeParaDownload: 'file.mp3' },
    ]);

    const result = await findFileAndGetSignedUrl('2024/01/02', 'protocolo');

    expect(result.arquivos).toHaveLength(1);
    expect(result.status.local).toBe('ok');
  });

  it('retorna arquivos null quando todas fontes falham', async () => {
    findInS3.mockResolvedValue(null);
    queryIndex.mockReturnValue([]);
    findLocally.mockResolvedValue(null);

    const result = await findFileAndGetSignedUrl('2024/01/02', 'protocolo');

    expect(result.arquivos).toBeNull();
    expect(result.status.s3).toBe('nao_encontrado');
    expect(result.status.local).toBe('nao_consultado');
  });

  it('retorna status erro quando local retorna objeto erro', async () => {
    findInS3.mockResolvedValue(null);
    queryIndex.mockReturnValue([]);
    findLocally.mockResolvedValue({ erro: 'Nenhum caminho de rede acessivel' });

    const result = await findFileAndGetSignedUrl('2024/01/02', 'protocolo');

    expect(result.arquivos).toBeNull();
    expect(result.status.local).toContain('erro');
  });
});
