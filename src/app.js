import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { createSearchRoutes } from './routes/search.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp(s3Service) {
    const app = express();

    app.use(express.json());

    // Servir arquivos estáticos da pasta 'public'
    app.use(express.static(path.resolve(__dirname, '..', 'public')));

    // Configuração específica para o modo MOCK
    if (process.env.NODE_ENV === 'local-server') {
        console.log("Modo de busca local: rota de download ativada.");

        /**
         * Retorna uma lista de todos os caminhos base configurados nas variáveis PATH_.
         * @returns {string[]}
         */
        const getAllBasePaths = () => {
            const paths = [];
            for (const key in process.env) {
                if (key.startsWith('PATH_')) {
                    const configString = process.env[key] || '';
                    // Pega a parte do caminho base (antes da vírgula) ou a string inteira.
                    const basePathPart = configString.split(',')[0];
                    // Divide por ';' para obter todos os caminhos base e adiciona à lista.
                    const basePaths = basePathPart.split(';').map(p => p.trim());
                    paths.push(...basePaths);
                }
            }
            return paths;
        };

        // Rota personalizada para fazer o download de arquivos de um caminho de rede (ou local)
        app.get('/download-local', (req, res) => {
            const filePath = req.query.file;

            if (!filePath) {
                return res.status(400).send('Parâmetro "file" não especificado.');
            }

            // Medida de segurança: Verificamos se o caminho base do arquivo solicitado
            // corresponde ao caminho configurado no .env. Isso previne que um usuário
            // mal-intencionado tente baixar arquivos de outros locais do seu servidor.
            const validBasePaths = getAllBasePaths();
            const isPathValid = validBasePaths.some(basePath => filePath.startsWith(basePath));

            if (!isPathValid) {
                console.warn(`Tentativa de acesso a arquivo fora de um diretório base válido: ${filePath}`);
                return res.status(403).send('Acesso negado.');
            }

            // Usa res.download(), que lida com a leitura do arquivo (streaming)
            // e define os cabeçalhos corretos para o navegador iniciar o download.
            res.download(filePath);
        });
    }

    // Injeta o serviço (real ou mock) nas rotas
    const searchRoutes = createSearchRoutes(s3Service);
    app.use(searchRoutes);

    return app;
}