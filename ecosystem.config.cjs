module.exports = {
  apps: [
    {
      // Aplicação de Produção
      name: 'buscador-s3-bucket',
      script: 'src/server.js',
      args: 'start',
      // Não queremos que a app de produção inicie junto com a de dev
      // por padrão, a menos que seja chamada explicitamente.
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 's3-bucket',
        PORT: 3000
      },
    },
    {
      // Aplicação de Desenvolvimento
      name: 'buscador-local-server',
      // Aponta diretamente para o script do servidor
      script: 'src/server.js',
      // Força o PM2 a usar o interpretador 'node'
      interpreter: 'node',
      autorestart: true,
      watch: false, // Pode ser alterado para 'true' se quiser que o pm2 reinicie ao salvar arquivos
      // O PM2 injeta essas variáveis de ambiente antes de executar o script
      env: {
        NODE_ENV: 'local-server',
        PORT: 80
      },
    },
  ],
};