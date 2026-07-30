import { paths, tags } from './paths/index.js';
import { schemas } from './schemas.js';
import { securitySchemes } from './security.js';

export const swaggerSpec = {
  openapi: '3.1.0',
  info: {
    title: 'S3 ProtoSearch API',
    version: '1.0.0',
    description:
      'API de busca e download de arquivos de áudio com fallback entre S3 e sistema de arquivos local (CIFS). ' +
      'Suporta busca via SSE (Server-Sent Events) para progresso em tempo real.',
  },
  servers: [{ url: '/', description: 'Servidor local / produção' }],
  tags,
  components: {
    securitySchemes,
    schemas,
  },
  paths,
};
