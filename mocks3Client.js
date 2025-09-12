import fs from 'fs';
import path from 'path';
import {
    ListObjectsV2Command
} from "@aws-sdk/client-s3";
import 'dotenv/config';

// Mock da classe S3Client
class MockS3Client {
    async send(command) {
        if (command instanceof ListObjectsV2Command) {
            const bucketPath = process.env.LOCAL_FILE_PATH;

            if (!bucketPath || !fs.existsSync(bucketPath)) {
                console.error(`O caminho LOCAL_FILE_PATH="${bucketPath}" não existe ou não foi configurado no .env`);
                return {
                    Contents: []
                };
            }

            // O prefixo da requisição (ex: 2024/10/12)
            const prefix = command.input.Prefix;
            // Transforma o prefixo em um caminho de sistema de arquivos (ex: 2024\10\12)
            const prefixPath = prefix.replace(/\//g, path.sep);
            const fullPath = path.join(bucketPath, prefixPath);

            // Verificando se o caminho existe e é uma pasta
            if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
                // Lê recursivamente os arquivos na pasta e subpastas
                const files = this.listFilesInDirectory(fullPath, bucketPath);

                // Mapeia os caminhos locais para o formato de chave do S3
                const contents = files.map(filePath => {
                    const relativePath = path.relative(bucketPath, filePath);
                    const s3Key = relativePath.replace(/\\/g, '/');
                    return {
                        Key: s3Key
                    };
                });

                return {
                    Contents: contents
                };
            }

            // Se o caminho não existir ou não for uma pasta, retorna lista vazia
            return {
                Contents: []
            };
        }

        return {};
    }

    // Função auxiliar para listar todos os arquivos em uma pasta de forma recursiva
    listFilesInDirectory(dirPath, baseDir) {
        const files = [];
        const items = fs.readdirSync(dirPath);

        for (const item of items) {
            const fullPath = path.join(dirPath, item);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
                // Se for uma pasta, chama a função recursivamente
                files.push(...this.listFilesInDirectory(fullPath, baseDir));
            } else {
                // Se for um arquivo, adiciona à lista
                files.push(fullPath);
            }
        }
        return files;
    }
}

// Mock da função getSignedUrl
const mockGetSignedUrl = async (client, command, options) => {
    const {
        Key
    } = command;
    return `/local-files/${Key}`;
};

export {
    MockS3Client,
    mockGetSignedUrl as getSignedUrl
};