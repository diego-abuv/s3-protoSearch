const ERROR_MAP = [
  // S3/AWS específicos
  { pattern: 'must be addressed', message: 'Endpoint do bucket AWS incorreto. Verifique a região configurada.' },
  { pattern: 'access denied', message: 'Credenciais AWS inválidas ou sem permissão de acesso.' },
  { pattern: 'invalidaccesskeyid', message: 'Access Key ID da AWS inválida.' },
  { pattern: 'signaturedoesnotmatch', message: 'Credenciais AWS inválidas.' },
  { pattern: 'nosuchbucket', message: 'Bucket AWS não encontrado.' },
  { pattern: 'allaccessdisabled', message: 'Acesso ao bucket AWS desabilitado.' },
  // Rede
  { pattern: 'eai_again', message: 'Sistema AWS indisponível no momento. Tente novamente mais tarde.' },
  { pattern: 'enotfound', message: 'Servidor AWS não encontrado. Verifique a conexão de rede.' },
  { pattern: 'econnrefused', message: 'Conexão recusada pelo servidor AWS. Tente novamente mais tarde.' },
  { pattern: 'socket hang up', message: 'Conexão com AWS interrompida. Tente novamente.' },
  { pattern: 'etimedout', message: 'Tempo de conexão com AWS esgotado. Tente novamente.' },
  { pattern: 'enetunreach', message: 'Rede AWS inalcançável. Verifique sua conexão.' },
  // Local
  { pattern: 'nenhum caminho', message: 'Nenhum servidor local está acessível no momento.' },
  { pattern: 'eacces', message: 'Permissão negada ao acessar o servidor local.' },
  { pattern: 'eperm', message: 'Permissão negada ao acessar o servidor local.' },
];

export function translateError(mensagem) {
  const msg = (mensagem || '').toLowerCase();
  for (const entry of ERROR_MAP) {
    if (msg.includes(entry.pattern)) return entry.message;
  }
  return 'Conexão com AWS S3 indisponível. Buscando nos servidores locais...';
}

export function sanitizeError(err) {
  const msg = (err?.message || err || '').toLowerCase();
  for (const entry of ERROR_MAP) {
    if (msg.includes(entry.pattern)) return entry.message;
  }
  return 'Erro interno do servidor.';
}
