// ============================================================================
// Coach orchestrator (Sections 37-42)
// ============================================================================
// Glues the deterministic next-best-action engine to the AI layer.
//
// Design invariant (Sections 38, 40): the deterministic engine always
// computes a valid, safe top action first. The AI is only allowed to (a)
// pick among that engine's own top candidates and (b) write the coaching
// language around the pick — it can never introduce an action outside the
// candidates it was offered, and it can never exceed the coaching-mode's
// server-authoritative level ceiling (Section 34), regardless of what it
// returns. If AI is unavailable, slow, or returns anything that fails
// validation, this falls back to the deterministic pick with the phase's
// templated question — the debugging session itself is never blocked on AI
// (Section 42).
// ============================================================================

import { rankActions } from "../domain/next-best-action.js";
import { PHASE_CANONICAL_QUESTION } from "../domain/phase-model.js";
import { AiProvider } from "./providers.js";
import { buildSystemPrompt, buildUserPrompt } from "./prompts.js";
import { validateAiOutput } from "./output-schema.js";
import {
  COACHING_LEVEL_CEILING,
  COACHING_LEVEL_ORDER,
  ConfidenceLevel,
  DebuggingActionType,
  DebuggingCoachState,
  InformationGain,
  NextBestAction,
} from "../types.js";

export interface OrchestrateOptions {
  studentFreeText?: string;
  timeoutMs?: number;
  /** How many top-ranked deterministic candidates to offer the AI. */
  candidateCount?: number;
}

export interface OrchestrateResult {
  nextBestAction: NextBestAction;
  aiAvailable: boolean;
  aiError?: string;
}

function deterministicOnly(state: DebuggingCoachState, ranked: ReturnType<typeof rankActions>): NextBestAction {
  const top = ranked[0];
  if (!top) {
    return {
      phase: state.currentPhase,
      recommendedAction: DebuggingActionType.REPRODUCE_FAILURE,
      reason: "No candidates were safe to recommend yet; defaulting to the phase opener.",
      evidenceRefs: [],
      expectedInformationGain: InformationGain.MEDIUM,
      coachingLevel: state.coachingLevel,
      question: PHASE_CANONICAL_QUESTION[state.currentPhase],
      confidence: ConfidenceLevel.LOW,
      aiGenerated: false,
      candidates: [],
    };
  }
  return {
    phase: state.currentPhase,
    recommendedAction: top.action,
    target: top.target,
    reason: top.reason,
    evidenceRefs: [],
    expectedInformationGain: top.informationGain,
    coachingLevel: state.coachingLevel,
    question: PHASE_CANONICAL_QUESTION[state.currentPhase],
    confidence: ConfidenceLevel.LOW,
    aiGenerated: false,
    candidates: ranked.slice(0, 5),
  };
}

/** Clamp to the mode's server-authoritative ceiling — never trust the AI's own level choice past it (Section 34). */
function clampCoachingLevel(level: NextBestAction["coachingLevel"], mode: DebuggingCoachState["coachingMode"]) {
  const ceiling = COACHING_LEVEL_CEILING[mode];
  const ceilingIdx = COACHING_LEVEL_ORDER.indexOf(ceiling);
  const levelIdx = COACHING_LEVEL_ORDER.indexOf(level);
  return levelIdx > ceilingIdx ? ceiling : level;
}

export async function orchestrateGuidance(
  state: DebuggingCoachState,
  provider: AiProvider | undefined,
  options: OrchestrateOptions = {}
): Promise<OrchestrateResult> {
  const ranked = rankActions(state);
  const fallback = deterministicOnly(state, ranked);

  if (!provider) {
    return { nextBestAction: fallback, aiAvailable: false, aiError: "No AI provider configured." };
  }

  const topN = ranked.slice(0, options.candidateCount ?? 4);
  if (topN.length === 0) {
    return { nextBestAction: fallback, aiAvailable: false, aiError: "No safe candidates to offer the AI." };
  }
  const allowedActions = topN.map((c) => c.action);

  try {
    const systemPrompt = buildSystemPrompt(state.coachingMode, allowedActions);
    const userPrompt = buildUserPrompt({
      state,
      topCandidates: topN,
      coachingLevel: state.coachingLevel,
      studentFreeText: options.studentFreeText,
    });

    const raw = await provider.complete({ systemPrompt, userPrompt, timeoutMs: options.timeoutMs ?? 8000 });
    const validation = validateAiOutput(raw, allowedActions);

    if (!validation.valid || !validation.data) {
      return { nextBestAction: fallback, aiAvailable: false, aiError: `AI output failed validation: ${validation.errors?.join("; ")}` };
    }

    const data = validation.data;

    // Target is treated the same way as action: only trust it if it exactly
    // matches a (action, target) pair the deterministic engine actually
    // offered. Otherwise fall back to that candidate's own target rather
    // than trusting a free-form string the AI produced (Section 38: AI must
    // not determine authoritative source locations).
    const exactCandidate = topN.find((c) => c.action === data.recommendedAction && c.target === data.target);
    const anyCandidateForAction = topN.find((c) => c.action === data.recommendedAction);
    const finalTarget = exactCandidate ? data.target : anyCandidateForAction?.target;

    const finalCoachingLevel = clampCoachingLevel(data.coachingLevel, state.coachingMode);

    return {
      nextBestAction: {
        phase: state.currentPhase,
        recommendedAction: data.recommendedAction,
        target: finalTarget,
        reason: data.reason,
        evidenceRefs: [],
        expectedInformationGain: data.expectedInformationGain,
        coachingLevel: finalCoachingLevel,
        question: data.question,
        confidence: data.confidence,
        aiGenerated: true,
        candidates: ranked.slice(0, 5),
      },
      aiAvailable: true,
    };
  } catch (err) {
    return { nextBestAction: fallback, aiAvailable: false, aiError: err instanceof Error ? err.message : String(err) };
  }
}
