import rateLimit from 'express-rate-limit';

/**
 * Basic integrity foundation per section 46 ("do not waste the prototype
 * deadline building invasive surveillance" - but DO rate limit). Generous
 * enough not to interfere with normal exam-taking (frequent navigate/attempt
 * calls), tight enough to blunt naive scripted abuse.
 */
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 240,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'Too many requests - please slow down.' },
});
