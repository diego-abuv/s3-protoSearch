import express from 'express';
import path from 'path';
import {
    MockS3Client as S3Client,
    getSignedUrl
} from './mocks3Client.js';
import 'dotenv/config';
import {
    ListObjectsV2Command
} from "@aws-sdk/client-s3";

const app = express();
const port = process.env.PORT || 3000;
const s3Client = new S3Client({
    region: 'mock-region'
});

app.use(express.json());
app.use(express.static('.'));

// Rota para servir os arquivos locais
app.get(/\/local-files\/(.*)/, (req, res) => {
    const localFilePath = process.env.LOCAL_FILE_PATH;
    if (!localFilePath) {
        return res.status(500).send('LOCAL_FILE_PATH não configurado no servidor.');
    }
    const filePath = req.params[0];
    const absolutePath = path.join(localFilePath, filePath);

    res.sendFile(absolutePath, (err) => {
        if (err) {
            console.error("Erro ao enviar arquivo:", err);
            res.status(404).send('Arquivo não encontrado no sistema local.');
        }
    });
});

app.post('/buscar-arquivo', async (req, res) => {
    const {
        pasta,
        nomeProtocolo
    } = req.body;

    // --- LOGS DETALHADOS ---
    console.log('\n--- Início da requisição de busca ---');
    console.log(`Dados recebidos do frontend: `);
    console.log(`- Data do Protocolo (pasta): ${pasta}`);
    console.log(`- Nome do Arquivo (nomeProtocolo): ${nomeProtocolo}`);
    
    if (!pasta || !nomeProtocolo) {
        console.error('ERRO: Pasta ou nome do arquivo estão faltando.');
        return res.status(400).json({
            error: 'Pasta e nome do arquivo são obrigatórios.'
        });
    }

    try {
        const prefixoDaBusca = pasta.replace(/-/g, '/');
        console.log(`Prefixo de busca construído: ${prefixoDaBusca}`);

        const listCommand = new ListObjectsV2Command({
            Bucket: 'mock-bucket',
            Prefix: prefixoDaBusca
        });

        const response = await s3Client.send(listCommand);

        if (!response.Contents) {
            console.warn('AVISO: A resposta da ListObjectsV2Command não tem "Contents".');
            console.log('Resposta completa:', response);
            return res.status(404).json({
                error: 'Nenhum conteúdo encontrado para o prefixo fornecido.'
            });
        }
        
        console.log(`Conteúdo encontrado para o prefixo:`);
        console.log(response.Contents);

        // A busca agora compara o nome base do input com o nome base de cada arquivo.
        const nomeProtocoloBase = path.parse(nomeProtocolo).name;
        
        const arquivoEncontrado = response.Contents.find(obj => {
            const nomeDoArquivoNaChave = path.basename(obj.Key);
            const nomeBaseDoArquivoNaChave = path.parse(nomeDoArquivoNaChave).name;
            return nomeBaseDoArquivoNaChave === nomeProtocoloBase;
        });

        console.log(`Procurando por um arquivo com o nome base: "${nomeProtocoloBase}"`);
        
        if (arquivoEncontrado) {
            console.log(`Arquivo encontrado! Chave completa: ${arquivoEncontrado.Key}`);
            
            // --- AQUI ESTÁ A CORREÇÃO ---
            // Adicionamos o nome do arquivo para o frontend usar para o download
            const nomeParaDownload = path.basename(arquivoEncontrado.Key);
            
            const downloadUrl = await getSignedUrl(s3Client, {
                Bucket: 'mock-bucket',
                Key: arquivoEncontrado.Key,
            }, {
                expiresIn: 3600
            });
            
            console.log(`URL de download gerada: ${downloadUrl}`);
            console.log('--- Requisição finalizada com sucesso ---\n');
            
            return res.json({
                downloadUrl,
                nomeParaDownload // Enviamos o nome completo do arquivo para o frontend
            });
        } else {
            console.error('ERRO: Nenhum arquivo correspondente encontrado na lista.');
            console.log('--- Requisição finalizada com erro ---\n');
            return res.status(404).json({
                error: 'Arquivo não encontrado.'
            });
        }

    } catch (err) {
        console.error('ERRO INTERNO NO SERVIDOR:', err);
        return res.status(500).json({
            error: 'Ocorreu um erro no servidor.'
        });
    }
});

app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});