/**
 * Central config. Reading this module never throws, even with every env var
 * blank — that's deliberate, so you can drop this into a project, leave
 * secrets empty, and fill them in later without anything crashing at import
 * time. Things that actually need a value (e.g. the DB pool) fail loudly the
 * moment they're used instead.
 */
import 'dotenv/config';

function optionalInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}

export const config = {
  port: optionalInt(process.env.PORT) ?? 4058,

  database: {
    url: process.env.DATABASE_URL ?? '',
  },

  auth: {
    // Placeholder for whatever ACEAPT already uses to verify session/JWT tokens.
    // Leave blank until you wire in the real verifier in middleware/auth.ts.
    jwtPublicKey: process.env.JWT_PUBLIC_KEY ?? '',
  },

  aiGateway: {
    apiKey: process.env.AI_GATEWAY_API_KEY ?? '',
    model: process.env.AI_GATEWAY_MODEL || 'claude-sonnet-4-6',
  },

  /** Only meaningful for local/dev single-tenant runs; production requests
   *  should always carry a real tenant id from auth context. */
  defaultTenantId: process.env.DEFAULT_TENANT_ID ?? '',
};

export function assertDatabaseConfigured(): void {
  if (!config.database.url) {
    throw new Error(
      'DATABASE_URL is not set. Fill it in your .env file before performing any database operation.'
    );
  }
}
