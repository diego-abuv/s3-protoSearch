import { logger } from './logger.js';

function isRetryable(err) {
  const msg = (err?.message || err?.name || '').toLowerCase();
  return (
    msg.includes('throttl') ||
    msg.includes('timeout') ||
    msg.includes('eai_again') ||
    msg.includes('enotfound') ||
    msg.includes('eservfail') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('slowdown') ||
    msg.includes('internalerror') ||
    msg.includes('serviceunavailable') ||
    msg.includes('requesttimeout') ||
    err?.name === 'TooManyRequestsException'
  );
}

export async function withRetry(fn, options = {}) {
  const { maxRetries = 3, baseDelay = 1000, label = 'Operação' } = options;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isLast = attempt === maxRetries;

      if (isLast || !isRetryable(err)) {
        throw err;
      }

      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 500;
      logger.warn(
        `${label} — Tentativa ${attempt}/${maxRetries} falhou: ${err.message}. Retentando em ${Math.round(delay)}ms...`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
