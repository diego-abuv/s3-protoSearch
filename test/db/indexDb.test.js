import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';

vi.mock('fs', () => {
  const mockFs = {
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    unlinkSync: vi.fn(),
  };
  return { ...mockFs, default: mockFs };
});

import { initIndexDb, queryIndex, runIndex, isDirScanned, markDirScanned, saveIndex } from '../../src/db/indexDb.js';

describe('sem initIndexDb', () => {
  it('isDirScanned() retorna false sem init', () => {
    expect(isDirScanned('/root', 'any')).toBe(false);
  });

  it('runIndex() lanca erro sem init', () => {
    expect(() => runIndex('SELECT 1')).toThrow('Index database not initialized');
  });
});

describe('com initIndexDb', () => {
  beforeAll(async () => {
    await initIndexDb();
  });

  afterEach(() => {
    runIndex('DELETE FROM file_index');
    runIndex('DELETE FROM scanned_dirs');
  });

  it('queryIndex() retorna resultados', () => {
    runIndex('INSERT INTO file_index (protocol_number, file_path, file_name, search_root) VALUES (?, ?, ?, ?)', [
      '123',
      '/path/to/file.wav',
      'file.wav',
      '/sharepoint/test',
    ]);
    const rows = queryIndex('SELECT * FROM file_index WHERE protocol_number = ?', ['123']);
    expect(rows).toHaveLength(1);
    expect(rows[0].file_name).toBe('file.wav');
  });

  it('queryIndex() retorna array vazio', () => {
    const rows = queryIndex('SELECT * FROM file_index WHERE protocol_number = ?', ['nonexistent']);
    expect(rows).toEqual([]);
  });

  it('runIndex() executa comando', () => {
    runIndex('INSERT INTO file_index (protocol_number, file_path, file_name, search_root) VALUES (?, ?, ?, ?)', [
      '456',
      '/path/to/audio.wav',
      'audio.wav',
      '/sharepoint/test',
    ]);
    const rows = queryIndex('SELECT * FROM file_index WHERE protocol_number = ?', ['456']);
    expect(rows).toHaveLength(1);
  });

  it('isDirScanned() retorna false antes de marcar', () => {
    expect(isDirScanned('/root', '2024/1/1')).toBe(false);
  });

  it('markDirScanned() + isDirScanned() retorna true', () => {
    markDirScanned('/root', '2024/1/1');
    expect(isDirScanned('/root', '2024/1/1')).toBe(true);
  });

  it('saveIndex() exporta sem erro', () => {
    expect(() => saveIndex()).not.toThrow();
  });

  it('isDirScanned() retorna false para scan expirado', () => {
    markDirScanned('/root', 'expired-dir');
    runIndex(
      "UPDATE scanned_dirs SET indexed_at = datetime('now', '-25 hours') WHERE search_root = ? AND dir_path = ?",
      ['/root', 'expired-dir'],
    );
    expect(isDirScanned('/root', 'expired-dir')).toBe(false);
  });

  it('isDirScanned() respeita maxAgeHours customizado', () => {
    markDirScanned('/root', 'recent-dir');
    expect(isDirScanned('/root', 'recent-dir', 48)).toBe(true);
  });
});
