import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createSearchRoutes } from './routes/search.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp(s3Service) {
    const app = express();

    app.use(express.json());

    // Servir arquivos estáticos da pasta 'public'
    app.use(express.static(path.resolve(__dirname, '..', 'public')));

    // Configuração específica para o modo MOCK
    if (process.env.NODE_ENV === 'development') {
        console.log("Modo de desenvolvimento: servindo arquivos locais.");
        const localFilePath = process.env.LOCAL_FILE_PATH;
        if (localFilePath) {
            // Rota para servir os arquivos locais que o mock "encontra"
            app.use('/local-files', express.static(localFilePath));
        } else {
            console.warn("AVISO: LOCAL_FILE_PATH não está definido no .env. O download de arquivos mockados pode não funcionar.");
        }
    }

    // Injeta o serviço (real ou mock) nas rotas
    const searchRoutes = createSearchRoutes(s3Service);
    app.use(searchRoutes);

    return app;
}