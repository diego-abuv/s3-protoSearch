export function translateError(message) {
  if (!message) return 'Ocorreu um erro inesperado.';

  const lower = message.toLowerCase();

  if (lower.includes('timeout') || lower.includes('timed out')) {
    return 'A requisição excedeu o tempo limite. Tente novamente.';
  }

  if (lower.includes('accessdenied') || lower.includes('access denied')) {
    return 'Acesso negado. Verifique as permissões.';
  }

  if (lower.includes('network') || lower.includes('econnrefused') || lower.includes('enotfound')) {
    return 'Erro de rede. Verifique sua conexão.';
  }

  if (
    lower.includes('ehostdown') ||
    lower.includes('host is down') ||
    lower.includes('ehostunreach') ||
    lower.includes('host unreachable')
  ) {
    return 'Servidor de rede indisponível. Tente novamente.';
  }

  if (lower.includes('notfound') || lower.includes('nosuchkey') || lower.includes('no such key')) {
    return 'Arquivo não encontrado.';
  }

  if (lower.includes('busca interrompida')) {
    return 'Busca interrompida. Tente novamente.';
  }

  if (lower.includes('tempo limite')) {
    return 'O tempo limite da busca foi excedido. Tente novamente.';
  }

  if (lower.includes('conexão perdida')) {
    return 'Conexão perdida. Tente novamente.';
  }

  return 'Ocorreu um erro inesperado.';
}

export function sanitizeError(err) {
  if (!err) return 'Erro desconhecido.';

  if (err instanceof Error) {
    return err.message || 'Erro desconhecido.';
  }

  if (typeof err === 'string') {
    return err;
  }

  return 'Erro desconhecido.';
}
