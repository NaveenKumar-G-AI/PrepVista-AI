import { createApp } from './app';
import { buildDependencies } from './composition';

const PORT = Number(process.env.PORT ?? 4037);

const { readinessService, evidenceIngestService } = buildDependencies();
const app = createApp(readinessService, evidenceIngestService);

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[feature-37] readiness API listening on :${PORT}`);
});
