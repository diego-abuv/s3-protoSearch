const cor = {
  reset: '\x1b[0m',
  vermelho: '\x1b[31m',
  verde: '\x1b[32m',
  amarelo: '\x1b[33m',
  azul: '\x1b[34m',
  ciano: '\x1b[36m',
  cinza: '\x1b[90m',
  bold: '\x1b[1m',
};

export const logger = {
  info: (...args) => console.log(`${cor.azul}[INFO]${cor.reset}`, ...args),
  success: (...args) => console.log(`${cor.verde}[OK]${cor.reset}`, ...args),
  warn: (...args) => console.log(`${cor.amarelo}[AVISO]${cor.reset}`, ...args),
  error: (...args) => console.log(`${cor.vermelho}[ERRO]${cor.reset}`, ...args),
  section: (...args) => console.log(`\n${cor.bold}${cor.ciano}---`, ...args, `---${cor.reset}`),
  destaque: (...args) => console.log(`${cor.bold}${cor.azul}`, ...args, `${cor.reset}`),
};
