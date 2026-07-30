export const schemas = {
  ErrorResponse: {
    type: 'object',
    properties: {
      error: { type: 'string', description: 'Mensagem de erro' },
    },
  },
  StatusInfo: {
    type: 'object',
    properties: {
      s3: {
        type: 'string',
        enum: ['ok', 'nao_encontrado', 'nao_consultado'],
        description: 'Status da busca no S3',
      },
      local: {
        type: 'string',
        enum: ['ok', 'nao_encontrado', 'nao_consultado'],
        description: 'Status da busca no armazenamento local',
      },
    },
  },
  SearchResult: {
    type: 'object',
    properties: {
      encontrado: { type: 'boolean' },
      arquivos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            nome: { type: 'string' },
            url: { type: 'string', description: 'URL da miniatura/download' },
            source: { type: 'string', enum: ['s3', 'local'] },
          },
        },
        nullable: true,
      },
      status: { $ref: '#/components/schemas/StatusInfo' },
      error: { type: 'string', nullable: true },
    },
  },
  User: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      username: { type: 'string' },
      role: { type: 'string', enum: ['user', 'admin'] },
    },
  },
  AuditLog: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      user_id: { type: 'integer' },
      username: { type: 'string' },
      action: { type: 'string' },
      target: { type: 'string', nullable: true },
      details: { type: 'string', nullable: true },
      ip: { type: 'string' },
      created_at: { type: 'string', format: 'date-time' },
    },
  },
};
