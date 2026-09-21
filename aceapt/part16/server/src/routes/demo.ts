import { Router, Request, Response } from 'express';
import { runDemoScenario } from '../demo/runDemoScenario';
import { DEMO_STUDENT_ID } from '../data/seed';
import { signStudentToken } from '../middleware/auth';

export const demoRouter = Router();

// No auth required to *start* the demo (it seeds and returns its own demo
// student id + token) — everything after this point goes through normal auth.
demoRouter.post('/run', async (_req: Request, res: Response) => {
  const steps = await runDemoScenario();
  res.json({ studentId: DEMO_STUDENT_ID, token: signStudentToken(DEMO_STUDENT_ID), steps });
});
