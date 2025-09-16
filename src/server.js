import { createApp } from './app.js';
import 'dotenv/config';

async function startServer() {
    const isDevelopment = process.env.NODE_ENV === 'local-server';
    let s3Service;

    if (isDevelopment) {
        console.log('Iniciando em modo de busca local...');
        // Importa o serviço mock dinamicamente
        const mockService = await import('./services/s3Service.mock.js');
        s3Service = mockService;
    } else {
        console.log('Iniciando em modo de busca no S3-bucket...');
        // Importa o serviço real dinamicamente
        const realService = await import('./services/s3Service.js');
        s3Service = realService;
    }

    const app = createApp(s3Service);
    const port = process.env.PORT || 80;
    const host = '0.0.0.0';

    app.listen(port, host, () => {
        console.log(`Servidor rodando em http://${host}:${port}, acessível na rede local.`);
    });
}

startServer();