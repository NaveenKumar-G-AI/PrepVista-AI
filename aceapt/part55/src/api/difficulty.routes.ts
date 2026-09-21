import { Router, type Request, type Response, type NextFunction } from 'express';
import { authenticate, requireRole } from './middleware/auth.js';
import { makeDifficultyController } from './difficulty.controller.js';
import { DifficultyCalibrationService } from '../services/difficulty-calibration.service.js';
import { StudentDifficultyReadService } from '../services/student-difficulty-read.service.js';
import { appPool, studentPool } from '../db/pool.js';
import { InitialDifficultyAiAdapter } from '../ai/initial-difficulty-ai.adapter.js';

function wrap(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}

export function buildDifficultyRouter(): Router {
  const router = Router();
  const aiAdapter = new InitialDifficultyAiAdapter();
  const calibrationService = new DifficultyCalibrationService(appPool, aiAdapter, true);
  const studentReadService = new StudentDifficultyReadService(studentPool);
  const controller = makeDifficultyController(calibrationService);

  router.use(authenticate);

  // ---- Admin (Difficulty Calibration Center) -----------------------------
  const admin = Router();
  admin.use(requireRole('ADMIN'));
  admin.get('/questions/:questionVersionId/difficulty', wrap(controller.getQuestionDifficulty));
  admin.get('/questions/:questionVersionId/difficulty/history', wrap(controller.getDifficultyHistory));
  admin.get('/questions/:questionVersionId/difficulty/evidence', wrap(controller.getDifficultyEvidence));
  admin.post('/questions/:questionVersionId/difficulty/recalibrate', wrap(controller.recalibrateQuestion));
  admin.get('/questions/:questionVersionId/expected-time', wrap(controller.getExpectedTime));
  admin.get('/calibration-center/summary', wrap(controller.getCalibrationCenterSummary));
  admin.get('/anomalies', wrap(controller.getAnomalies));
  admin.post('/anomalies/review', wrap(controller.submitReview));
  admin.get('/skills/:skillId/difficulty-distribution', wrap(controller.getSkillDifficultyDistribution));
  router.use('/admin', admin);

  // ---- Student (safe view only, served off the restricted DB role) ------
  const student = Router();
  student.use(requireRole('STUDENT', 'ADMIN'));
  student.get(
    '/questions/:questionVersionId/difficulty',
    wrap((req, res) => controller.getStudentDifficulty(req, res, studentReadService))
  );
  router.use('/student', student);

  return router;
}
