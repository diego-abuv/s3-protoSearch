import { describe, it, expect, vi } from 'vitest';
import { securityHeaders } from '../../src/utils/securityHeaders.js';

function mockReq(overrides = {}) {
  return { protocol: 'http', ...overrides };
}

function mockRes() {
  const headers = {};
  return {
    setHeader: vi.fn((name, value) => {
      headers[name] = value;
    }),
    getHeader: (name) => headers[name],
  };
}

describe('securityHeaders', () => {
  it('define X-Content-Type-Options como nosniff', () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    securityHeaders(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
  });

  it('define X-Frame-Options como SAMEORIGIN', () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    securityHeaders(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'SAMEORIGIN');
  });

  it('define Content-Security-Policy com restricoes', () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    securityHeaders(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Security-Policy',
      expect.stringContaining("default-src 'self'"),
    );
  });

  it('nao define HSTS em HTTP', () => {
    const req = mockReq({ protocol: 'http' });
    const res = mockRes();
    const next = vi.fn();

    securityHeaders(req, res, next);

    const hstsCalls = res.setHeader.mock.calls.filter(([name]) => name === 'Strict-Transport-Security');
    expect(hstsCalls).toHaveLength(0);
  });

  it('define HSTS em HTTPS', () => {
    const req = mockReq({ protocol: 'https' });
    const res = mockRes();
    const next = vi.fn();

    securityHeaders(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  });

  it('chama next()', () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    securityHeaders(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('define todos os headers em uma unica chamada HTTPS', () => {
    const req = mockReq({ protocol: 'https' });
    const res = mockRes();
    const next = vi.fn();

    securityHeaders(req, res, next);

    expect(res.setHeader).toHaveBeenCalledTimes(4);
    expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'SAMEORIGIN');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Security-Policy', expect.any(String));
    expect(res.setHeader).toHaveBeenCalledWith('Strict-Transport-Security', expect.any(String));
  });
});
