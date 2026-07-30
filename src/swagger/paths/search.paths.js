const resultRef = { $ref: '#/components/schemas/SearchResult' };
const errorRef = { $ref: '#/components/schemas/ErrorResponse' };

export const searchPaths = {
  '/buscar-arquivo': {
    post: {
      tags: ['Busca'],
      summary: 'Buscar arquivo por pasta + protocolo',
      description: `Busca arquivo de áudio em S3 e/ou sistema local (fallback).
Se o header \`Accept: text/event-stream\` for enviado, a resposta é SSE:
- \`event: searchToken\` — token para cancelamento
- \`event: progress\` — status parcial
- \`event: heartbeat\` — mantém conexão ativa (a cada 60s)
- \`event: result\` — resultado final
Caso contrário, retorna JSON.`,
      security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['pasta', 'nomeProtocolo'],
              properties: {
                pasta: { type: 'string', description: 'Data no formato YYYY-MM-DD', example: '2025-12-01' },
                nomeProtocolo: {
                  type: 'string',
                  description: 'Número do protocolo / nome do arquivo',
                  example: '12345',
                },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Arquivo encontrado',
          content: {
            'application/json': {
              schema: resultRef,
              example: {
                encontrado: true,
                arquivos: [
                  { nome: 'protocolo-12345-01.mp3', url: 'https://s3.amazonaws.com/bucket/audios/...', source: 's3' },
                  { nome: 'protocolo-12345-02.mp3', url: 'https://servidor/download-local?file=...', source: 'local' },
                ],
                status: { s3: 'ok', local: 'ok' },
              },
            },
          },
        },
        400: {
          description: 'Campos obrigatórios ausentes',
          content: {
            'application/json': {
              schema: resultRef,
              example: {
                encontrado: false,
                arquivos: null,
                status: { s3: 'nao_consultado', local: 'nao_consultado' },
                error: 'Data e nome do arquivo são obrigatórios.',
              },
            },
          },
        },
        404: {
          description: 'Nenhum arquivo encontrado',
          content: {
            'application/json': {
              schema: resultRef,
              example: {
                encontrado: false,
                arquivos: null,
                status: { s3: 'nao_encontrado', local: 'nao_encontrado' },
              },
            },
          },
        },
        429: {
          description: 'Muitas requisições (rate limit 30/min)',
          content: {
            'application/json': {
              schema: errorRef,
              example: { error: 'Muitas requisições. Tente novamente em instantes.' },
            },
          },
        },
        500: {
          description: 'Erro interno do servidor',
          content: {
            'application/json': {
              schema: resultRef,
              example: {
                encontrado: false,
                arquivos: null,
                status: { s3: 'erro: Erro de conexão com S3', local: 'nao_consultado' },
                error: 'Ocorreu um erro inesperado no servidor.',
              },
            },
          },
        },
      },
    },
  },
  '/cancel-search/{token}': {
    post: {
      tags: ['Busca'],
      summary: 'Cancelar busca em andamento',
      description: 'Cancela uma busca SSE em andamento usando o token recebido via `event: searchToken`.',
      security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
      parameters: [
        {
          in: 'path',
          name: 'token',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'Token UUID da busca',
          example: '550e8400-e29b-41d4-a716-446655440000',
        },
      ],
      responses: {
        200: {
          description: 'Busca cancelada',
          content: {
            'application/json': {
              schema: { type: 'object', properties: { message: { type: 'string', example: 'Busca cancelada' } } },
            },
          },
        },
        404: {
          description: 'Busca não encontrada ou já finalizada',
          content: {
            'application/json': { schema: errorRef, example: { error: 'Busca nao encontrada ou ja finalizada' } },
          },
        },
      },
    },
  },
};

export const searchTags = 'Busca';
