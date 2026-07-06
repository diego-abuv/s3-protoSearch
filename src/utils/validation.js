export function validateUsername(username) {
  if (!username || username.length < 3 || username.length > 50) {
    return 'Usuário inválido.';
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
    return 'Usuário inválido.';
  }
  return null;
}

export function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').slice(0, 1024);
}

export function validatePassword(password) {
  if (!password || password.length < 6) {
    return 'Senha deve ter no mínimo 6 caracteres.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Senha deve conter pelo menos uma letra maiúscula.';
  }
  if (!/[a-z]/.test(password)) {
    return 'Senha deve conter pelo menos uma letra minúscula.';
  }
  if (!/[0-9]/.test(password)) {
    return 'Senha deve conter pelo menos um número.';
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return 'Senha deve conter pelo menos um símbolo (@, #, $, etc.).';
  }
  return null;
}
