import type { GrowthRepository } from '../repository/growth-repository.js';
import type { AuthorizationProvider } from './authorization.js';

export interface RequestContext {
  requestingUserId: string;
  repo: GrowthRepository;
  authz: AuthorizationProvider;
}

/**
 * TODO(integration): implement this against CodeForge's real session
 * handling (e.g. Supabase auth cookies via @supabase/ssr) and real
 * instructor/role tables, then construct a SupabaseGrowthRepository with
 * your app's server-side Supabase client. This intentionally throws
 * rather than returning a fake authenticated user — a stub that "worked"
 * by accident here is exactly the unauthenticated hole section 97 warns
 * against, and it's easy to lose track of a silent placeholder once
 * routes wired to it start returning 200s.
 */
export async function getRequestContext(_request: Request): Promise<RequestContext> {
  throw new Error('getRequestContext is not implemented — wire this to your real session and a real AuthorizationProvider before using these routes.');
}
