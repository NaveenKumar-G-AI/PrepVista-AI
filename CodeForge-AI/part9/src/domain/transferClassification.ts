export interface ProblemSkillTag {
  problemId: string;
  skillId: string;
  /** Whether this skill is the pattern surfaced to the student (title, category, hint text). */
  isPrimaryTag: boolean;
}

/**
 * PHASE 14: transfer evidence means the student recognized which skill
 * applied WITHOUT being told. If the skill being evaluated is the one
 * explicitly surfaced to the student, it is NOT transfer no matter how
 * well they did — that's ordinary independent practice, which is still
 * valuable evidence, just not transfer evidence.
 */
export function isTransferEvidence(
  skillId: string,
  problemId: string,
  tags: ProblemSkillTag[],
  sessionMode: string
): boolean {
  if (sessionMode !== 'TRANSFER' && sessionMode !== 'VERIFICATION') return false;
  const tag = tags.find((t) => t.problemId === problemId && t.skillId === skillId);
  if (!tag) return false;
  return tag.isPrimaryTag === false;
}
