import { describe, it, expect } from 'vitest';
import { validateUsername, sanitizeInput, validatePassword } from '../../src/utils/validation.js';

describe('validateUsername', () => {
  it('retorna null para usuario valido com ponto', () => {
    expect(validateUsername('joao.silva')).toBeNull();
  });

  it('retorna null para usuario valido com hifen', () => {
    expect(validateUsername('user-name')).toBeNull();
  });

  it('retorna null para usuario valido com underscore', () => {
    expect(validateUsername('user_name')).toBeNull();
  });

  it('retorna erro para usuario muito curto (2 caracteres)', () => {
    expect(validateUsername('ab')).toBe('Usuário inválido.');
  });

  it('retorna erro para usuario muito longo (51 caracteres)', () => {
    expect(validateUsername('a'.repeat(51))).toBe('Usuário inválido.');
  });

  it('retorna erro para caracteres especiais', () => {
    expect(validateUsername('@dmin!')).toBe('Usuário inválido.');
  });

  it('retorna erro para null', () => {
    expect(validateUsername(null)).toBe('Usuário inválido.');
  });

  it('retorna erro para undefined', () => {
    expect(validateUsername(undefined)).toBe('Usuário inválido.');
  });

  it('retorna erro para string vazia', () => {
    expect(validateUsername('')).toBe('Usuário inválido.');
  });

  it('retorna null para exatamente 3 caracteres', () => {
    expect(validateUsername('abc')).toBeNull();
  });

  it('retorna null para exatamente 50 caracteres', () => {
    expect(validateUsername('a'.repeat(50))).toBeNull();
  });
});

describe('sanitizeInput', () => {
  it('retorna string normal inalterada', () => {
    expect(sanitizeInput('hello')).toBe('hello');
  });

  it('retorna string vazia para null', () => {
    expect(sanitizeInput(null)).toBe('');
  });

  it('retorna string vazia para undefined', () => {
    expect(sanitizeInput(undefined)).toBe('');
  });

  it('retorna string vazia para numero', () => {
    expect(sanitizeInput(123)).toBe('');
  });

  it('retorna string vazia para objeto', () => {
    expect(sanitizeInput({})).toBe('');
  });

  it('remove caracteres de controle', () => {
    expect(sanitizeInput('\x00abc\x01')).toBe('abc');
  });

  it('trunca string acima de 1024 caracteres', () => {
    const longStr = 'a'.repeat(1025);
    const result = sanitizeInput(longStr);
    expect(result.length).toBe(1024);
    expect(result).toBe('a'.repeat(1024));
  });
});

describe('validatePassword', () => {
  it('retorna null para senha valida', () => {
    expect(validatePassword('SenhaForte@123')).toBeNull();
  });

  it('retorna erro para senha muito curta (menos de 12)', () => {
    expect(validatePassword('Abc@1Def2')).toBe('Senha deve ter no mínimo 12 caracteres.');
  });

  it('retorna erro para null', () => {
    expect(validatePassword(null)).toBe('Senha deve ter no mínimo 12 caracteres.');
  });

  it('retorna erro para string vazia', () => {
    expect(validatePassword('')).toBe('Senha deve ter no mínimo 12 caracteres.');
  });

  it('retorna erro sem maiuscula', () => {
    expect(validatePassword('senhaforte@123')).toBe('Senha deve conter pelo menos uma letra maiúscula.');
  });

  it('retorna erro sem minuscula', () => {
    expect(validatePassword('SENHAFORTE@123')).toBe('Senha deve conter pelo menos uma letra minúscula.');
  });

  it('retorna erro sem numero', () => {
    expect(validatePassword('SenhaForte@abc')).toBe('Senha deve conter pelo menos um número.');
  });

  it('retorna erro sem simbolo', () => {
    expect(validatePassword('SenhaForte123')).toBe('Senha deve conter pelo menos um símbolo (@, #, $, etc.).');
  });
});
