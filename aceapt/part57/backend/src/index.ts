import fs from 'node:fs';
import path from 'node:path';
import { db } from './db/client';
import { createApp } from './api';
import { env } from './config/env';
import { logger } from './utils/logger';

// Auto-migrate on boot if the schema hasn't been applied yet - convenient
// for local dev; a real deployment would run `npm run migrate` explicitly
// as part of its release step instead.
const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf-8');
db.exec(schema);

const app = createApp();

app.listen(env.PORT, () => {
  logger.info('feature57_listening', { port: env.PORT, env: env.NODE_ENV });
});
