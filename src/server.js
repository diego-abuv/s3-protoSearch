import { createApp } from './app.js';
import 'dotenv/config';

// Função para iniciar o servidor
async function startServer() {
    console.log('Iniciando servidor com serviço de busca unificado (S3 com fallback local)...');
    // Importa o serviço unificado que orquestra as buscas
    const searchableService = await import('./services/unifiedSearchService.js');

    const app = createApp(searchableService);
    const port = process.env.PORT || 80;
    const host = '127.0.0.1';

    app.listen(port, host, () => {
        console.log(`Servidor rodando em http://${host}:${port}, acessível na rede local.`);
    });
}

startServer();