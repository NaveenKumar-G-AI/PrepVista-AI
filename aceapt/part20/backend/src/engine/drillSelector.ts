import type { SessionEvidence } from "./analytics.js";

export type DrillType = "selection" | "concept";

export interface DrillChoice {
  type: DrillType;
  concept?: string;
  label: string;
  reason: string;
}

/**
 * Picks the single biggest performance gap from a session's evidence and
 * names the targeted mini-test that addresses it (spec §38's own examples:
 * "Poor question selection → decision-making scenarios", "Slow percentage
 * solving → timed percentage questions"). Deterministic — the same evidence
 * always yields the same drill choice.
 */
export function chooseDrill(evidence: SessionEvidence): DrillChoice {
  if (evidence.selectionQuality === "Weak" || evidence.overinvested.length >= 1) {
    return {
      type: "selection",
      label: "Question-Selection Drill",
      reason: evidence.biggestLeak.text,
    };
  }

  const byConcept = new Map<string, { correct: number; total: number }>();
  for (const p of evidence.perQuestion) {
    if (!p.attempted) continue;
    const cur = byConcept.get(p.concept) ?? { correct: 0, total: 0 };
    cur.total += 1;
    if (p.correct) cur.correct += 1;
    byConcept.set(p.concept, cur);
  }

  let worstConcept: string | null = null;
  let worstAccuracy = Infinity;
  for (const [concept, stat] of byConcept.entries()) {
    const acc = stat.correct / stat.total;
    if (acc < worstAccuracy) {
      worstAccuracy = acc;
      worstConcept = concept;
    }
  }

  if (!worstConcept) {
    return {
      type: "selection",
      label: "Question-Selection Drill",
      reason: "Not enough attempted questions to isolate a weak concept — building general speed and decisiveness instead.",
    };
  }

  return {
    type: "concept",
    concept: worstConcept,
    label: `${worstConcept} Focus Drill`,
    reason: `${worstConcept} was your lowest-accuracy concept this session (${Math.round(worstAccuracy * 100)}%).`,
  };
}
