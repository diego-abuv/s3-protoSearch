import express from 'express';
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import 'dotenv/config';

// Inicializa o Express e o cliente S3
const app = express();
const port = process.env.PORT || 3000;
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

app.use(express.json()); // Habilita o parsing de JSON no corpo das requisições

// Endpoint para buscar o arquivo no S3
app.post('/buscar-arquivo', async (req, res) => {
  const { pasta, nomeArquivo } = req.body;
  const bucketName = process.env.AWS_BUCKET_NAME;
  const keyDoArquivo = `${pasta}/${nomeArquivo}`;

  if (!pasta || !nomeArquivo) {
    return res.status(400).json({ error: 'Pasta e nome do arquivo são obrigatórios.' });
  }

  try {
    // Comando para verificar se o objeto existe
    const listCommand = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: keyDoArquivo
    });

    const response = await s3Client.send(listCommand);

    // Se a busca encontrar exatamente o arquivo desejado
    if (response.Contents && response.Contents.some(obj => obj.Key === keyDoArquivo)) {
      // Gera uma URL pré-assinada de download
      const downloadUrl = await getSignedUrl(s3Client, {
        Bucket: bucketName,
        Key: keyDoArquivo,
      }, { expiresIn: 3600 }); // URL válida por 1 hora

      return res.json({ downloadUrl });
    } else {
      return res.status(404).json({ error: 'Arquivo não encontrado.' });
    }

  } catch (err) {
    console.error('Erro na busca do S3:', err);
    return res.status(500).json({ error: 'Ocorreu um erro no servidor.' });
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});