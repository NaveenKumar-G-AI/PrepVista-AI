// Naive in-memory rate limiter. Good enough for a single dev/demo instance;
// NOT sufficient for a real multi-instance deployment (state isn't shared
// across processes). Swap for express-rate-limit + Redis before production.
function simpleRateLimit({ windowMs = 60_000, max = 240 } = {}) {
  const hits = new Map();
  return (req, res, next) => {
    const key = req.header('x-student-id') || req.ip || 'anonymous';
    const now = Date.now();
    const entry = hits.get(key) || { count: 0, resetAt: now + windowMs };
    if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + windowMs; }
    entry.count += 1;
    hits.set(key, entry);
    if (entry.count > max) return res.status(429).json({ error: 'Too many requests. Please slow down and try again shortly.' });
    next();
  };
}

module.exports = { simpleRateLimit };
