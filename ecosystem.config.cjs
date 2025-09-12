module.exports = {
  apps: [
    {
      // Aplicação de Produção
      name: 'buscador-s3',
      script: 'npm',
      args: 'start',
      // Não queremos que a app de produção inicie junto com a de dev
      // por padrão, a menos que seja chamada explicitamente.
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      // Aplicação de Desenvolvimento
      name: 'buscador-s3-dev',
      // Aponta diretamente para o script do servidor
      script: 'src/server.js',
      // Força o PM2 a usar o interpretador 'node'
      interpreter: 'node',
      autorestart: true,
      watch: false, // Pode ser alterado para 'true' se quiser que o pm2 reinicie ao salvar arquivos
      // O PM2 injeta essas variáveis de ambiente antes de executar o script
      env: {
        NODE_ENV: 'development',
      },
    },
  ],
};