// ----------arquivo de rotas da API de busca---------- //

import { Router } from 'express';
import path from 'path';

// ----------função para criar as rotas de busca---------- //
export function createSearchRoutes(searchableService) {
    const router = Router();

    // Rota para buscar um arquivo com base na pasta (data) 
    // e nome do protocolo (arquivo)
    router.post('/buscar-arquivo', async (req, res) => {
        const { pasta, nomeProtocolo } = req.body;

        if (!pasta || !nomeProtocolo) {
            return res.status(400).json({ error: 'Data e nome do arquivo são obrigatórios.' });
        }

        try {
            // A data vem como 'YYYY-MM-DD'
            // transformando em 'YYYY/MM/DD'
            const pastaFormatada = pasta.replace(/-/g, '/');

            const resultado = await searchableService.findFileAndGetSignedUrl(pastaFormatada, nomeProtocolo);

            if (resultado) {
                return res.json(resultado);
            } else {
                console.log('Arquivo não encontrado na rota.');
                return res.status(404).json({ error: 'Arquivo não encontrado.' });
            }
        } catch (err) {
            console.error('Erro na busca:', err);
            return res.status(500).json({ error: 'Ocorreu um erro no servidor.' });
        }
    });

    // Retorna o router configurado (neste caso apenas router.post)
    return router;
}