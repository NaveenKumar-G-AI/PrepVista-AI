import { createApp } from './app';
import { env } from './config/env';
import { registerEventHandlers } from './events/handlers';
import { logger } from './utils/logger';

registerEventHandlers();
const app = createApp();

app.listen(env.PORT, () => {
  logger.info('server_started', { port: env.PORT, env: env.NODE_ENV });
});
