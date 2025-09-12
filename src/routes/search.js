import { Router } from 'express';
import path from 'path';

export function createSearchRoutes(s3Service) {
    const router = Router();

    router.post('/buscar-arquivo', async (req, res) => {
        const { pasta, nomeProtocolo } = req.body;

        if (!pasta || !nomeProtocolo) {
            return res.status(400).json({ error: 'Data e nome do arquivo são obrigatórios.' });
        }

        try {
            // A data vem como 'YYYY-MM-DD', transformamos em 'YYYY/MM/DD'
            const pastaFormatada = pasta.replace(/-/g, '/');
            const resultado = await s3Service.findFileAndGetSignedUrl(pastaFormatada, nomeProtocolo);

            if (resultado) {
                return res.json(resultado);
            } else {
                return res.status(404).json({ error: 'Arquivo não encontrado.' });
            }
        } catch (err) {
            console.error('Erro na busca:', err);
            return res.status(500).json({ error: 'Ocorreu um erro no servidor.' });
        }
    });

    return router;
}