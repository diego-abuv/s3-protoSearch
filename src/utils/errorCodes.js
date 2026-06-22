const ERROR_MAP = [
  { pattern: 'eai_again', message: 'Sistema AWS indisponível no momento. Tente novamente mais tarde.' },
  { pattern: 'enotfound', message: 'Servidor AWS não encontrado. Verifique a conexão de rede.' },
  { pattern: 'econnrefused', message: 'Conexão recusada pelo servidor AWS. Tente novamente mais tarde.' },
  { pattern: 'socket hang up', message: 'Conexão com AWS interrompida. Tente novamente.' },
  { pattern: 'etimedout', message: 'Tempo de conexão com AWS esgotado. Tente novamente.' },
  { pattern: 'enetunreach', message: 'Rede AWS inalcançável. Verifique sua conexão.' },
  { pattern: 'nenhum caminho', message: 'Nenhum servidor local está acessível no momento.' },
  { pattern: 'eacces', message: 'Permissão negada ao acessar o servidor local.' },
  { pattern: 'eperm', message: 'Permissão negada ao acessar o servidor local.' },
];

export function translateError(mensagem) {
  const msg = (mensagem || '').toLowerCase();
  for (const entry of ERROR_MAP) {
    if (msg.includes(entry.pattern)) return entry.message;
  }
  return mensagem;
}

export function sanitizeError(err) {
  const msg = (err?.message || err || '').toLowerCase();
  for (const entry of ERROR_MAP) {
    if (msg.includes(entry.pattern)) return entry.message;
  }
  return 'Erro interno do servidor.';
}
