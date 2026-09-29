// Status possíveis reportados por localSearchService em "share indisponivel: NOME:status,...",
// em ordem de prioridade — quando vários shares falham com status diferentes, a mensagem
// exibida ao usuário reflete a causa mais relevante (rede antes de permissão, por exemplo).
const SHARE_STATUS_MESSAGES = [
  ['rede', 'Servidor de rede indisponível. Tente novamente.'],
  ['nao-montado', 'Share não está montado no servidor. Contate o suporte técnico.'],
  ['vazio', 'Share aparenta estar vazio ou desconectado. Contate o suporte técnico.'],
  ['permissao', 'Acesso negado ao share. Verifique as permissões.'],
  ['erro', 'Falha ao acessar o share. Contate o suporte técnico.'],
];

function translateShareIndisponivel(message) {
  const match = message.match(/share indisponivel:\s*(.+)/i);
  if (!match) return null;

  const statuses = match[1]
    .split(',')
    .map((entry) => entry.split(':').pop()?.trim().toLowerCase())
    .filter(Boolean);

  for (const [status, mensagem] of SHARE_STATUS_MESSAGES) {
    if (statuses.includes(status)) return mensagem;
  }
  return 'Servidor de rede indisponível. Tente novamente.';
}

export function translateError(message) {
  if (!message) return 'Ocorreu um erro inesperado.';

  const shareMessage = translateShareIndisponivel(message);
  if (shareMessage) return shareMessage;

  const lower = message.toLowerCase();

  if (
    lower.includes('ehostdown') ||
    lower.includes('host is down') ||
    lower.includes('ehostunreach') ||
    lower.includes('host unreachable') ||
    lower.includes('nenhum caminho de rede')
  ) {
    return 'Servidor de rede indisponível. Tente novamente.';
  }

  if (
    lower.includes('accessdenied') ||
    lower.includes('access denied') ||
    lower.includes('eacces') ||
    lower.includes('eperm')
  ) {
    return 'Acesso negado. Verifique as permissões.';
  }

  if (lower.includes('timeout') || lower.includes('timed out')) {
    return 'A requisição excedeu o tempo limite. Tente novamente.';
  }

  if (lower.includes('network') || lower.includes('econnrefused') || lower.includes('enotfound')) {
    return 'Erro de rede. Verifique sua conexão.';
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
