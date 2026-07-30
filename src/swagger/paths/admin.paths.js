const errorRef = { $ref: '#/components/schemas/ErrorResponse' };
const errEx = (msg) => ({ schema: errorRef, example: { error: msg } });
const adminSec = [{ bearerAuth: [] }];

const forbidden = {
  description: 'Acesso restrito a administradores',
  content: { 'application/json': errEx('Acesso restrito a administradores') },
};
const tooManyReqs = {
  description: 'Muitas requisições (rate limit 300/min)',
  content: { 'application/json': errEx('Muitas requisições. Tente novamente.') },
};
const notFound = {
  description: 'Usuário não encontrado',
  content: { 'application/json': errEx('Usuário não encontrado') },
};
const badRequest = {
  description: 'Dados inválidos',
  content: { 'application/json': errEx('username e password são obrigatórios') },
};
const conflict = { description: 'Usuário já existe', content: { 'application/json': errEx('usuário já existe') } };

const listUsersResp = {
  200: {
    description: 'Lista de usuários',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            message: { type: 'string', example: 'Lista de usuários' },
            users: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'integer' },
                  username: { type: 'string' },
                  role: { type: 'string' },
                  blocked: { type: 'integer', enum: [0, 1] },
                  last_login: { type: 'string', nullable: true },
                  is_online: { type: 'boolean' },
                },
              },
            },
          },
        },
      },
    },
  },
  403: forbidden,
};

const userParam = {
  in: 'path',
  name: 'id',
  required: true,
  schema: { type: 'integer' },
  description: 'ID do usuário',
  example: 1,
};

const userCreatedResp = {
  201: {
    description: 'Usuário criado',
    content: {
      'application/json': {
        schema: { type: 'object', properties: { message: { type: 'string', example: 'Usuário criado com sucesso' } } },
      },
    },
  },
  400: badRequest,
  409: conflict,
};

const userUpdatedResp = {
  200: {
    description: 'Usuário atualizado',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: { message: { type: 'string', example: 'Usuário atualizado com sucesso' } },
        },
      },
    },
  },
  400: badRequest,
  404: notFound,
};

const userDeletedResp = {
  200: {
    description: 'Usuário excluído',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: { message: { type: 'string', example: 'Usuário excluído com sucesso' } },
        },
      },
    },
  },
  404: notFound,
};

const blockedResp = {
  200: {
    description: 'Estado alterado',
    content: {
      'application/json': {
        schema: { type: 'object', properties: { message: { type: 'string', example: 'Usuário bloqueado' } } },
      },
    },
  },
  404: notFound,
};

const sessionsRevokedResp = {
  200: {
    description: 'Sessões revogadas',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: { message: { type: 'string', example: 'Sessões revogadas com sucesso' } },
        },
      },
    },
  },
  404: notFound,
};

const passwordResetResp = {
  200: {
    description: 'Senha redefinida',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: { message: { type: 'string', example: 'Senha redefinida com sucesso' } },
        },
      },
    },
  },
  400: badRequest,
  404: notFound,
};

export const adminPaths = {
  '/admin/users': {
    get: {
      tags: ['Admin'],
      summary: 'Listar usuários',
      description: 'Retorna todos os usuários com status de login e block.',
      security: adminSec,
      responses: { ...listUsersResp, 429: tooManyReqs },
    },
    post: {
      tags: ['Admin'],
      summary: 'Criar usuário',
      description: 'Cria um novo usuário com role opcional.',
      security: adminSec,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['username', 'password'],
              properties: {
                username: { type: 'string', minLength: 3, maxLength: 20, example: 'novousuario' },
                password: { type: 'string', minLength: 6, example: 'SenhaForte@123' },
                role: { type: 'string', enum: ['user', 'admin'], default: 'user' },
              },
            },
          },
        },
      },
      responses: { ...userCreatedResp, 403: forbidden, 429: tooManyReqs },
    },
  },
  '/admin/users/{id}': {
    patch: {
      tags: ['Admin'],
      summary: 'Atualizar usuário',
      description: 'Atualiza parcialmente username, password e/ou role.',
      security: adminSec,
      parameters: [userParam],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                username: { type: 'string', example: 'novonome' },
                password: { type: 'string', minLength: 6, example: 'NovaSenha@123' },
                role: { type: 'string', enum: ['user', 'admin'] },
              },
            },
          },
        },
      },
      responses: { ...userUpdatedResp, 403: forbidden, 429: tooManyReqs },
    },
    delete: {
      tags: ['Admin'],
      summary: 'Excluir usuário',
      description: 'Remove usuário e todos os seus refresh tokens.',
      security: adminSec,
      parameters: [userParam],
      responses: { ...userDeletedResp, 403: forbidden, 429: tooManyReqs },
    },
  },
  '/admin/users/{id}/block': {
    patch: {
      tags: ['Admin'],
      summary: 'Bloquear/desbloquear usuário',
      description: 'Alterna o estado de bloqueio. Ao bloquear, sessões são revogadas.',
      security: adminSec,
      parameters: [userParam],
      responses: { ...blockedResp, 403: forbidden, 429: tooManyReqs },
    },
  },
  '/admin/users/{id}/force-logout': {
    post: {
      tags: ['Admin'],
      summary: 'Forçar logout de usuário',
      description: 'Revoga todas as sessões (refresh tokens) de um usuário.',
      security: adminSec,
      parameters: [userParam],
      responses: { ...sessionsRevokedResp, 403: forbidden, 429: tooManyReqs },
    },
  },
  '/admin/users/{id}/reset-password': {
    post: {
      tags: ['Admin'],
      summary: 'Redefinir senha de usuário',
      description: 'Define uma nova senha para o usuário.',
      security: adminSec,
      parameters: [userParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['password'],
              properties: {
                password: { type: 'string', minLength: 6, example: 'NovaSenha@123' },
              },
            },
          },
        },
      },
      responses: { ...passwordResetResp, 403: forbidden, 429: tooManyReqs },
    },
  },
  '/admin/audit': {
    get: {
      tags: ['Admin'],
      summary: 'Listar log de auditoria',
      description: 'Retorna logs de auditoria paginados com filtros opcionais.',
      security: adminSec,
      parameters: [
        { in: 'query', name: 'limit', schema: { type: 'integer', default: 50, maximum: 200 } },
        { in: 'query', name: 'offset', schema: { type: 'integer', default: 0 } },
        { in: 'query', name: 'user', schema: { type: 'string' }, description: 'Filtrar por username' },
        { in: 'query', name: 'action', schema: { type: 'string' }, description: 'Filtrar por ação' },
        {
          in: 'query',
          name: 'from',
          schema: { type: 'string', format: 'date' },
          description: 'Data inicial (YYYY-MM-DD)',
        },
        { in: 'query', name: 'to', schema: { type: 'string', format: 'date' }, description: 'Data final (YYYY-MM-DD)' },
      ],
      responses: {
        200: {
          description: 'Página do audit log',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  logs: { type: 'array', items: { $ref: '#/components/schemas/AuditLog' } },
                  total: { type: 'integer' },
                  limit: { type: 'integer' },
                  offset: { type: 'integer' },
                },
              },
            },
          },
        },
        403: forbidden,
        429: tooManyReqs,
      },
    },
  },
  '/admin/audit/export': {
    get: {
      tags: ['Admin'],
      summary: 'Exportar audit log como CSV',
      description: 'Exporta até 10.000 registros do audit log no formato CSV.',
      security: adminSec,
      parameters: [
        { in: 'query', name: 'user', schema: { type: 'string' } },
        { in: 'query', name: 'action', schema: { type: 'string' } },
        { in: 'query', name: 'from', schema: { type: 'string', format: 'date' } },
        { in: 'query', name: 'to', schema: { type: 'string', format: 'date' } },
      ],
      responses: {
        200: {
          description: 'Arquivo CSV',
          content: {
            'text/csv': {
              schema: {
                type: 'string',
                description: 'CSV com colunas id, user_id, username, action, target, details, ip, created_at',
              },
            },
          },
        },
        403: forbidden,
        429: tooManyReqs,
      },
    },
  },
  '/admin/stats': {
    get: {
      tags: ['Admin'],
      summary: 'Estatísticas gerais',
      description: 'Retorna contagens de usuários, logs, buscas do dia e usuários ativos.',
      security: adminSec,
      responses: {
        200: {
          description: 'Estatísticas',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  users: { type: 'integer', description: 'Total de usuários' },
                  audit_logs: { type: 'integer', description: 'Total de registros no audit log' },
                  searches_today: { type: 'integer', description: 'Total de buscas hoje' },
                  active_users: { type: 'integer', description: 'Usuários com sessão ativa' },
                },
              },
            },
          },
        },
        403: forbidden,
        429: tooManyReqs,
      },
    },
  },
  '/admin/stats/chart': {
    get: {
      tags: ['Admin'],
      summary: 'Gráfico de buscas (7 dias)',
      description: 'Retorna total de buscas por dia nos últimos 7 dias.',
      security: adminSec,
      responses: {
        200: {
          description: 'Dados do gráfico',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        day: { type: 'string', format: 'date' },
                        total: { type: 'integer' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        403: forbidden,
        429: tooManyReqs,
      },
    },
  },
};

export const adminTags = 'Admin';
