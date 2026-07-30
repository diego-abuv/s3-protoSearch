import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import { initDatabase } from './db/sqlite.js';
import { securityHeaders } from './utils/securityHeaders.js';
import { swaggerSpec } from './swagger/index.js';
import { createAuthRoutes } from './routes/auth.js';
import { createSearchRoutes } from './routes/search.js';
import { createDownloadRoutes } from './routes/download.js';
import { createAdminRoutes } from './routes/admin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROTECTED_JS = ['/js/search.js', '/js/admin.js', '/js/render.js'];

export async function createApp(searchableService) {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json());
  app.use(cookieParser());

  app.use(securityHeaders);

  app.use((req, res, next) => {
    if (PROTECTED_JS.includes(req.path)) {
      const refreshToken = req.cookies?.refresh_token;
      if (!refreshToken) {
        return res.status(404).send('Not found');
      }
    }
    next();
  });

  await initDatabase();

  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, { customCss: '.swagger-ui .topbar { display: none }' }),
  );

  app.use(express.static(path.resolve(__dirname, '..', 'public')));

  app.use(createAuthRoutes());
  app.use(createSearchRoutes(searchableService));
  app.use(createDownloadRoutes());
  app.use(createAdminRoutes());

  app.set('trust proxy', 1);
  return app;
}
