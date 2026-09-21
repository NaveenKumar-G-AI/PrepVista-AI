import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { CatalogRepo } from '../repositories/catalogRepo.js';
import { CareerContextRepo } from '../repositories/careerContextRepo.js';
import { RoleService } from '../services/roleService.js';
import { CareerContextService } from '../services/careerContextService.js';
import { createAuthMiddleware } from './auth.js';
import { buildRoutes } from './routes.js';
import { DomainError } from './errors.js';

export function buildApp(db: Database.Database): Express {
  const catalogRepo = new CatalogRepo(db);
  const contextRepo = new CareerContextRepo(db);
  const roleService = new RoleService(catalogRepo);
  const careerContextService = new CareerContextService(catalogRepo, contextRepo);

  const app = express();
  app.use(express.json());
  app.use('/codeforge', createAuthMiddleware(contextRepo), buildRoutes(roleService, careerContextService));

  // Central error handler (Step 57): every DomainError becomes a stable
  // {error:{code,message}} JSON body with the right HTTP status. Anything
  // else is an unexpected 500 — logged, but its detail is not echoed back.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof DomainError) {
      res.status(err.httpStatus).json({ error: { code: err.code, message: err.message } });
      return;
    }
    console.error(err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } });
  });

  return app;
}
