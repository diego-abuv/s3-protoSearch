import { createApp } from './app.js';
import 'dotenv/config';
import os from 'os';
import { logger } from './utils/logger.js';

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
  logger.info('Iniciando servidor com serviço de busca unificado (S3 com fallback local)...');
  const searchableService = await import('./services/unifiedSearchService.js');

  const app = await createApp(searchableService);
  const port = process.env.PORT || 80;
  const host = '0.0.0.0';
  const ipLocal = getLocalIp();

  app.listen(port, host, () => {
    logger.info(`Servidor rodando em http://${host}:${port}, acessível via http://${ipLocal}:${port} na rede local.`);
  });
}

startServer();
