/**
 * Supabase server client, wired for Next.js App Router route handlers
 * and server components.
 *
 * Two things worth calling out because they're easy to get wrong (and
 * silently insecure when wrong):
 *   1. Cookie sync uses getAll/setAll — the get/set/remove trio is
 *      deprecated and some versions of @supabase/ssr no longer support it.
 *   2. Server-side auth checks use `getClaims()`, not `getSession()`.
 *      `getSession()` reads whatever is in the cookie without
 *      revalidating the JWT signature; `getClaims()` verifies the token
 *      against Supabase's published keys on every call. Route handlers
 *      that gate access (like ours) must use getClaims().
 */

import { createServerClient, type CookieOptionsWithName } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: CookieOptionsWithName }>) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component — safe to ignore; middleware
          // (not included in this reference implementation — wire it up
          // the same way the rest of CodeForge already does session
          // refresh) is responsible for persisting refreshed cookies.
        }
      },
    },
  });
}

/**
 * Service-role client for privileged server-only operations. This key
 * bypasses RLS entirely — it must never be imported into any file that
 * could end up in a client bundle, and every call site using it must do
 * its own explicit ownership check first (see service.ts). Prefer the
 * user-scoped client above wherever RLS enforcement alone is sufficient.
 */
export function createSupabaseServiceRoleClient() {
  // Imported lazily / only where needed so this file doesn't force the
  // service-role key to be read in request paths that don't need it.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createClient } = require("@supabase/supabase-js") as typeof import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL are not configured.");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Verifies the caller's JWT and returns their user id, or null if unauthenticated. Uses getClaims(), not getSession() — see module doc. */
export async function getAuthenticatedUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  return (data.claims.sub as string) ?? null;
}
