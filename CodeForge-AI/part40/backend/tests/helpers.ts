import jwt from "jsonwebtoken";
import { env } from "../src/config/env";
import type { Role } from "../src/types/identity";

export interface TestUser {
  userId: string;
  role: Role;
  organizationId: string | null;
}

// Fixed, readable UUIDs — deliberately not random, so test failures are
// easy to read ("org A" vs some opaque uuid) and assertions can hardcode them.
export const ORG_A = "10000000-0000-0000-0000-00000000000a";
export const ORG_B = "20000000-0000-0000-0000-00000000000b";

export const USERS = {
  studentA: { userId: "a0000000-0000-0000-0000-000000000001", role: "STUDENT", organizationId: ORG_A } satisfies TestUser,
  trainerA: { userId: "a0000000-0000-0000-0000-000000000002", role: "TRAINER", organizationId: ORG_A } satisfies TestUser,
  tpoA: { userId: "a0000000-0000-0000-0000-000000000003", role: "TPO", organizationId: ORG_A } satisfies TestUser,
  adminA: { userId: "a0000000-0000-0000-0000-000000000004", role: "ADMIN", organizationId: ORG_A } satisfies TestUser,
  adminB: { userId: "b0000000-0000-0000-0000-000000000001", role: "ADMIN", organizationId: ORG_B } satisfies TestUser,
  studentB: { userId: "b0000000-0000-0000-0000-000000000002", role: "STUDENT", organizationId: ORG_B } satisfies TestUser,
  platformOperator: { userId: "f0000000-0000-0000-0000-000000000001", role: "PLATFORM_OPERATOR", organizationId: null } satisfies TestUser
};

export function signToken(user: TestUser, opts: { authTimeOffsetSeconds?: number; sessionId?: string } = {}): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  // iat simulates "when the user originally authenticated" (what
  // requireRecentAuth checks) — deliberately independent of the token's
  // own expiry. Real Supabase tokens are typically short-lived and
  // re-minted on refresh, but a test that used jwt.sign's `expiresIn`
  // relative to a backdated `iat` would make the token itself expire
  // exactly when we're trying to test staleness, not authenticity —
  // setting `exp` explicitly, relative to real wall-clock now, avoids
  // conflating "credential is old" with "credential is expired".
  const iat = nowSeconds - (opts.authTimeOffsetSeconds ?? 0);
  const exp = nowSeconds + 3600;
  return jwt.sign(
    {
      sub: user.userId,
      iat,
      exp,
      app_metadata: { role: user.role, organization_id: user.organizationId ?? undefined },
      session_id: opts.sessionId
    },
    env.SUPABASE_JWT_SECRET!,
    { algorithm: "HS256" }
  );
}

export function authHeader(user: TestUser, opts?: { authTimeOffsetSeconds?: number; sessionId?: string }): [string, string] {
  return ["Authorization", `Bearer ${signToken(user, opts)}`];
}
