import type { CapabilityState, RootCauseFinding, SkillNode } from "@/lib/domain/types";

const WEAK_THRESHOLD = 0.6;
const MIN_ATTEMPTS_FOR_CLAIM = 2;

/**
 * Distinguishes VISIBLE WEAKNESS from POSSIBLE ROOT CAUSE (spec section 27).
 *
 * Two independent checks:
 *   A) For every skill with a prerequisite, if the skill's OVERALL evidence
 *      is weak and the prerequisite is ALSO weak, walks one level further
 *      up the chain (e.g. Profit & Loss -> Percentage Application ->
 *      Percentage Fundamentals) to name the deepest confirmed weak link
 *      rather than stopping at the first one.
 *   B) Independently, if a skill's foundation is solid but its application
 *      specifically lags, that's a *different*, still-valuable finding
 *      (spec section 28) — not about the prerequisite at all.
 *
 * Every narrative uses hedged language ("appears to be", "current evidence
 * suggests") rather than asserting certainty — spec section 47.
 */
export function detectRootCauses(state: CapabilityState, skills: SkillNode[]): RootCauseFinding[] {
  const skillsById = Object.fromEntries(skills.map((s) => [s.id, s]));
  const findings: RootCauseFinding[] = [];

  for (const skill of skills) {
    const skillState = state.skills[skill.id];
    if (!skillState || skillState.attempts.length === 0) continue;

    // Check A — prerequisite chain. Uses OVERALL evidence (not just the
    // application tier): a weak reading anywhere in the skill is reason
    // enough to check whether it traces back to a prerequisite, and a
    // struggling FOUNDATION-tier result is if anything a *stronger* signal
    // to investigate than a struggling APPLICATION-tier one.
    if (skill.prerequisiteSkillId) {
      const overall = skillState.overall;
      const skillIsWeak = overall.attempts >= MIN_ATTEMPTS_FOR_CLAIM && overall.accuracy !== null && overall.accuracy < WEAK_THRESHOLD;

      if (skillIsWeak) {
        const prereqSkill = skillsById[skill.prerequisiteSkillId];
        const prereqState = state.skills[skill.prerequisiteSkillId];
        const prereqIsWeak =
          prereqState &&
          prereqState.overall.attempts >= MIN_ATTEMPTS_FOR_CLAIM &&
          prereqState.overall.accuracy !== null &&
          prereqState.overall.accuracy < WEAK_THRESHOLD;

        if (prereqSkill && prereqIsWeak) {
          // Walk one level further: is the prerequisite's own prerequisite also weak?
          let deepestSkill = prereqSkill;
          let deepestState = prereqState!;
          if (prereqSkill.prerequisiteSkillId) {
            const grandparentSkill = skillsById[prereqSkill.prerequisiteSkillId];
            const grandparentState = state.skills[prereqSkill.prerequisiteSkillId];
            const grandparentIsWeak =
              grandparentState &&
              grandparentState.overall.attempts >= MIN_ATTEMPTS_FOR_CLAIM &&
              grandparentState.overall.accuracy !== null &&
              grandparentState.overall.accuracy < WEAK_THRESHOLD;
            if (grandparentSkill && grandparentIsWeak) {
              deepestSkill = grandparentSkill;
              deepestState = grandparentState!;
            }
          }

          findings.push({
            skillId: skill.id,
            skillName: skill.displayName,
            relatedSkillId: deepestSkill.id,
            relatedSkillName: deepestSkill.displayName,
            narrative: `Your ${skill.displayName} performance appears to be affected by ${deepestSkill.displayName} rather than the ${skill.displayName} concept itself.`,
            confidence: deepestState.overall.attempts >= 3 ? "MODERATE" : "LOW",
          });
        }
      }
    }

    // Check B — foundation-vs-application within the SAME skill (spec
    // section 28). Independent of check A: this fires whenever foundation
    // is solid but application specifically lags, regardless of whether a
    // prerequisite issue was also found.
    if (
      skillState.foundation.attempts >= MIN_ATTEMPTS_FOR_CLAIM &&
      skillState.foundation.accuracy !== null &&
      skillState.foundation.accuracy >= 0.8 &&
      skillState.application.attempts >= MIN_ATTEMPTS_FOR_CLAIM &&
      skillState.application.accuracy !== null &&
      skillState.application.accuracy < WEAK_THRESHOLD
    ) {
      findings.push({
        skillId: skill.id,
        skillName: skill.displayName,
        relatedSkillId: null,
        relatedSkillName: null,
        narrative: `Your ${skill.displayName} fundamentals look solid, but current evidence suggests applying them in varied or multi-step scenarios is still developing.`,
        confidence: "MODERATE",
      });
    }
  }

  return findings;
}
