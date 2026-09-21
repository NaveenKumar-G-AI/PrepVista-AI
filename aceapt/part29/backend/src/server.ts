import { createApp } from './app';
import { runMigrations } from './db/runMigrations';
import { dispatchPendingOutboxEvents } from './integrations/outbox';

const PORT = process.env.PORT ? Number(process.env.PORT) : 4029;
const OUTBOX_POLL_INTERVAL_MS = 5000;

async function main(): Promise<void> {
  await runMigrations();

  const app = createApp();
  const server = app.listen(PORT, () => {
    console.log(`[aceapt-align] listening on :${PORT}`);
  });

  const outboxTimer = setInterval(() => {
    dispatchPendingOutboxEvents().catch((err) => {
      console.error('[outbox] dispatch tick failed:', err);
    });
  }, OUTBOX_POLL_INTERVAL_MS);

  const shutdown = () => {
    clearInterval(outboxTimer);
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[aceapt-align] failed to start:', err);
  process.exitCode = 1;
});
