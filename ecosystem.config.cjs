module.exports = {
  apps: [
    {
      name: 'buscador-unificado',
      script: 'src/server.js',
      args: 'start',
      interpreter: 'node',
      instances: 1,
      autorestart: true,
      watch: false,
      // O NODE_ENV ainda pode ser útil para outras lógicas,
      // como ativar a rota de download local em app.js.
      env: {
        NODE_ENV: 'busca-ligacoes',
        PORT: 80
      },
    },
  ],
};