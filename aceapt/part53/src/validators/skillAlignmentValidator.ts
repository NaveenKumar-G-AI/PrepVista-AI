import { ComputationSpec } from '../domain/computation.js';
import { Issue, QuestionVersion } from '../types/domain.js';
import { IssueSeverity, IssueType } from '../types/enums.js';
import { makeIssue, ValidatorOutcome } from './types.js';

/**
 * Real skill-alignment validation should defer to ACEAPT's canonical skill graph
 * ("Feature 45 is canonical for skill relationships" — section 39). This interface is the
 * integration seam: wire a real implementation in via `createEngine(repo, { skillGraph })` and
 * this validator will use it instead of the tiny fallback table below.
 */
export interface SkillGraphPort {
  /** Return true/false when you know, or undefined to defer to the built-in heuristic fallback. */
  isSkillValidForComputation(skill: string, computationKind: string): boolean | undefined;
}

// Zero-dependency fallback used only when no SkillGraphPort is configured. Intentionally tiny —
// it exists so the validator degrades to "flag for human judgement" instead of doing nothing,
// not to be a real skill taxonomy.
const COMPUTATION_SKILL_HINTS: Partial<Record<ComputationSpec['kind'], string[]>> = {
  PROBABILITY: ['PROBABILITY'],
  PERCENTAGE_OF: ['PERCENTAGE'],
  PERCENTAGE_CHANGE: ['PERCENTAGE'],
  SIMPLE_INTEREST: ['INTEREST', 'PERCENTAGE'],
  RATIO_SHARE: ['RATIO', 'PROPORTION'],
  AVERAGE: ['AVERAGE', 'STATISTICS'],
};

export function validateSkillAlignment(version: QuestionVersion, port?: SkillGraphPort): ValidatorOutcome {
  const issues: Issue[] = [];
  const { skillMapping, computation } = version;

  if (!skillMapping?.primarySkill) {
    issues.push(
      makeIssue(IssueType.SCHEMA_INVALID, IssueSeverity.HIGH, 'Question has no primary skill mapping (section 39).'),
    );
    return { issues };
  }
  if (!computation) return { issues }; // nothing to cross-check the tag against

  const tag = skillMapping.primarySkill.toUpperCase();
  const secondary = (skillMapping.secondarySkills ?? []).map((s) => s.toUpperCase());

  const external = port?.isSkillValidForComputation(skillMapping.primarySkill, computation.kind);
  if (external === false) {
    issues.push(
      makeIssue(
        IssueType.SKILL_MISMATCH,
        IssueSeverity.MEDIUM,
        `Skill graph reports "${skillMapping.primarySkill}" does not align with computation type "${computation.kind}" (section 40).`,
      ),
    );
    return { issues };
  }
  if (external === true) return { issues };

  // No definitive answer from the port (or no port configured) — fall back to the built-in hints.
  const hints = COMPUTATION_SKILL_HINTS[computation.kind];
  if (!hints) return { issues };

  const matches =
    hints.some((h) => tag.includes(h) || h.includes(tag)) || secondary.some((s) => hints.some((h) => s.includes(h)));

  if (!matches) {
    issues.push(
      makeIssue(
        IssueType.SKILL_MISMATCH,
        IssueSeverity.MEDIUM,
        `Tagged skill "${skillMapping.primarySkill}" doesn't match the fallback skill hints for computation type ` +
          `"${computation.kind}" (${hints.join('/')}). No live skill-graph port is connected — verify manually ` +
          'before treating this as confirmed (section 40/148: mismatch is a FLAG, not an auto-block).',
      ),
    );
  }

  return { issues };
}
