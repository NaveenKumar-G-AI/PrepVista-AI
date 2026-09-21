import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, getUserWithCollege, JWTPayload, AuthenticationError, AuthorizationError } from '../lib/auth';
import { prisma } from '../lib/prisma';

declare global {
  namespace Express {
    interface Request {
      auth?: JWTPayload;
      user?: Awaited<ReturnType<typeof getUserWithCollege>>;
    }
  }
}

export async function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new AuthenticationError('Missing or invalid authorization header');
    }

    const token = authHeader.slice(7);
    const payload = verifyAccessToken(token);
    if (!payload) {
      throw new AuthenticationError('Invalid or expired token');
    }

    const user = await getUserWithCollege(payload.userId);
    if (!user || !user.isActive) {
      throw new AuthenticationError('User not found or inactive');
    }

    req.auth = payload;
    req.user = user;
    next();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return next(error);
    }
    next(new AuthenticationError('Authentication failed'));
  }
}

export function optionalAuthMiddleware(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.slice(7);
  const payload = verifyAccessToken(token);
  if (!payload) {
    return next();
  }

  getUserWithCollege(payload.userId).then(user => {
    if (user?.isActive) {
      req.auth = payload;
      req.user = user;
    }
    next();
  }).catch(() => next());
}

export function requireRole(...roles: JWTPayload['role'][]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      return next(new AuthenticationError());
    }
    if (!roles.includes(req.auth.role)) {
      return next(new AuthorizationError(`Required role: ${roles.join(' or ')}`));
    }
    next();
  };
}

export function requireCollegeAccess(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) {
    return next(new AuthenticationError());
  }

  // SUPER_ADMIN can access all colleges
  if (req.auth.role === 'SUPER_ADMIN') {
    return next();
  }

  const targetCollegeId = req.params.collegeId || req.body.collegeId || req.query.collegeId;
  if (targetCollegeId && req.auth.collegeId !== targetCollegeId) {
    return next(new AuthorizationError('Access denied: college mismatch'));
  }

  next();
}

export function requireOwnershipOrRole(...allowedRoles: JWTPayload['role'][]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      return next(new AuthenticationError());
    }

    const resourceUserId = req.params.userId || req.params.studentId || req.body.userId;
    if (req.auth.userId === resourceUserId) {
      return next();
    }

    if (allowedRoles.includes(req.auth.role)) {
      return next();
    }

    return next(new AuthorizationError('Access denied'));
  };
}

export function requireFeatureFlag(flagKey: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      return next(new AuthenticationError());
    }

    const flag = await prisma.featureFlag.findUnique({
      where: { key: flagKey },
    });

    if (!flag || !flag.isEnabled) {
      return next(new AuthorizationError(`Feature ${flagKey} is not enabled`));
    }

    if (!flag.targetRoles.includes(req.auth.role)) {
      return next(new AuthorizationError(`Feature ${flagKey} not available for your role`));
    }

    // Check rollout percentage (simple deterministic check)
    if (flag.rolloutPct < 100) {
      const hash = hashUserId(req.auth.userId);
      if (hash % 100 >= flag.rolloutPct) {
        return next(new AuthorizationError(`Feature ${flagKey} not yet rolled out to you`));
      }
    }

    next();
  };
}

function hashUserId(userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}