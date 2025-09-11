import express from 'express';
// Comente as linhas originais
// import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
// import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Importe as classes simuladas
import {
  MockS3Client as S3Client,
  getSignedUrl
} from './mocks3Client.js';
import 'dotenv/config';

// ... (resto do seu código do Express)

const app = express();
const port = process.env.PORT || 3000;
// Use a classe simulada aqui
const s3Client = new S3Client({
  region: 'mock-region'
});

app.use(express.json());
app.use(express.static('.'));

app.post('/buscar-arquivo', async (req, res) => {
  const {
    pasta,
    nomeArquivo
  } = req.body;
  const keyDoArquivo = `${pasta}/${nomeArquivo}`;

  if (!pasta || !nomeArquivo) {
    return res.status(400).json({
      error: 'Pasta e nome do arquivo são obrigatórios.'
    });
  }

  try {
    const listCommand = new ListObjectsV2Command({
      Bucket: 'mock-bucket',
      Prefix: keyDoArquivo
    });

    const response = await s3Client.send(listCommand);

    if (response.Contents && response.Contents.some(obj => obj.Key === keyDoArquivo)) {
      const downloadUrl = await getSignedUrl(s3Client, {
        Bucket: 'mock-bucket',
        Key: keyDoArquivo,
      }, {
        expiresIn: 3600
      });
      return res.json({
        downloadUrl
      });
    } else {
      return res.status(404).json({
        error: 'Arquivo não encontrado.'
      });
    }

  } catch (err) {
    console.error('Erro na busca:', err);
    return res.status(500).json({
      error: 'Ocorreu um erro no servidor.'
    });
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});