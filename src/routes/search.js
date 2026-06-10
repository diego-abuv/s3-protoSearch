import { Router } from 'express';

export function createSearchRoutes(searchableService) {
  const router = Router();

  router.post('/buscar-arquivo', async (req, res) => {
    const { pasta, nomeProtocolo } = req.body;

    if (!pasta || !nomeProtocolo) {
      return res.status(400).json({
        encontrado: false,
        arquivos: null,
        status: { s3: 'nao_consultado', local: 'nao_consultado' },
        error: 'Data e nome do arquivo são obrigatórios.',
      });
    }

    try {
      const pastaFormatada = pasta.replace(/-/g, '/');

      const resultado = await searchableService.findFileAndGetSignedUrl(pastaFormatada, nomeProtocolo);

      if (resultado.arquivos && resultado.arquivos.length > 0) {
        return res.json({
          encontrado: true,
          arquivos: resultado.arquivos,
          status: resultado.status,
        });
      }

      return res.status(404).json({
        encontrado: false,
        arquivos: null,
        status: resultado.status,
      });
    } catch (err) {
      console.error('Erro não tratado na rota de busca:', err);
      return res.status(500).json({
        encontrado: false,
        arquivos: null,
        status: { s3: `erro: ${err.message}`, local: 'nao_consultado' },
        error: 'Ocorreu um erro inesperado no servidor.',
      });
    }
  });

  return router;
}
