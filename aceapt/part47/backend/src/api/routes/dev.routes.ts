import { Router } from 'express';
import { signDevToken } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { devTokenSchema } from '../dto/schemas.js';

/**
 * DEV/DEMO ONLY. Issues a signed stub token for a given studentId with no
 * password or identity check whatsoever - see src/api/middleware/auth.ts
 * for why this stub exists. Mounted only when env.enableDevRoutes is true
 * (default in development, always false when NODE_ENV=production).
 *
 * DELETE THIS FILE when integrating into real ACEAPT. It exists purely so
 * the bundled frontend has something to authenticate against without a
 * real login system.
 */
export function buildDevRouter(): Router {
  const router = Router();
  router.post(
    '/dev/token',
    asyncHandler(async (req, res) => {
      const { studentId } = devTokenSchema.parse(req.body);
      res.json({ token: signDevToken(studentId), studentId });
    }),
  );
  return router;
}
