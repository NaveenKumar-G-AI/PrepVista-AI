import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { router } from './routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createServer() {
  const app = express();
  app.use(express.json());
  app.use('/api', router);

  const webDist = path.join(__dirname, '..', '..', 'web', 'dist');
  app.use(express.static(webDist));
  app.get('/', (_req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });

  return app;
}
