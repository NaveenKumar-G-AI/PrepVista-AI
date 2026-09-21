import express from 'express';
import dotenv from 'dotenv';
import { requestId } from './middleware';
import { router } from './routes';

dotenv.config();

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(requestId);
app.use('/api', router);

app.get('/health', (_req, res) => res.json({ ok: true }));

// Global error handler: any thrown/rejected error from a route becomes a
// structured 500 with its correlation id, never a process crash.
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const correlationId = (req as express.Request & { correlationId?: string }).correlationId;
  // eslint-disable-next-line no-console
  console.error(`[${correlationId}]`, err);
  res.status(500).json({ error: 'internal error', correlationId });
});

const port = Number(process.env.PORT ?? 8787);

if (require.main === module) {
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`codeforge review-mode listening on :${port}`);
  });
}

export default app;
