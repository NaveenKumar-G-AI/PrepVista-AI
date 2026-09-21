import { createServer } from './api/server';
import { config, usingInMemoryCacheAndLimiters, usingInMemoryPersistence } from './config';
import { providerHealthCache } from './gateway/defaultGateway';

const app = createServer();

providerHealthCache.startBackgroundRefresh(15_000);

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`CodeForge AI Controls listening on :${config.port}`);
  if (usingInMemoryPersistence) {
    // eslint-disable-next-line no-console
    console.warn('[startup] DATABASE_URL not set — using in-memory persistence. Data will not survive a restart. See migrations/001_init.sql for the production schema.');
  }
  if (usingInMemoryCacheAndLimiters) {
    // eslint-disable-next-line no-console
    console.warn('[startup] REDIS_URL not set — cache, rate limits, and concurrency control are per-process only. Fine for one instance, not for a multi-instance deployment.');
  }
  if (!config.auth.jwtSecret) {
    // eslint-disable-next-line no-console
    console.warn('[startup] JWT_SECRET not set — API auth is running in dev-fallback mode (x-dev-auth header). This path is disabled automatically if NODE_ENV=production.');
  }
});
