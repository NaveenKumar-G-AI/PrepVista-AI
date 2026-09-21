/**
 * Dev-only helper: mints a token this module's requireAuth will accept,
 * signed with ALIGN_SERVICE_JWT_SECRET. Useful for curling the API before
 * your real ACEAPT auth is wired in. Never use this to issue tokens in
 * production — see src/api/middleware/auth.ts for why.
 *
 * Usage: ALIGN_SERVICE_JWT_SECRET=... npx ts-node src/devtools/mintDevToken.ts <studentId> [role]
 */
import { signHmacJwt } from '../api/middleware/auth';

const [studentId, role = 'student'] = process.argv.slice(2);

if (!studentId) {
  console.error('Usage: mintDevToken.ts <studentId> [role=student|tpo|trainer|service]');
  process.exit(1);
}

const secret = process.env.ALIGN_SERVICE_JWT_SECRET;
if (!secret) {
  console.error('ALIGN_SERVICE_JWT_SECRET must be set in the environment.');
  process.exit(1);
}

const token = signHmacJwt(
  { sub: studentId, role, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 },
  secret,
);
console.log(token);
