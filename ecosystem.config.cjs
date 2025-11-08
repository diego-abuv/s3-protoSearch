module.exports = {
  apps: [
    {
      name: 'Serviço Buscador',
      script: 'src/server.js',
      args: 'start',
      interpreter: 'node',
      instances: 1,
      autorestart: true,
      watch: false,

      env: {
        // O NODE_ENV é útil para ativar a rota de download local em app.js.
        NODE_ENV: 'busca-ligacoes',
        // PORT deve ser configurada no .env 
        PORT: process.env.PORT || 80
      },
    },
  ],
};