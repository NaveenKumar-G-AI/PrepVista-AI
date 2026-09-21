import { randomUUID } from "node:crypto";
import type { AssembledCoachingContext } from "../types";
import { CoachResponseSchema, type CoachResponse } from "../schema";
import { buildCoachPrompt } from "../prompt/buildPrompt";
import type { LLMProvider } from "../providers/provider.interface";
import { checkGrounding, sanitizeAgainstGrounding } from "../security/groundingGuard";
import { detectInjectionAttempt } from "../security/promptInjectionGuard";
import { isResponseTypeAllowed } from "../security/policyEnforcement";
import { isRepeatHint } from "./antiRepetition";
import type { TelemetrySink } from "../telemetry/telemetry";

export interface CoachEngineDeps {
  provider: LLMProvider;
  telemetry: TelemetrySink;
}

export interface CoachEngineResult {
  ok: boolean;
  response?: CoachResponse;
  correlationId: string;
}

// Returned when the provider fails or produces unusable output twice in a
// row. Coaching goes offline; code editing, submission, and execution must
// not be affected by this at all — see AI FAILURE ISOLATION in the spec.
const SAFE_FALLBACK: CoachResponse = {
  response_type: "CLARIFICATION",
  observation: "AI coaching is temporarily unavailable right now. Your code, submission, and results are unaffected — try again in a moment.",
  code_locations: [],
  confidence: "LOW",
  coaching_level: 1,
  solution_reveal: false,
};

export async function runCoachEngine(ctx: AssembledCoachingContext, deps: CoachEngineDeps): Promise<CoachEngineResult> {
  const correlationId = randomUUID();

  if (detectInjectionAttempt(ctx.code.source, ctx.request.studentQuestion, ctx.problem.statement)) {
    deps.telemetry.emit({ type: "prompt_injection_suspected", correlationId, sessionId: ctx.state.sessionId });
  }

  const { system, user } = buildCoachPrompt(ctx);
  const start = Date.now();
  let attempt = 0;
  let lastError: unknown;

  while (attempt < 2) {
    attempt += 1;
    try {
      const result = await deps.provider.generate({ system, user, maxTokens: 700, temperature: 0.2, timeoutMs: 15000 });

      const parsed = safeParseModelJson(result.rawText);
      if (!parsed.ok) {
        deps.telemetry.emit({ type: "validation_failure", correlationId, reason: parsed.reason, attempt });
        continue;
      }

      const schemaResult = CoachResponseSchema.safeParse(parsed.value);
      if (!schemaResult.success) {
        deps.telemetry.emit({ type: "validation_failure", correlationId, reason: schemaResult.error.message, attempt });
        continue;
      }

      let response = schemaResult.data;

      if (!isResponseTypeAllowed(ctx.policyMode, response.response_type)) {
        deps.telemetry.emit({
          type: "policy_violation",
          correlationId,
          reason: `response_type ${response.response_type} not allowed while policyMode=${ctx.policyMode}`,
        });
        response = { ...response, response_type: "HINT", solution_reveal: false };
      }

      if (response.response_type === "HINT" && isRepeatHint(response.observation, ctx.state.previousHints)) {
        deps.telemetry.emit({ type: "repeat_hint_suppressed", correlationId, sessionId: ctx.state.sessionId });
        response = { ...response, coaching_level: Math.min(response.coaching_level + 1, 5) };
      }

      const issues = checkGrounding(ctx, response);
      if (issues.length > 0) {
        deps.telemetry.emit({ type: "grounding_violation", correlationId, issues });
        response = sanitizeAgainstGrounding(response, issues);
      }

      deps.telemetry.emit({
        type: "coach_request_completed",
        correlationId,
        provider: deps.provider.name,
        latencyMs: Date.now() - start,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        retryCount: attempt - 1,
        success: true,
      });

      return { ok: true, response, correlationId };
    } catch (err) {
      lastError = err;
      deps.telemetry.emit({
        type: "provider_error",
        correlationId,
        attempt,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  deps.telemetry.emit({
    type: "coach_request_completed",
    correlationId,
    provider: deps.provider.name,
    latencyMs: Date.now() - start,
    retryCount: attempt - 1,
    success: false,
    error: lastError instanceof Error ? lastError.message : String(lastError ?? "unknown"),
  });

  return { ok: false, response: SAFE_FALLBACK, correlationId };
}

function safeParseModelJson(raw: string): { ok: true; value: unknown } | { ok: false; reason: string } {
  try {
    const cleaned = raw
      .trim()
      .replace(/^```json/i, "")
      .replace(/^```/, "")
      .replace(/```$/, "")
      .trim();
    return { ok: true, value: JSON.parse(cleaned) };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "unknown JSON parse error" };
  }
}
