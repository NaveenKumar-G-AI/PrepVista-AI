import { Router } from 'express';
import { z } from 'zod';
import * as authService from '../../services/auth/authService';
import * as userService from '../../services/users/userService';
import { authenticate } from '../../src/middleware/authenticate';
import { authRateLimiter } from '../../src/middleware/rateLimiter';
import { pushDevOutbox, readDevOutbox } from '../../services/system/systemService';

const router = Router();

function meta(req: any) {
  return { userAgent: String(req.headers['user-agent'] ?? ''), ipAddress: req.ip };
}

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

router.post('/login', authRateLimiter, async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const { token, user } = await authService.login(email, password, meta(req));
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, institutionId: user.institutionId } });
  } catch (err) { next(err); }
});

router.post('/logout', authenticate, (req, res, next) => {
  try {
    authService.logout(req.sessionId!, req.authUser!.institutionId, req.authUser!.id);
    res.status(204).send();
  } catch (err) { next(err); }
});

router.post('/logout-all-others', authenticate, (req, res, next) => {
  try {
    authService.logoutAllOthers(req.authUser!.id, req.authUser!.institutionId, req.sessionId!);
    res.status(204).send();
  } catch (err) { next(err); }
});

const changePasswordSchema = z.object({ currentPassword: z.string(), newPassword: z.string().min(10) });

router.post('/password/change', authenticate, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    await authService.changePassword(req.authUser!.id, req.authUser!.institutionId, currentPassword, newPassword, req.sessionId!);
    res.status(204).send();
  } catch (err) { next(err); }
});

router.post('/password/reset/request', authRateLimiter, async (req, res, next) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const { devToken, user } = await authService.requestPasswordReset(email);
    if (devToken && user) {
      pushDevOutbox(user.email, 'Reset your PrepVista password',
        `Use this token to reset your password: ${devToken}\n\n(Development mode only — no real email was sent; a production deployment must wire up a real provider.)`);
    }
    // Always the same response, whether or not the email matched an account.
    res.json({ message: 'If an account exists for this email, password reset instructions have been sent.' });
  } catch (err) { next(err); }
});

router.post('/password/reset/confirm', async (req, res, next) => {
  try {
    const { token, newPassword } = z.object({ token: z.string(), newPassword: z.string().min(10) }).parse(req.body);
    await authService.confirmPasswordReset(token, newPassword);
    res.status(204).send();
  } catch (err) { next(err); }
});

router.post('/invitations/accept', async (req, res, next) => {
  try {
    const { token, password } = z.object({ token: z.string(), password: z.string().min(10) }).parse(req.body);
    await userService.acceptInvitation(token, password);
    res.status(204).send();
  } catch (err) { next(err); }
});

// Dev-only visibility into what "would have been sent" — see services/system/systemService.ts.
router.get('/dev/outbox', (_req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(404).end();
  res.json(readDevOutbox());
});

export default router;
