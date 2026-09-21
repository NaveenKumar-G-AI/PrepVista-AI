import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import { PgRepository } from '../db/pgRepository.js';
import { registerRoutes } from './routes.js';

export interface AuthContext {
  role: 'service' | 'student';
  studentId: string | null; // set when role === 'student'
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext;
  }
}

/**
 * Auth placeholder (req #99/#100): parses `Authorization: Bearer service:<token>` or
 * `Bearer student:<uuid>`. This is NOT real token verification — it's the seam where
 * real auth plugs in. Swap this function for real JWT verification (Supabase JWT,
 * your own session token, etc.) before this ever sees production traffic; nothing
 * downstream should change, since routes only ever consult `request.auth`.
 */
function parseAuthHeader(header: string | undefined): AuthContext {
  if (!header?.startsWith('Bearer ')) return { role: 'student', studentId: null };
  const token = header.slice('Bearer '.length);
  const serviceToken = process.env.SERVICE_AUTH_TOKEN;
  if (serviceToken && token === `service:${serviceToken}`) return { role: 'service', studentId: null };
  if (token.startsWith('student:')) return { role: 'student', studentId: token.slice('student:'.length) };
  return { role: 'student', studentId: null };
}

export async function buildServer() {
  const app = Fastify({ logger: false });
  await app.register(sensible);

  const connectionString = process.env.DATABASE_URL_SERVICE;
  if (!connectionString) {
    throw new Error('DATABASE_URL_SERVICE is not set — see .env.example. The API always connects as app_service and enforces its own per-request authorization (see auth.ts); it never trusts a client-supplied student_id without checking it against the auth context.');
  }
  const repo = new PgRepository({ connectionString });

  app.addHook('preHandler', async (request) => {
    request.auth = parseAuthHeader(request.headers.authorization);
  });

  registerRoutes(app, repo);

  app.addHook('onClose', async () => {
    await repo.close();
  });

  return app;
}
