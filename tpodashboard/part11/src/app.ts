import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'node:path';
import { errorHandler } from './middleware/errorHandler';

import authRoutes from '../api/security/auth.routes';
import sessionRoutes from '../api/security/sessions.routes';
import auditRoutes from '../api/security/audit.routes';
import usersRoutes from '../api/admin/users.routes';
import rolesRoutes from '../api/admin/roles.routes';
import departmentsRoutes from '../api/admin/departments.routes';
import policiesRoutes from '../api/admin/policies.routes';
import dataQualityRoutes from '../api/admin/dataQuality.routes';
import systemRoutes from '../api/admin/system.routes';
import aiGovernanceRoutes from '../api/admin/aiGovernance.routes';
import meRoutes from '../api/self/me.routes';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/ping', (_req, res) => res.json({ ok: true }));

  app.use('/api/auth', authRoutes);
  app.use('/api/sessions', sessionRoutes);
  app.use('/api/admin/audit', auditRoutes);
  app.use('/api/admin/users', usersRoutes);
  app.use('/api/admin/roles', rolesRoutes);
  app.use('/api/admin/departments', departmentsRoutes);
  app.use('/api/admin/policies', policiesRoutes);
  app.use('/api/admin/data-quality', dataQualityRoutes);
  app.use('/api/admin/system', systemRoutes);
  app.use('/api/admin/ai-governance', aiGovernanceRoutes);
  app.use('/api/me', meRoutes);

  app.use(express.static(path.join(process.cwd(), 'public')));

  app.use(errorHandler);

  return app;
}
