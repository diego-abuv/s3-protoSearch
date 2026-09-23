import 'dotenv/config';
import { createApp } from './app.js';
import os from 'os';
import { systemLog } from './utils/logger.js';

process.on('unhandledRejection', (reason) => {
  systemLog.error('Unhandled rejection:', reason);
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  systemLog.error('Uncaught exception:', err);
  process.exit(1);
});
process.on('SIGTERM', () => {
  systemLog.info('Servidor encerrando (SIGTERM)');
  process.exit(0);
});
process.on('SIGINT', () => {
  systemLog.info('Servidor encerrando (SIGINT)');
  process.exit(0);
});
process.on('exit', (code) => {
  if (code !== 0) {
    console.error(`[FATAL] Processo encerrou com código ${code}`);
  }
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
    systemLog.error('JWT_SECRET não configurado ou incorreto.');
    process.exit(1);
  }

  if (!process.env.API_KEY) {
    systemLog.error('API_KEY não configurado ou incorreto.');
    process.exit(1);
  }

  if (!process.env.ADMIN_KEY) {
    systemLog.error('ADMIN_KEY não configurado ou incorreto.');
    process.exit(1);
  }

  systemLog.info('Iniciando servidor com serviço de busca unificado (S3 com fallback local)...');
  const searchableService = await import('./services/unifiedSearchService.js');

  const app = await createApp(searchableService);
  const port = process.env.PORT || 80;
  const host = '0.0.0.0';
  const publicHost = process.env.PUBLIC_HOST || getLocalIp();
  const publicProtocol = process.env.PUBLIC_PROTOCOL || 'http';
  const portSuffix = port == 80 || port == 443 ? '' : `:${port}`;

  const server = app.listen(port, host, () => {
    systemLog.info(
      `Servidor rodando em ${publicProtocol}://${host}:${port}, acessível em ${publicProtocol}://${publicHost}${portSuffix}`,
    );
  });

  server.timeout = 900_000;
  server.headersTimeout = 905_000;
}

startServer();
