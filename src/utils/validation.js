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
