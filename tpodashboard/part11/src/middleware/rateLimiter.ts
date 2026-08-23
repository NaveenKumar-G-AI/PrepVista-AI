import rateLimit from 'express-rate-limit';

/** IP-based limiter on top of the account-level lockout in authService — defense in depth against brute force and enumeration. */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' } },
});
