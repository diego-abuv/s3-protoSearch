import { createApp } from './app.js';
import 'dotenv/config';
import os from 'os';
import { logger } from './utils/logger.js';

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason);
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception:', err);
});
process.on('exit', (code) => {
  console.error(`[FATAL] Processo encerrou com código ${code}`);
});

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

async function startServer() {
  if (!process.env.JWT_SECRET) {
    logger.error('JWT_SECRET não configurado ou incorreto.');
    process.exit(1);
  }

  if (!process.env.API_KEY) {
    logger.error('API_KEY não configurado ou incorreto.');
    process.exit(1);
  }

  if (!process.env.ADMIN_KEY) {
    logger.error('ADMIN_KEY não configurado ou incorreto.');
    process.exit(1);
  }

  logger.info('Iniciando servidor com serviço de busca unificado (S3 com fallback local)...');
  const searchableService = await import('./services/unifiedSearchService.js');

  const app = await createApp(searchableService);
  const port = process.env.PORT || 80;
  const host = '0.0.0.0';
  const publicHost = process.env.PUBLIC_HOST || getLocalIp();
  const publicProtocol = process.env.PUBLIC_PROTOCOL || 'http';
  const portSuffix = port == 80 || port == 443 ? '' : `:${port}`;

  const server = app.listen(port, host, () => {
    logger.info(
      `Servidor rodando em ${publicProtocol}://${host}:${port}, acessível em ${publicProtocol}://${publicHost}${portSuffix}`,
    );
  });

  server.timeout = 120_000;
  server.headersTimeout = 125_000;
}

startServer();
