import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import { initDatabase } from './db/sqlite.js';
import { securityHeaders } from './utils/securityHeaders.js';
import { createAuthRoutes } from './routes/auth.js';
import { createSearchRoutes } from './routes/search.js';
import { createDownloadRoutes } from './routes/download.js';
import { createAdminRoutes } from './routes/admin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function createApp(searchableService) {
  const app = express();

  app.use(express.json());
  app.use(cookieParser());

  app.use(securityHeaders);

  await initDatabase();

  app.use(express.static(path.resolve(__dirname, '..', 'public')));

  app.use(createAuthRoutes());
  app.use(createSearchRoutes(searchableService));
  app.use(createDownloadRoutes());
  app.use(createAdminRoutes());

  app.set('trust proxy', 1);
  return app;
}
