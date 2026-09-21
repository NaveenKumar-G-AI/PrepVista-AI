import { EngineeringEvidenceRow, EvaluationResult } from "./types";

/**
 * =========================================================================
 * INTEGRATION POINT — READ THIS BEFORE WIRING TO YOUR REAL MASTERY ENGINE
 * =========================================================================
 * The brief asks this feature to feed evidence into CodeForge's *existing*
 * mastery engine, skill graph, adaptive engine, role system, and technical
 * interview engine rather than building parallel copies of them. Those
 * systems were not present anywhere in this conversation — there is no
 * repository to inspect them in — so this file defines the CONTRACT this
 * feature depends on, with a default implementation that just persists
 * evidence locally (via the repo layer) so nothing is silently dropped.
 *
 * To integrate for real: implement `MasteryEngineAdapter` against your
 * actual mastery engine's write path (often a function call or an insert
 * into whatever table your skill graph reads from) and swap it in at
 * `src/lib/engine/masteryAdapterImpl.ts` (create that file — it's not
 * provided, on purpose, since guessing your schema would be worse than
 * leaving an honest gap). Everything upstream of this file — the state
 * machine, action engine, scoring, and evidence extraction — is fully
 * real and doesn't need to change.
 * =========================================================================
 */
export interface MasteryEngineAdapter {
  /** Called once, right after a deterministic evaluation is finalized. */
  recordEvidence(input: {
    userId: string;
    incidentId: string;
    templateSlug: string;
    targetRole: string;
    targetSkills: string[];
    evidence: EngineeringEvidenceRow[];
    evaluation: EvaluationResult;
  }): Promise<void>;
}

/**
 * Recommends the next incident template slug given a very small,
 * explicit signal set. This mirrors the shape the brief describes
 * ("Database: Strong, Observability: Weak -> recommend database
 * performance incident") but the actual mastery/confidence numbers
 * are stubbed as "unknown" here because there's no real skill graph
 * to read from. Swap the body of this function for a real query once
 * connected; the signature is designed to not need to change.
 */
export interface AdaptiveIncidentSelector {
  recommendNext(input: {
    userId: string;
    completedTemplateSlugs: string[];
    weakestCategory: string;
  }): Promise<{ recommendedTemplateSlug: string | null; reason: string }>;
}

/** Default: no-op beyond what recordEvidenceLocally already persisted. */
export const noopMasteryAdapter: MasteryEngineAdapter = {
  async recordEvidence() {
    // Intentionally empty — see file header. Local persistence of the
    // same evidence rows already happens in the evaluate route via
    // repo/evaluation.ts before this adapter is called, so no data is
    // lost by this being a no-op; it's just not yet forwarded to a real
    // external mastery engine.
  },
};

export const naiveAdaptiveSelector: AdaptiveIncidentSelector = {
  async recommendNext({ completedTemplateSlugs }) {
    // Single-template MVP: there is exactly one fully authored incident
    // (pf-2048) in this build. Once more templates are authored, replace
    // this with a real query against your skill graph / mastery scores.
    if (completedTemplateSlugs.includes("pf-2048")) {
      return { recommendedTemplateSlug: null, reason: "No further templates authored yet in this build." };
    }
    return { recommendedTemplateSlug: "pf-2048", reason: "Only authored template; matches most role/skill targets." };
  },
};
