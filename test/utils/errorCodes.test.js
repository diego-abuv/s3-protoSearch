import { describe, it, expect } from 'vitest';
import { translateError, sanitizeError } from '../../src/utils/errorCodes.js';

describe('translateError', () => {
  it('retorna mensagem de timeout quando mensagem contem timeout', () => {
    expect(translateError('Timeout')).toBe('A requisição excedeu o tempo limite. Tente novamente.');
  });

  it('retorna mensagem de timeout para timed out', () => {
    expect(translateError('Request timed out')).toBe('A requisição excedeu o tempo limite. Tente novamente.');
  });

  it('retorna mensagem de acesso negado', () => {
    expect(translateError('AccessDenied')).toBe('Acesso negado. Verifique as permissões.');
  });

  it('retorna mensagem de acesso negado para Access Denied', () => {
    expect(translateError('Access Denied')).toBe('Acesso negado. Verifique as permissões.');
  });

  it('retorna mensagem de erro de rede', () => {
    expect(translateError('Network error')).toBe('Erro de rede. Verifique sua conexão.');
  });

  it('retorna mensagem de erro de rede para ECONNREFUSED', () => {
    expect(translateError('econnrefused')).toBe('Erro de rede. Verifique sua conexão.');
  });

  it('retorna mensagem de erro de rede para ENOTFOUND', () => {
    expect(translateError('enotfound')).toBe('Erro de rede. Verifique sua conexão.');
  });

  it('prefere servidor indisponivel a timeout quando a mensagem combina os dois', () => {
    expect(translateError('EHOSTDOWN: host is down, readdir ETIMEDOUT')).toBe(
      'Servidor de rede indisponível. Tente novamente.',
    );
  });

  it('retorna mensagem de servidor indisponivel quando nenhum caminho de rede esta acessivel', () => {
    expect(translateError('Nenhum caminho de rede acessivel')).toBe('Servidor de rede indisponível. Tente novamente.');
  });

  describe('share indisponivel — mensagem por status', () => {
    it('retorna mensagem de rede para status rede', () => {
      expect(translateError('share indisponivel: STORAGE:rede')).toBe(
        'Servidor de rede indisponível. Tente novamente.',
      );
    });

    it('retorna mensagem especifica quando o share nao esta montado', () => {
      expect(translateError('share indisponivel: STORAGE:nao-montado')).toBe(
        'Share não está montado no servidor. Contate o suporte técnico.',
      );
    });

    it('retorna mensagem especifica quando a raiz do share esta vazia', () => {
      expect(translateError('share indisponivel: STORAGE:vazio')).toBe(
        'Share aparenta estar vazio ou desconectado. Contate o suporte técnico.',
      );
    });

    it('retorna mensagem de acesso negado quando o status e permissao', () => {
      expect(translateError('share indisponivel: STORAGE:permissao')).toBe(
        'Acesso negado ao share. Verifique as permissões.',
      );
    });

    it('retorna mensagem generica de falha quando o status e erro', () => {
      expect(translateError('share indisponivel: STORAGE:erro')).toBe(
        'Falha ao acessar o share. Contate o suporte técnico.',
      );
    });

    it('prioriza rede sobre permissao quando shares diferentes falham com status diferentes', () => {
      expect(translateError('share indisponivel: BACKUP:permissao,STORAGE:rede')).toBe(
        'Servidor de rede indisponível. Tente novamente.',
      );
    });

    it('prioriza nao-montado sobre permissao quando shares diferentes falham com status diferentes', () => {
      expect(translateError('share indisponivel: BACKUP:permissao,STORAGE:nao-montado')).toBe(
        'Share não está montado no servidor. Contate o suporte técnico.',
      );
    });
  });

  it('retorna mensagem de acesso negado para EACCES', () => {
    expect(translateError('EACCES: permission denied, stat /sharepoint/192-168-16-74')).toBe(
      'Acesso negado. Verifique as permissões.',
    );
  });

  it('retorna mensagem de acesso negado para EPERM', () => {
    expect(translateError('EPERM: operation not permitted')).toBe('Acesso negado. Verifique as permissões.');
  });

  it('nao confunde EACCES com arquivo nao encontrado', () => {
    expect(translateError('EACCES: permission denied')).not.toBe('Arquivo não encontrado.');
  });

  it('retorna mensagem de arquivo nao encontrado', () => {
    expect(translateError('NotFound')).toBe('Arquivo não encontrado.');
  });

  it('retorna mensagem de arquivo nao encontrado para NoSuchKey', () => {
    expect(translateError('NoSuchKey - the specified key does not exist')).toBe('Arquivo não encontrado.');
  });

  it('retorna mensagem de busca interrompida', () => {
    expect(translateError('busca interrompida')).toBe('Busca interrompida. Tente novamente.');
  });

  it('retorna mensagem de tempo limite excedido', () => {
    expect(translateError('tempo limite excedido')).toBe('O tempo limite da busca foi excedido. Tente novamente.');
  });

  it('retorna mensagem de conexao perdida', () => {
    expect(translateError('conexão perdida')).toBe('Conexão perdida. Tente novamente.');
  });

  it('retorna mensagem fallback para erro desconhecido', () => {
    expect(translateError('erro generico')).toBe('Ocorreu um erro inesperado.');
  });
});

describe('sanitizeError', () => {
  it('retorna mensagem do Error object', () => {
    expect(sanitizeError(new Error('teste'))).toBe('teste');
  });

  it('retorna string diretamente', () => {
    expect(sanitizeError('erro direto')).toBe('erro direto');
  });

  it('retorna mensagem generica para undefined', () => {
    expect(sanitizeError(undefined)).toBe('Erro desconhecido.');
  });

  it('retorna mensagem generica para null', () => {
    expect(sanitizeError(null)).toBe('Erro desconhecido.');
  });

  it('retorna mensagem generica para objeto sem message', () => {
    expect(sanitizeError({})).toBe('Erro desconhecido.');
  });
});
