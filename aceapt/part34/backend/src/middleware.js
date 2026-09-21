import { DEMO_STUDENT_ID } from './db/seed.js';

/*
 * ---------------------------------------------------------------------------
 * AUTH (placeholder - NOT production security)
 * ---------------------------------------------------------------------------
 * ACEAPT's real authentication, session handling, and tenant isolation are
 * NOT implemented here. This checks one shared token as a stand-in so the
 * API at least has an auth boundary during development, and - importantly -
 * resolves req.studentId from the authenticated caller rather than trusting
 * a client-supplied id, so at least the *shape* of "never let one student
 * read another's data" (brief sections 46/47) is present. Replace this
 * entire file with ACEAPT's real auth (and real role checks for the future
 * trainer/institutional views) before any real student data touches this.
 * ---------------------------------------------------------------------------
 */
export function demoAuth(req, res, next) {
  const configuredToken = process.env.DEMO_AUTH_TOKEN;
  if (!configuredToken) {
    // No token configured - open dev mode. Loud on purpose (see server.js).
    req.studentId = DEMO_STUDENT_ID;
    return next();
  }
  const supplied = req.header('x-demo-token');
  if (supplied !== configuredToken) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  req.studentId = DEMO_STUDENT_ID;
  next();
}

// Never leaks stack traces or internal error detail to the client (brief
// section 50) - logs the real error server-side instead.
export function errorHandler(err, req, res, _next) {
  console.error('[api error]', err);
  res.status(500).json({ error: "We couldn't update your career analysis right now." });
}

export function asyncRoute(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
}
