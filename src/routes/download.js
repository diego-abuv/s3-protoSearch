import { Router } from 'express';
import path from 'path';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import https from 'https';
import { authMiddleware } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  requestHandler: new NodeHttpHandler({
    requestTimeout: 30_000,
    connectionTimeout: 5_000,
    httpsAgent: new https.Agent({
      keepAlive: true,
      maxSockets: 25,
      keepAliveMsecs: 30000,
    }),
  }),
});

const rawBucketName = process.env.AWS_BUCKET_NAME || '';
const bucketName = rawBucketName.replace(/s3:\/\/|\//g, '');

export function createDownloadRoutes() {
  const router = Router();

  const getAllBasePaths = () => {
    const paths = [];
    for (const key in process.env) {
      if (key.startsWith('PATH_')) {
        const configString = process.env[key] || '';
        const basePathPart = configString.split(',')[0];
        const basePaths = basePathPart.split(';').map((p) => p.trim());
        paths.push(...basePaths);
      }
    }
    return paths;
  };

  router.get('/download-local', authMiddleware, (req, res) => {
    const rawPath = req.query.file;

    if (!rawPath) {
      return res.status(400).send('Parâmetro "file" não especificado.');
    }

    const resolvedPath = path.resolve(rawPath);

    const validBasePaths = getAllBasePaths().map((p) => path.resolve(p.trim()));
    const isPathValid = validBasePaths.some((base) => {
      const normalizedBase = base.replace(/[\\/]$/, '');
      return resolvedPath.startsWith(normalizedBase + path.sep) || resolvedPath === normalizedBase;
    });

    if (!isPathValid) {
      logger.warn(`Tentativa de path-traversal bloqueada: ${rawPath} -> ${resolvedPath}`);
      return res.status(403).send('Acesso negado.');
    }

    res.download(resolvedPath);
  });

  router.get('/download-s3', authMiddleware, async (req, res) => {
    const { key, nome } = req.query;

    if (!key) {
      return res.status(400).send('Parâmetro "key" não especificado.');
    }

    try {
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      });

      const { Body, ContentType } = await s3Client.send(command);

      const filename = nome || path.basename(key);
      res.setHeader('Content-Type', ContentType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      Body.pipe(res);
    } catch (err) {
      logger.error(`Erro ao baixar do S3 (key=${key}): ${err.message}`);
      res.status(500).send('Erro ao baixar arquivo do S3.');
    }
  });

  return router;
}
