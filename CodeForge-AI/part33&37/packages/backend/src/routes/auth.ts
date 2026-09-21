import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { generateTokens, storeRefreshToken, validateRefreshToken, revokeRefreshToken, revokeAllUserSessions, JWTPayload } from '../lib/auth';
import { registerSchema, loginSchema, refreshTokenSchema } from '@prepvista/shared';
import { authMiddleware, requireRole } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { authRateLimiter } from '../middleware/rateLimit';
import { AuthenticationError, ConflictError, NotFoundError } from '../middleware/error';
import { logger } from '../lib/logger';

const router = Router();

router.post('/register', authRateLimiter, validateBody(registerSchema), async (req, res, next) => {
  try {
    const { email, password, name, role = 'STUDENT', collegeId } = req.body;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictError('Email already registered');
    }

    // If role is TPO or COLLEGE_ADMIN, collegeId is required
    if ((role === 'TPO' || role === 'COLLEGE_ADMIN') && !collegeId) {
      throw new AuthenticationError('College ID required for this role');
    }

    // If collegeId provided, verify college exists
    if (collegeId) {
      const college = await prisma.college.findUnique({ where: { id: collegeId } });
      if (!college) {
        throw new NotFoundError('College');
      }
    }

    // Super admin registration only allowed by super admin (handled elsewhere)
    if (role === 'SUPER_ADMIN') {
      throw new AuthenticationError('Cannot self-register as Super Admin');
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        role,
        collegeId: collegeId || null,
      },
    });

    // Create student profile if student
    if (role === 'STUDENT' && collegeId) {
      await prisma.student.create({
        data: {
          userId: user.id,
          collegeId,
          studentId: `STU-${Date.now()}`,
        },
      });
    }

    // Create TPO profile if TPO
    if (role === 'TPO' && collegeId) {
      await prisma.tpoProfile.create({
        data: {
          userId: user.id,
          collegeId,
        },
      });
    }

    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      collegeId: user.collegeId,
    };

    const tokens = generateTokens(payload);
    await storeRefreshToken(user.id, tokens.refreshToken);

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    logger.info({ userId: user.id, role: user.role }, 'User registered');

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        collegeId: user.collegeId,
      },
      ...tokens,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/login', authRateLimiter, validateBody(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      include: { college: true },
    });

    if (!user || !user.isActive) {
      throw new AuthenticationError('Invalid credentials');
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      throw new AuthenticationError('Invalid credentials');
    }

    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      collegeId: user.collegeId,
    };

    const tokens = generateTokens(payload);
    await storeRefreshToken(user.id, tokens.refreshToken);

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    logger.info({ userId: user.id, role: user.role }, 'User logged in');

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        collegeId: user.collegeId,
        college: user.college ? { id: user.college.id, name: user.college.name } : null,
      },
      ...tokens,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/refresh', validateBody(refreshTokenSchema), async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    const userId = await validateRefreshToken(refreshToken);
    if (!userId) {
      throw new AuthenticationError('Invalid or expired refresh token');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { college: true },
    });

    if (!user || !user.isActive) {
      throw new AuthenticationError('User not found or inactive');
    }

    // Revoke old refresh token
    await revokeRefreshToken(refreshToken);

    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      collegeId: user.collegeId,
    };

    const tokens = generateTokens(payload);
    await storeRefreshToken(user.id, tokens.refreshToken);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        collegeId: user.collegeId,
        college: user.college ? { id: user.college.id, name: user.college.name } : null,
      },
      ...tokens,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', authMiddleware, async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const refreshToken = req.body.refreshToken;
      if (refreshToken) {
        await revokeRefreshToken(refreshToken);
      }
    }
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
});

router.post('/logout-all', authMiddleware, async (req, res, next) => {
  try {
    await revokeAllUserSessions(req.auth!.userId);
    res.json({ message: 'Logged out from all devices' });
  } catch (error) {
    next(error);
  }
});

router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.auth!.userId },
      include: {
        college: true,
        student: true,
        tpoProfile: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User');
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        collegeId: user.collegeId,
        college: user.college ? { id: user.college.id, name: user.college.name, domain: user.college.domain } : null,
        student: user.student ? {
          id: user.student.id,
          studentId: user.student.studentId,
          targetRole: user.student.targetRole,
          skills: user.student.skills,
        } : null,
        tpoProfile: user.tpoProfile ? {
          id: user.tpoProfile.id,
          department: user.tpoProfile.department,
          title: user.tpoProfile.title,
        } : null,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.put('/password', authMiddleware, validateBody(z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
})), async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
    if (!user) {
      throw new NotFoundError('User');
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      throw new AuthenticationError('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    // Revoke all other sessions for security
    await revokeAllUserSessions(user.id);

    logger.info({ userId: user.id }, 'Password changed');

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;