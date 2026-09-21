import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client bound to the incoming request's cookies.
 * Uses the current getAll/setAll cookie interface (the get/set/remove
 * interface is deprecated upstream) — see README "Auth" section.
 *
 * This client is ONLY used to answer "who is logged in" via getClaims()
 * (see requireUser() below). Actual incident data reads/writes go through
 * the repo layer (src/lib/repo) on the DATABASE_URL connection — see
 * src/lib/repo/pool.ts for why.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component (not a Route Handler / Server
          // Action) where cookies can't be written. Safe to ignore as long
          // as middleware.ts is refreshing the session on navigations.
        }
      },
    },
  });
}

export class UnauthenticatedError extends Error {
  constructor() {
    super("Not signed in");
    this.name = "UnauthenticatedError";
  }
}

/**
 * Resolves the current user's id, verifying the JWT against Supabase's
 * published keys (getClaims) rather than trusting a cached/unverified
 * session — the pattern Supabase's own docs currently recommend over
 * getSession() for anything security-sensitive.
 */
export async function requireUserId(): Promise<string> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || !sub) {
    throw new UnauthenticatedError();
  }
  return sub;
}
