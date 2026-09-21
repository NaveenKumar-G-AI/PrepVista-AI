/**
 * Policy engine.
 *
 * This module answers ONE question deterministically: given everything we
 * know right now, what should happen next? It never calls an LLM — the
 * decision of "how much help, what kind, why" is made here from evidence;
 * the LLM (see prompt-builder.ts / service.ts) is only ever asked to
 * phrase content for the level+strategy this engine already chose, never
 * to decide the level+strategy itself. That separation is what makes the
 * escalation policy auditable, testable, and immune to prompt injection
 * changing how much help gets revealed.
 */

import { isDuplicateHint, nextUntriedStrategy } from "./anti-repetition";
import { EvidenceAnalysisResult } from "./evidence-analyzer";
import {
  AssistanceLevel,
  DeliveredHintRecord,
  ExecutionEvidence,
  HintEffectiveness,
  HintRequestAction,
  HintType,
  ProductMode,
  StudentResponseSignal,
  levelAfter,
  levelIndex,
} from "./types";

export type ModePolicyLimits = Record<ProductMode, AssistanceLevel>;

export const DEFAULT_MODE_POLICY_LIMITS: ModePolicyLimits = {
  PRACTICE: "SOLUTION_ASSISTANCE",
  ASSESSMENT: "DIRECTION",
  INTERVIEW: "CONCEPT",
};

/** Minimum number of hints already delivered before a solution can even be requested, regardless of mode. */
const MIN_HINTS_BEFORE_SOLUTION = 2;
/** Consecutive ineffective hints before we skip ahead more decisively instead of incrementing one level at a time. */
const FRUSTRATION_THRESHOLD = 3;

const DEFAULT_HINT_TYPE_FOR_LEVEL: Record<AssistanceLevel, HintType> = {
  INDEPENDENT: "DIRECTION",
  DIRECTION: "DIRECTION",
  CONCEPT: "CONCEPT",
  TARGETED: "TARGETED",
  SPECIFIC: "SPECIFIC",
  DETAILED: "EXPLANATION",
  SOLUTION_ASSISTANCE: "SOLUTION_ASSISTANCE",
};

export type PolicyDecisionKind =
  | "RESOLVED"
  | "DELIVER_FIRST_HINT"
  | "ACKNOWLEDGE_PROGRESS_AND_CONTINUE"
  | "ESCALATE_STRATEGY"
  | "ESCALATE_LEVEL"
  | "HOLD_AND_ENCOURAGE"
  | "DENY_SOLUTION"
  | "DELIVER_SOLUTION";

export interface PolicyDecision {
  kind: PolicyDecisionKind;
  targetLevel: AssistanceLevel;
  targetHintType: HintType;
  /** Whether the root issue hypothesis should be recomputed from current evidence rather than reused. */
  freshRootIssue: boolean;
  reason: string;
  /** Set only for RESOLVED / HOLD_AND_ENCOURAGE — fully deterministic text, no AI call needed. */
  templatedMessage?: string;
  denialReason?: string;
  offerSolutionOption: boolean;
}

export interface PolicyInput {
  mode: ProductMode;
  modeLimits: ModePolicyLimits;
  currentLevel: AssistanceLevel;
  consecutiveIneffectiveCount: number;
  history: DeliveredHintRecord[];
  lastHint: DeliveredHintRecord | null;
  currentExecution: ExecutionEvidence | null;
  evidence: EvidenceAnalysisResult | null; // null only when there is no prior hint to evaluate
  action: HintRequestAction;
  studentResponse: StudentResponseSignal | null;
}

function clampToCeiling(level: AssistanceLevel, ceiling: AssistanceLevel): AssistanceLevel {
  return levelIndex(level) > levelIndex(ceiling) ? ceiling : level;
}

function resolutionMessage(execution: ExecutionEvidence | null, priorExecution: ExecutionEvidence | null): string {
  if (!execution) return "The issue appears resolved.";
  if (execution.testsPassed !== null && execution.testsTotal !== null) {
    if (priorExecution?.testsPassed !== null && priorExecution?.testsPassed !== undefined && priorExecution.testsPassed !== execution.testsPassed) {
      return `Your latest submission improved from ${priorExecution.testsPassed}/${execution.testsTotal} to ${execution.testsPassed}/${execution.testsTotal}. The issue appears resolved.`;
    }
    return `Your latest submission passed all ${execution.testsTotal} tests. The issue appears resolved.`;
  }
  return "The issue appears resolved.";
}

function progressMessage(evidence: EvidenceAnalysisResult, execution: ExecutionEvidence | null, priorExecution: ExecutionEvidence | null): string | undefined {
  if (priorExecution?.testsPassed == null || execution?.testsTotal == null || execution?.testsPassed == null) return undefined;
  return `Your latest submission improved from ${priorExecution.testsPassed}/${execution.testsTotal} to ${execution.testsPassed}/${execution.testsTotal}.`;
}

export function decideNextAction(input: PolicyInput): PolicyDecision {
  const ceiling = input.modeLimits[input.mode];

  // ---- Explicit solution request -------------------------------------
  if (input.action === "REQUEST_SOLUTION") {
    const gates: string[] = [];
    if (levelIndex(ceiling) < levelIndex("SOLUTION_ASSISTANCE")) {
      gates.push(`Solution-level assistance is not available in ${input.mode} mode.`);
    }
    if (levelIndex(input.currentLevel) < levelIndex("DETAILED")) {
      gates.push("The ladder hasn't reached detailed guidance yet — try the next hint first.");
    }
    if (input.history.length < MIN_HINTS_BEFORE_SOLUTION) {
      gates.push("A little more guided attempt is needed before jumping to the full solution.");
    }
    if (gates.length > 0) {
      return {
        kind: "DENY_SOLUTION",
        targetLevel: input.currentLevel,
        targetHintType: DEFAULT_HINT_TYPE_FOR_LEVEL[input.currentLevel],
        freshRootIssue: false,
        reason: "solution_request_denied",
        denialReason: gates.join(" "),
        offerSolutionOption: false,
      };
    }
    return {
      kind: "DELIVER_SOLUTION",
      targetLevel: "SOLUTION_ASSISTANCE",
      targetHintType: "SOLUTION_ASSISTANCE",
      freshRootIssue: false,
      reason: "solution_request_authorized",
      offerSolutionOption: false,
    };
  }

  const priorExecution = input.lastHint?.executionSnapshotAtDelivery
    ? ({ ...input.lastHint.executionSnapshotAtDelivery } as ExecutionEvidence)
    : null;

  // ---- Fully resolved --------------------------------------------------
  if (input.currentExecution?.verdict === "ACCEPTED") {
    return {
      kind: "RESOLVED",
      targetLevel: input.currentLevel,
      targetHintType: DEFAULT_HINT_TYPE_FOR_LEVEL[input.currentLevel],
      freshRootIssue: false,
      reason: "execution_accepted",
      templatedMessage: resolutionMessage(input.currentExecution, priorExecution),
      offerSolutionOption: false,
    };
  }

  // ---- No hint delivered yet --------------------------------------------
  if (input.history.length === 0 || !input.lastHint || !input.evidence) {
    return {
      kind: "DELIVER_FIRST_HINT",
      targetLevel: clampToCeiling("DIRECTION", ceiling),
      targetHintType: "DIRECTION",
      freshRootIssue: true,
      reason: "no_prior_hint",
      offerSolutionOption: false,
    };
  }

  const { evidence, lastHint } = input;

  switch (evidence.effectiveness as HintEffectiveness) {
    case "STRONG": {
      // Partial (not fully resolved, handled above) but real progress.
      // We don't yet know the NEW root issue's concept — the caller
      // recomputes it (freshRootIssue: true) and, if it turns out to be
      // the same concept as before, service.ts is responsible for
      // treating that as "same issue, needs a bit more precision" by
      // requesting the next level up from lastHint.level. We pick
      // DIRECTION as the safe default target for a genuinely new issue;
      // service.ts overrides to levelAfter(lastHint.level) when the
      // recomputed concept matches the previous one.
      return {
        kind: "ACKNOWLEDGE_PROGRESS_AND_CONTINUE",
        targetLevel: clampToCeiling("DIRECTION", ceiling),
        targetHintType: "DIRECTION",
        freshRootIssue: true,
        reason: "strong_evidence_partial_progress",
        templatedMessage: progressMessage(evidence, input.currentExecution, priorExecution),
        offerSolutionOption: false,
      };
    }

    case "MEDIUM":
    case "WEAK": {
      return {
        kind: "HOLD_AND_ENCOURAGE",
        targetLevel: input.currentLevel,
        targetHintType: lastHint.hintType,
        freshRootIssue: false,
        reason: evidence.effectiveness === "MEDIUM" ? "medium_evidence_awaiting_submission" : "weak_evidence_self_reported",
        templatedMessage:
          evidence.effectiveness === "MEDIUM"
            ? "That change looks like it's in the right area — try running it and submitting to see how it does."
            : "Good — try it out and submit when you're ready; I'll check how it went.",
        offerSolutionOption: false,
      };
    }

    case "PENDING": {
      // Nothing has changed and they're asking again without new
      // evidence — the current framing likely isn't landing. Vary the
      // strategy, but don't burn a level advance on it.
      const nextStrategy = nextUntriedStrategy(input.history, lastHint.targetSignature, lastHint.level);
      return {
        kind: "ESCALATE_STRATEGY",
        targetLevel: input.currentLevel,
        targetHintType: nextStrategy ?? levelUpDefault(input, ceiling).targetHintType,
        freshRootIssue: false,
        reason: "no_new_evidence_since_last_hint",
        offerSolutionOption: false,
      };
    }

    case "INCONCLUSIVE": {
      const nextStrategy = nextUntriedStrategy(input.history, lastHint.targetSignature, lastHint.level);
      return {
        kind: "ESCALATE_STRATEGY",
        targetLevel: input.currentLevel,
        targetHintType: nextStrategy ?? "EXPLANATION",
        freshRootIssue: false,
        reason: "inconclusive_evidence_conservative_strategy_change",
        offerSolutionOption: false,
      };
    }

    case "NEGATIVE": {
      const frustrated = input.consecutiveIneffectiveCount + 1 >= FRUSTRATION_THRESHOLD;
      const nextStrategy = nextUntriedStrategy(input.history, lastHint.targetSignature, lastHint.level);

      if (nextStrategy && !frustrated) {
        const candidate = { targetSignature: lastHint.targetSignature, level: input.currentLevel, hintType: nextStrategy };
        if (!isDuplicateHint(input.history, candidate)) {
          return {
            kind: "ESCALATE_STRATEGY",
            targetLevel: input.currentLevel,
            targetHintType: nextStrategy,
            freshRootIssue: false,
            reason: "negative_evidence_strategy_change",
            offerSolutionOption: false,
          };
        }
      }

      const escalated = levelUpDefault(input, ceiling, frustrated);
      const atCeiling = levelIndex(escalated.targetLevel) >= levelIndex(ceiling);
      const atDetailedOrAbove = levelIndex(escalated.targetLevel) >= levelIndex("DETAILED");

      return {
        kind: "ESCALATE_LEVEL",
        targetLevel: escalated.targetLevel,
        targetHintType: escalated.targetHintType,
        freshRootIssue: false,
        reason: frustrated ? "repeated_ineffective_hints_concrete_jump" : "negative_evidence_level_escalation",
        offerSolutionOption: atCeiling && atDetailedOrAbove && ceiling === "SOLUTION_ASSISTANCE",
      };
    }

    default: {
      // Exhaustive check — TypeScript will flag this if a new
      // HintEffectiveness value is ever added without handling it here.
      const _exhaustive: never = evidence.effectiveness as never;
      throw new Error(`Unhandled effectiveness value: ${_exhaustive}`);
    }
  }
}

function levelUpDefault(
  input: PolicyInput,
  ceiling: AssistanceLevel,
  frustrated = false
): { targetLevel: AssistanceLevel; targetHintType: HintType } {
  const next = frustrated
    ? (levelIndex("DETAILED") > levelIndex(input.currentLevel) ? "DETAILED" : levelAfter(input.currentLevel))
    : levelAfter(input.currentLevel);
  const clamped = clampToCeiling(next, ceiling);
  return { targetLevel: clamped, targetHintType: DEFAULT_HINT_TYPE_FOR_LEVEL[clamped] };
}

export function loadModePolicyLimitsFromEnv(env: NodeJS.ProcessEnv = process.env): ModePolicyLimits {
  const parse = (value: string | undefined, fallback: AssistanceLevel): AssistanceLevel => {
    const candidates: AssistanceLevel[] = [
      "INDEPENDENT", "DIRECTION", "CONCEPT", "TARGETED", "SPECIFIC", "DETAILED", "SOLUTION_ASSISTANCE",
    ];
    return value && (candidates as string[]).includes(value) ? (value as AssistanceLevel) : fallback;
  };
  return {
    PRACTICE: parse(env.HINT_LADDER_MAX_LEVEL_PRACTICE, DEFAULT_MODE_POLICY_LIMITS.PRACTICE),
    ASSESSMENT: parse(env.HINT_LADDER_MAX_LEVEL_ASSESSMENT, DEFAULT_MODE_POLICY_LIMITS.ASSESSMENT),
    INTERVIEW: parse(env.HINT_LADDER_MAX_LEVEL_INTERVIEW, DEFAULT_MODE_POLICY_LIMITS.INTERVIEW),
  };
}
