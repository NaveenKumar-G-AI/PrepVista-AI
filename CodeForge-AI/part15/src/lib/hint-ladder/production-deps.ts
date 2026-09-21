/**
 * Production dependency wiring for the API routes.
 *
 * The rate limiter and provider router are constructed ONCE per server
 * process (module-level singletons) — recreating an in-memory rate
 * limiter on every request would defeat its purpose. The repository is
 * request-scoped because it wraps a Supabase client that's already
 * authenticated as the calling user's session (see server-client.ts).
 *
 * `existingSystems` still points at DemoExistingSystemsAdapter — see
 * src/lib/stand-ins/existing-systems-adapter.ts for why, and swap it for
 * a real adapter backed by CodeForge's actual problems/submissions/
 * execution_results/coaching_sessions tables when merging this in.
 */

import { loadModePolicyLimitsFromEnv } from "./policy-engine";
import { loadRateLimiterFromEnv, RateLimiter } from "./rate-limit";
import { GeminiProvider, loadGeminiConfigFromEnv } from "./providers/gemini-provider";
import { GroqProvider, loadGroqConfigFromEnv } from "./providers/groq-provider";
import { loadRouterConfigFromEnv, ProviderRouter } from "./providers/router";
import { HintLadderServiceDeps } from "./service";
import { createSupabaseServerClient } from "../supabase/server-client";
import { SupabaseHintLadderRepository } from "./repository/supabase-repository";
import { DemoExistingSystemsAdapter } from "../stand-ins/existing-systems-adapter";

let rateLimiterSingleton: RateLimiter | null = null;
let routerSingleton: ProviderRouter | null = null;
let demoAdapterSingleton: DemoExistingSystemsAdapter | null = null;

function getRateLimiter(): RateLimiter {
  if (!rateLimiterSingleton) rateLimiterSingleton = loadRateLimiterFromEnv();
  return rateLimiterSingleton;
}

function getRouter(): ProviderRouter {
  if (!routerSingleton) {
    routerSingleton = new ProviderRouter(
      {
        groq: new GroqProvider(loadGroqConfigFromEnv()),
        gemini: new GeminiProvider(loadGeminiConfigFromEnv()),
      },
      loadRouterConfigFromEnv()
    );
  }
  return routerSingleton;
}

/** DEMO ONLY — see module doc. Swap for a real adapter in production. */
function getDemoAdapter(): DemoExistingSystemsAdapter {
  if (!demoAdapterSingleton) demoAdapterSingleton = new DemoExistingSystemsAdapter();
  return demoAdapterSingleton;
}

/** DEMO ONLY — lets src/app/api/hint-ladder/demo-submit share the same adapter instance the real hint routes read from. Delete alongside the demo route and DemoExistingSystemsAdapter when wiring up a real adapter. */
export function __getDemoAdapterForDemoRouteOnly(): DemoExistingSystemsAdapter {
  return getDemoAdapter();
}

export async function buildRequestScopedDeps(): Promise<{ deps: HintLadderServiceDeps; studentId: string | null }> {
  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  const studentId = (claims?.claims.sub as string | undefined) ?? null;

  const deps: HintLadderServiceDeps = {
    repository: new SupabaseHintLadderRepository(supabase),
    existingSystems: getDemoAdapter(),
    router: getRouter(),
    rateLimiter: getRateLimiter(),
    modeLimits: loadModePolicyLimitsFromEnv(),
    now: () => new Date().toISOString(),
  };

  return { deps, studentId };
}
