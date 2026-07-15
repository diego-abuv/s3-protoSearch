import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '../../src/utils/retry.js';

describe('withRetry', () => {
  it('retorna resultado se funcao bem-sucedida na primeira tentativa', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { maxRetries: 3 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('rejeita imediatamente erro nao retryavel', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Not found'));
    await expect(withRetry(fn, { maxRetries: 3 })).rejects.toThrow('Not found');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retenta e resolve se erro retryavel for temporario', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('throttling exceeded'))
      .mockRejectedValueOnce(new Error('throttling exceeded'))
      .mockResolvedValue('recuperado');

    const result = await withRetry(fn, { maxRetries: 3, baseDelay: 10 });
    expect(result).toBe('recuperado');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('rejeita apos exaurir todas as tentativas com erro retryavel', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('timeout'));
    await expect(withRetry(fn, { maxRetries: 2, baseDelay: 10 })).rejects.toThrow('timeout');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('aceita maxRetries customizado', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('throttle'));
    await expect(withRetry(fn, { maxRetries: 5, baseDelay: 10 })).rejects.toThrow('throttle');
    expect(fn).toHaveBeenCalledTimes(5);
  });

  it('respeita baseDelay customizado (tempo entre retries)', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('econnrefused'))
      .mockResolvedValue('conectado');

    const inicio = Date.now();
    await withRetry(fn, { maxRetries: 2, baseDelay: 100 });
    const elapsed = Date.now() - inicio;

    expect(elapsed).toBeGreaterThanOrEqual(95);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retorna label correta no log', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue('ok');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await withRetry(fn, { maxRetries: 2, baseDelay: 10, label: 'MinhaOperacao' });

    expect(logSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('MinhaOperacao'),
    );
    logSpy.mockRestore();
  });
});

describe('isRetryable (interno)', () => {
  it('identifica throttle como retryavel', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('ThrottlingException'));
    await expect(withRetry(fn, { maxRetries: 2, baseDelay: 10 })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('identifica timeout como retryavel', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Request Timeout'));
    await expect(withRetry(fn, { maxRetries: 2, baseDelay: 10 })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('identifica EAI_AGAIN como retryavel', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('EAI_AGAIN'));
    await expect(withRetry(fn, { maxRetries: 2, baseDelay: 10 })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('identifica ECONNRESET como retryavel', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    await expect(withRetry(fn, { maxRetries: 2, baseDelay: 10 })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('identifica ECONNREFUSED como retryavel', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(withRetry(fn, { maxRetries: 2, baseDelay: 10 })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('identifica TooManyRequestsException como retryavel', async () => {
    const err = new Error('rate limited');
    err.name = 'TooManyRequestsException';
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withRetry(fn, { maxRetries: 2, baseDelay: 10 })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('identifica InternalError como retryavel', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('InternalError'));
    await expect(withRetry(fn, { maxRetries: 2, baseDelay: 10 })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('identifica ServiceUnavailable como retryavel', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('ServiceUnavailable'));
    await expect(withRetry(fn, { maxRetries: 2, baseDelay: 10 })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('identifica slowdown como retryavel', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('slowdown'));
    await expect(withRetry(fn, { maxRetries: 2, baseDelay: 10 })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('nao retenta erro generico (ex: 403 forbidden)', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Forbidden'));
    await expect(withRetry(fn, { maxRetries: 3, baseDelay: 10 })).rejects.toThrow('Forbidden');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('nao retenta erro de validacao', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('ValidationError'));
    await expect(withRetry(fn, { maxRetries: 3, baseDelay: 10 })).rejects.toThrow('ValidationError');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
