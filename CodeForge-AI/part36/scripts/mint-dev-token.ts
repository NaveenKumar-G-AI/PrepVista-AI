/**
 * Dev-only helper: mints a bearer token so you can call the API
 * locally without a real identity provider. NEVER use this pattern in
 * production — see IdentityPort note in src/middleware/auth.ts for
 * the real integration point.
 *
 * Usage: npm run mint-token -- <organizationId> <role>
 * Example: npm run mint-token -- org_demo TPO
 */
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env';
import { Role } from '../src/domain/enums';

const [organizationId, roleArg] = process.argv.slice(2);

if (!organizationId || !roleArg) {
  console.error('Usage: npm run mint-token -- <organizationId> <role>');
  console.error(`Valid roles: ${Object.values(Role).join(', ')}`);
  process.exit(1);
}

if (!Object.values(Role).includes(roleArg as Role)) {
  console.error(`Invalid role "${roleArg}". Valid roles: ${Object.values(Role).join(', ')}`);
  process.exit(1);
}

if (!env.JWT_SECRET) {
  console.error('Set JWT_SECRET in your .env before minting a token.');
  process.exit(1);
}

const token = jwt.sign({ organizationId, role: roleArg }, env.JWT_SECRET, {
  subject: `dev-user-${roleArg.toLowerCase()}`,
  issuer: env.JWT_ISSUER,
  expiresIn: '12h',
});

console.log(token);
