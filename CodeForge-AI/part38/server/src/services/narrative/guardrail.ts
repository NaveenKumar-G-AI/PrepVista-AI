import { MASTERY_LEVEL_ORDER } from "../../domain/enums";
import type { NarrativeFacts, RawNarrativeResult } from "./ai-client";

export interface GuardrailResult {
  valid: boolean;
  violations: string[];
}

const PROJECT_CLAIM_PATTERNS = [/built (a|an|the) production/i, /shipped (a|an|the) project/i, /completed (a|an|the) project/i];
const INTERVIEW_CLAIM_PATTERNS = [/passed (the|a|an) (technical )?interview/i, /aced (the|a|an) interview/i, /completed (a|an|the) technical interview/i];

/**
 * Brief §37-38, §78: the narrative must never contradict the structured
 * facts it was given. This runs against WHATEVER text is passed in — the
 * unit test feeds it a deliberately contradictory string so the check is
 * exercised deterministically rather than hoping a live model happens to
 * hallucinate on demand.
 */
/**
 * How close (in characters) a mastery-level word has to sit next to a skill
 * mention to be read as describing that skill. Tuned to catch adversarial
 * phrasing like "SQL proficiency is now Advanced" (~25 chars apart) while
 * NOT flagging ordinary prose that mentions two different skills near each
 * other in the same sentence — see the nearest-neighbor assignment below.
 */
const LEVEL_PROXIMITY_CHARS = 50;

export function validateNarrative(text: string, facts: NarrativeFacts): GuardrailResult {
  const violations: string[] = [];
  const lower = text.toLowerCase();

  // Every skill-name occurrence, with position.
  const skillOccurrences: { name: string; level: string; index: number }[] = [];
  for (const skill of facts.skills) {
    const skillLower = skill.name.toLowerCase();
    let from = 0;
    while (true) {
      const idx = lower.indexOf(skillLower, from);
      if (idx === -1) break;
      skillOccurrences.push({ name: skill.name, level: skill.level, index: idx });
      from = idx + skillLower.length;
    }
  }

  // Every mastery-level word occurrence, with position.
  const levelOccurrences: { level: string; index: number }[] = [];
  for (const level of MASTERY_LEVEL_ORDER) {
    const pattern = new RegExp(`\\b${level.toLowerCase()}\\b`, "g");
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(lower)) !== null) {
      levelOccurrences.push({ level, index: match.index });
    }
  }

  // Attribute each level mention to whichever skill mention is textually
  // nearest to it (and within range) — NOT to every skill within range —
  // so two skills mentioned near each other in one sentence don't
  // cross-contaminate each other's checks.
  for (const levelOcc of levelOccurrences) {
    let nearest: { name: string; level: string; index: number } | null = null;
    let nearestDistance = Infinity;
    for (const skillOcc of skillOccurrences) {
      const distance = Math.abs(skillOcc.index - levelOcc.index);
      if (distance <= LEVEL_PROXIMITY_CHARS && distance < nearestDistance) {
        nearest = skillOcc;
        nearestDistance = distance;
      }
    }
    if (nearest && nearest.level !== levelOcc.level) {
      violations.push(
        `Narrative mentions "${nearest.name}" near mastery level "${levelOcc.level}", but the recorded level is "${nearest.level}"`,
      );
    }
  }

  if (!facts.hasProjectEvidence) {
    for (const pattern of PROJECT_CLAIM_PATTERNS) {
      if (pattern.test(text)) {
        violations.push("Narrative claims project work, but no project evidence exists for this student");
        break;
      }
    }
  }

  if (!facts.hasInterviewEvidence) {
    for (const pattern of INTERVIEW_CLAIM_PATTERNS) {
      if (pattern.test(text)) {
        violations.push("Narrative claims a technical interview outcome, but no interview evidence exists for this student");
        break;
      }
    }
  }

  return { valid: violations.length === 0, violations: [...new Set(violations)] };
}

export function validateNarrativeResult(result: RawNarrativeResult, facts: NarrativeFacts): GuardrailResult {
  const combined = [result.executiveSummary, result.strengthsNarrative, result.weaknessesNarrative, result.growthNarrative].join("\n");
  return validateNarrative(combined, facts);
}

/**
 * Deterministic, template-built narrative. Every sentence is constructed
 * directly from `facts`, so it is valid by construction (brief §38: "if AI
 * generation fails, structured report still works").
 */
export function buildFallbackNarrative(facts: NarrativeFacts): RawNarrativeResult {
  const executiveSummary = buildExecutiveSummary(facts);
  const strengthsNarrative =
    facts.strengths.length > 0
      ? `Demonstrated strengths include ${facts.strengths.map((s) => `${s.skill} (${s.title.split("—")[1]?.trim() ?? ""})`).join(", ")}.`
      : "No skill currently has both a high mastery level and strong evidence behind it — this will fill in as more graded work comes in.";
  const weaknessesNarrative =
    facts.weaknesses.length > 0
      ? facts.weaknesses.map((w) => `${w.title}: ${w.impact}. Next step: ${w.recommendedAction}`).join(" ")
      : "No blocking or notable gaps are currently on record for the target role.";
  const growthNarrative = facts.hasGrowthData
    ? "Recent activity shows measurable movement across multiple skills — see the growth timeline for specifics."
    : "Not enough historical activity is on record yet to characterize a growth trend.";

  return { executiveSummary, strengthsNarrative, weaknessesNarrative, growthNarrative };
}

function buildExecutiveSummary(facts: NarrativeFacts): string {
  const parts: string[] = [];
  parts.push(
    facts.overallMastery
      ? `${facts.studentName}'s current overall technical mastery is ${titleCase(facts.overallMastery)}.`
      : `${facts.studentName} does not yet have enough evidence for an overall mastery level.`,
  );
  if (facts.targetRole) {
    parts.push(
      facts.roleReadiness
        ? `Toward the ${facts.targetRole} target, readiness is currently ${titleCase(facts.roleReadiness)}.`
        : `Readiness toward the ${facts.targetRole} target is not yet available.`,
    );
  }
  if (facts.nextBestAction) {
    parts.push(`Recommended next step: ${facts.nextBestAction}.`);
  }
  return parts.join(" ");
}

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ");
}
