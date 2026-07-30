export const downloadPaths = {
  '/download-local': {
    get: {
      tags: ['Download'],
      summary: 'Baixar arquivo do sistema local',
      description:
        'Baixa um arquivo do sistema de arquivos local (CIFS). Valida path-traversal contra PATH_<ID> configurados.',
      security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
      parameters: [
        {
          in: 'query',
          name: 'file',
          required: true,
          schema: { type: 'string' },
          description: 'Caminho absoluto do arquivo no servidor',
          example: '/mnt/share/2025/12/01/12345.mp3',
        },
      ],
      responses: {
        200: {
          description: 'Arquivo transferido',
          content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } },
        },
        400: {
          description: 'Parâmetro "file" não especificado',
          content: { 'text/plain': { schema: { type: 'string', example: 'Parâmetro "file" não especificado.' } } },
        },
        403: {
          description: 'Acesso negado (path-traversal detectado)',
          content: { 'text/plain': { schema: { type: 'string', example: 'Acesso negado.' } } },
        },
      },
    },
  },
  '/download-s3': {
    get: {
      tags: ['Download'],
      summary: 'Baixar arquivo do S3',
      description: 'Stream do objeto diretamente do S3.',
      security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
      parameters: [
        {
          in: 'query',
          name: 'key',
          required: true,
          schema: { type: 'string' },
          description: 'Chave do objeto no S3',
          example: 'audios/2025/12/01/12345.mp3',
        },
        {
          in: 'query',
          name: 'nome',
          required: false,
          schema: { type: 'string' },
          description: 'Nome alternativo para Content-Disposition',
          example: 'protocolo-12345.mp3',
        },
      ],
      responses: {
        200: {
          description: 'Stream do arquivo',
          content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } },
        },
        400: {
          description: 'Parâmetro "key" não especificado',
          content: { 'text/plain': { schema: { type: 'string', example: 'Parâmetro "key" não especificado.' } } },
        },
        500: {
          description: 'Erro ao baixar do S3',
          content: { 'text/plain': { schema: { type: 'string', example: 'Erro ao baixar arquivo do S3.' } } },
        },
      },
    },
  },
};

export const downloadTags = 'Download';
