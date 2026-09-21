import { Router } from 'express';
import { z } from 'zod';
import type { DB } from '../../db/client.js';
import { signDemoToken } from '../middleware/auth.js';

const LoginSchema = z.object({ studentId: z.string().min(1) });

export function authRouter(db: DB): Router {
  const router = Router();

  router.post('/demo-login', (req, res) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
      return;
    }
    const student = db.prepare('SELECT id, display_name FROM students WHERE id = ?').get(parsed.data.studentId) as unknown as { id: string; display_name: string } | undefined;
    if (!student) {
      res.status(404).json({ error: `Unknown student id: ${parsed.data.studentId}` });
      return;
    }
    res.json({ token: signDemoToken(student.id), studentId: student.id, displayName: student.display_name });
  });

  return router;
}
