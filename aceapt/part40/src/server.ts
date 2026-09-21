import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { requireStudent } from './middleware/auth';
import { errorHandler, notFound } from './middleware/errorHandler';

import careerHorizonRoutes from './routes/careerHorizon.routes';
import marketIntelligenceRoutes from './routes/marketIntelligence.routes';
import futureGapsRoutes from './routes/futureGaps.routes';
import careerPathsRoutes from './routes/careerPaths.routes';
import careerScenariosRoutes from './routes/careerScenarios.routes';
import careerExperimentsRoutes from './routes/careerExperiments.routes';
import marketBriefRoutes, { technologyAnalysisHandler } from './routes/marketBrief.routes';

const app = express();
app.use(cors({ origin: env.corsOrigin }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok', feature: 'ACEAPT Feature 40 -- Career Horizon' }));

// Spec ??66 API architecture -- conceptual endpoints, adapted to this
// standalone build's actual route structure:
app.use('/api/career-horizon', careerHorizonRoutes);
app.use('/api', marketIntelligenceRoutes); // /api/market-signals, /api/role-evolution/:roleId, /api/skill-trends
app.use('/api/future-gaps', futureGapsRoutes);
app.use('/api/career-paths', careerPathsRoutes); // includes /compare
app.use('/api/career-scenarios', careerScenariosRoutes);
app.use('/api/career-experiments', careerExperimentsRoutes);
app.use('/api/market-brief', marketBriefRoutes); // /daily, /weekly
app.post('/api/technology-analysis', requireStudent, technologyAnalysisHandler);

app.use(notFound);
app.use(errorHandler);

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`ACEAPT Feature 40 (Career Horizon) listening on :${env.port} [AI: ${env.ai.enabled ? 'enabled' : 'deterministic fallback only'}]`);
});
