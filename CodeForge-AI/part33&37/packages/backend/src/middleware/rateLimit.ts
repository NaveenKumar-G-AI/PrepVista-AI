import rateLimit from 'express-rate-limit';
import { RateLimitError } from './error';
import { logger } from '../lib/logger';

export const createRateLimiter = (options: {
  windowMs: number;
  max: number;
  message?: string;
  keyPrefix?: string;
}) => {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    message: { error: options.message || 'Too many requests', code: 'RATE_LIMITED' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      // Use user ID if authenticated, otherwise IP
      return (req as any).auth?.userId || req.ip || 'anonymous';
    },
    handler: (_req, res) => {
      throw new RateLimitError(options.message);
    },
    skip: (req) => {
      // Skip rate limiting for health checks
      return req.path === '/health';
    },
  });
};

export const globalRateLimiter = createRateLimiter({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  keyPrefix: 'global',
});

export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  message: 'Too many authentication attempts, please try again later',
  keyPrefix: 'auth',
});

export const aiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 AI requests per minute per user
  message: 'AI rate limit exceeded, please wait',
  keyPrefix: 'ai',
});

export const assessmentRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 assessments per hour
  message: 'Assessment rate limit exceeded',
  keyPrefix: 'assessment',
});