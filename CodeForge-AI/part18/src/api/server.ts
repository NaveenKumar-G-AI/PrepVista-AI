import express, { Request, Response, NextFunction } from 'express';
import { analyzeSubmission } from '../pipeline/analyze';
import { MockProvider } from '../ai/mock_provider';
import { AnalyzeRequest } from '../types';

const app = express();
app.use(express.json({ limit: '1mb' }));

// AUTH STUB: wire this to CodeForge's existing auth/session middleware when integrating.
// It only exists here because no existing auth system is reachable from this standalone build.
function authStub(_req: Request, _res: Response, next: NextFunction) {
  next();
}

const defaultProvider = new MockProvider();

app.post('/api/quality/analyze', authStub, async (req: Request, res: Response) => {
  const body = req.body as Partial<AnalyzeRequest>;
  if (!body.source || !body.language || !body.submissionId) {
    return res.status(400).json({ error: 'submissionId, source, and language are required' });
  }
  if (typeof body.source === 'string' && body.source.length > 200_000) {
    return res.status(413).json({ error: 'Source exceeds the maximum size accepted by the quality engine' });
  }
  try {
    const report = await analyzeSubmission(body as AnalyzeRequest, { aiProvider: defaultProvider });
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: 'AnalysisFailure', message: String(err) });
  }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

if (require.main === module) {
  const port = process.env.PORT ? Number(process.env.PORT) : 8787;
  app.listen(port, () => console.log(`CodeForge Quality Engine listening on :${port}`));
}

export default app;
