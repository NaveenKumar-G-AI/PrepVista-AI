/**
 * Ties together prompt-builder, the provider router, schema validation,
 * and the output guard into one call. This is the ONLY place that talks
 * to an AI provider for hint content.
 *
 * Failure isolation: if every provider is unavailable (no keys configured
 * — expected in a fresh checkout per the project's ".env left blank"
 * instructions — or a live outage) or output never validates even after
 * one retry, this returns a DETERMINISTIC_FALLBACK payload built only
 * from real, already-computed data (the root-issue hypothesis). It never
 * fabricates a fake "AI-generated" response — the `source` field always
 * tells the truth about where the content came from, and the UI is
 * expected to visually distinguish DETERMINISTIC_FALLBACK (see
 * HintCard.tsx).
 */

import { PolicyDecision } from "./policy-engine";
import { buildRetryUserPrompt, buildUserPrompt, PromptContext, SYSTEM_PROMPT } from "./prompt-builder";
import { AIProvider, ProviderCallResult, ProviderName } from "./providers/types";
import { ProviderRouter } from "./providers/router";
import { parseModelOutput } from "./schema";
import { enforceOutputPolicy, genericFallbackFromLevel, GuardedHintPayload } from "./output-guard";

export interface GenerateHintResult {
  payload: GuardedHintPayload;
  source: "AI_GENERATED" | "DETERMINISTIC_FALLBACK";
  provider: ProviderName | null;
  model: string | null;
  latencyMs: number | null;
  violations: string[];
  attempts: number;
}

export async function generateHint(params: {
  router: ProviderRouter;
  decision: PolicyDecision;
  promptContext: PromptContext;
}): Promise<GenerateHintResult> {
  let userPrompt = buildUserPrompt(params.promptContext);
  let violations: string[] = [];
  let attempt = 1;

  for (; attempt <= 2; attempt++) {
    let providerResult: ProviderCallResult;
    try {
      providerResult = await params.router.generateForLevel(params.decision.targetLevel, {
        systemPrompt: SYSTEM_PROMPT,
        userPrompt,
      });
    } catch (err) {
      violations = [`provider_unavailable: ${err instanceof Error ? err.message : String(err)}`];
      break; // connectivity/config failure — retrying the same prompt won't help
    }

    const parsed = parseModelOutput(providerResult.rawText);
    if (parsed.ok && parsed.data) {
      const guard = enforceOutputPolicy(parsed.data, params.decision);
      return {
        payload: guard.safe,
        source: "AI_GENERATED",
        provider: providerResult.provider,
        model: providerResult.model,
        latencyMs: providerResult.latencyMs,
        violations: guard.violations,
        attempts: attempt,
      };
    }

    violations = parsed.errors;
    if (attempt === 1) {
      userPrompt = buildRetryUserPrompt({
        original: params.promptContext,
        previousRawOutput: providerResult.rawText,
        validationErrors: parsed.errors,
      });
    }
  }

  return {
    payload: deterministicFallback(params.decision, params.promptContext),
    source: "DETERMINISTIC_FALLBACK",
    provider: null,
    model: null,
    latencyMs: null,
    violations,
    attempts: attempt,
  };
}

function deterministicFallback(decision: PolicyDecision, ctx: PromptContext): GuardedHintPayload {
  const location = ctx.rootIssue.relevantArea;
  const locationPhrase =
    location && location.sourceOfTruth !== "NONE" && location.functionName ? ` Focus on \`${location.functionName}\`.` : "";

  return {
    assistanceLevel: decision.targetLevel,
    hintType: decision.targetHintType,
    observation: ctx.rootIssue.observedFailure,
    hint: `${genericFallbackFromLevel(decision.targetLevel)}${locationPhrase}`,
    targetArea: location?.functionName ?? null,
    confidence: "LOW",
    teachingObjective: ctx.rootIssue.teachingObjective,
    solutionRevealed: false,
  };
}

/** Small helper for service.ts / API routes to build the router from whichever providers are actually constructed. */
export function buildRouter(providers: Partial<Record<ProviderName, AIProvider>>, routerConfig: { primary: ProviderName; timeoutMs: number }) {
  return new ProviderRouter(providers, routerConfig);
}
