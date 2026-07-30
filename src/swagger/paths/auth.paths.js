const errorRef = { $ref: '#/components/schemas/ErrorResponse' };

export const authPaths = {
  '/register': {
    post: {
      tags: ['Autenticação'],
      summary: 'Registrar novo usuário',
      description: 'Cria um novo usuário. Requer chave de admin no body.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['username', 'password', 'adminKey'],
              properties: {
                username: { type: 'string', minLength: 3, maxLength: 20, example: 'novousuario' },
                password: { type: 'string', minLength: 6, example: 'SenhaForte@123' },
                adminKey: {
                  type: 'string',
                  description: 'Chave de administrador (ADMIN_KEY)',
                  example: 'admin-chave-secreta',
                },
                role: { type: 'string', enum: ['user', 'admin'], default: 'user' },
              },
            },
          },
        },
      },
      responses: {
        201: {
          description: 'Usuário criado',
          content: {
            'application/json': {
              schema: { type: 'object', properties: { message: { type: 'string', example: 'usuário criado' } } },
            },
          },
        },
        400: {
          description: 'Dados inválidos',
          content: { 'application/json': { schema: errorRef, example: { error: 'username e password obrigatórios' } } },
        },
        403: {
          description: 'Chave de admin inválida',
          content: { 'application/json': { schema: errorRef, example: { error: 'chave de admin inválida' } } },
        },
        409: {
          description: 'Usuário já existe',
          content: { 'application/json': { schema: errorRef, example: { error: 'usuário já existe' } } },
        },
        429: { description: 'Muitas tentativas (rate limit 3/min)' },
      },
    },
  },
  '/login': {
    post: {
      tags: ['Autenticação'],
      summary: 'Autenticar usuário',
      description: 'Retorna access token (JWT) e define cookie httpOnly refresh_token.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['username', 'password'],
              properties: {
                username: { type: 'string', example: 'meuusuario' },
                password: { type: 'string', format: 'password', example: 'SenhaForte@123' },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Login bem-sucedido',
          headers: {
            'Set-Cookie': { schema: { type: 'string', description: 'refresh_token (httpOnly, SameSite=Strict)' } },
          },
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  access_token: { type: 'string', description: 'JWT com expiração de 15min' },
                  expires_in: { type: 'integer', example: 900 },
                },
              },
            },
          },
        },
        400: {
          description: 'Dados inválidos',
          content: { 'application/json': { schema: errorRef, example: { error: 'username e password obrigatórios' } } },
        },
        401: {
          description: 'Credenciais inválidas',
          content: { 'application/json': { schema: errorRef, example: { error: 'credenciais inválidas' } } },
        },
        403: {
          description: 'Conta bloqueada',
          content: {
            'application/json': { schema: errorRef, example: { error: 'Conta bloqueada. Contate o administrador.' } },
          },
        },
        429: { description: 'Muitas tentativas (rate limit 5/min)' },
      },
    },
  },
  '/refresh': {
    post: {
      tags: ['Autenticação'],
      summary: 'Renovar access token',
      description: 'Usa o cookie refresh_token para gerar um novo par de tokens (rotação).',
      responses: {
        200: {
          description: 'Token renovado',
          headers: {
            'Set-Cookie': { schema: { type: 'string', description: 'Novo refresh_token (rotação)' } },
          },
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  access_token: { type: 'string' },
                  expires_in: { type: 'integer', example: 900 },
                },
              },
            },
          },
        },
        401: {
          description: 'Refresh token ausente, inválido ou expirado',
          content: { 'application/json': { schema: errorRef, example: { error: 'refresh token ausente' } } },
        },
      },
    },
  },
  '/logout': {
    post: {
      tags: ['Autenticação'],
      summary: 'Encerrar sessão',
      description: 'Revoga refresh token e limpa cookie. Requer autenticação.',
      security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
      responses: {
        200: {
          description: 'Logout realizado',
          content: {
            'application/json': {
              schema: { type: 'object', properties: { message: { type: 'string', example: 'logout ok' } } },
            },
          },
        },
        401: {
          description: 'Não autenticado',
          content: { 'application/json': { schema: errorRef, example: { error: 'Token não fornecido' } } },
        },
      },
    },
  },
  '/me': {
    get: {
      tags: ['Autenticação'],
      summary: 'Dados do usuário atual',
      description: 'Retorna informações do usuário autenticado.',
      security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
      responses: {
        200: {
          description: 'Dados do usuário',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/User' },
              example: { id: 1, username: 'admin', role: 'admin' },
            },
          },
        },
        401: {
          description: 'Não autenticado',
          content: { 'application/json': { schema: errorRef, example: { error: 'Token não fornecido' } } },
        },
      },
    },
  },
};

export const authTags = 'Autenticação';
